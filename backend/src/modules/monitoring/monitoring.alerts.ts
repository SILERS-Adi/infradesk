import prisma from '../../lib/prisma';
import { sendMail, emailTemplate, emailHeading, emailText, emailInfoBox } from '../../lib/mailer';

/**
 * Check metrics after update and create alerts if thresholds exceeded.
 * Called from agent.service.ts after updateMetrics.
 */
export async function checkAndCreateAlerts(agentId: string, workspaceId: string, serverMetrics: any) {
  if (!serverMetrics || !workspaceId) return;

  const alerts: { type: string; severity: string; message: string }[] = [];
  const agent = await prisma.agentRegistration.findUnique({
    where: { id: agentId },
    select: { hostname: true },
  });
  const hostname = agent?.hostname || agentId.slice(0, 8);

  // 1. Audit score drop below 50
  if (serverMetrics.securityAudit?.score != null && serverMetrics.securityAudit.score < 50) {
    alerts.push({
      type: 'score_drop',
      severity: 'critical',
      message: `Wynik audytu bezpieczenstwa ${hostname}: ${serverMetrics.securityAudit.score}/100 — ponizej progu 50`,
    });
  }

  // 2. Critical audit failures
  if (serverMetrics.securityAudit?.checks) {
    const critFails = serverMetrics.securityAudit.checks.filter(
      (c: any) => c.status === 'fail' && c.severity === 'critical'
    );
    if (critFails.length >= 3) {
      alerts.push({
        type: 'critical_fail',
        severity: 'high',
        message: `${hostname}: ${critFails.length} krytycznych bledow bezpieczenstwa (${critFails.map((c: any) => c.name).join(', ')})`,
      });
    }
  }

  // 3. Disk failing
  if (serverMetrics.smartDisks) {
    for (const d of serverMetrics.smartDisks) {
      const h = d.health?.toLowerCase();
      if (h && h !== 'healthy' && h !== 'ok') {
        alerts.push({
          type: 'disk_failing',
          severity: 'critical',
          message: `${hostname}: dysk ${d.name} w stanie ${d.health} — ryzyko utraty danych!`,
        });
      }
    }
  }

  // 4. Critical services down
  if (serverMetrics.services) {
    const criticalServices = ['wuauserv', 'Dhcp', 'Dnscache', 'Spooler'];
    const downCritical = serverMetrics.services.filter(
      (s: any) => s.status !== 'Running' && criticalServices.includes(s.name)
    );
    if (downCritical.length > 0) {
      alerts.push({
        type: 'service_down',
        severity: 'high',
        message: `${hostname}: zatrzymane uslugi krytyczne: ${downCritical.map((s: any) => s.displayName || s.name).join(', ')}`,
      });
    }
  }

  // 5. Security-specific alerts from individual audit checks
  if (serverMetrics.securityAudit?.checks) {
    const checkById = new Map<string, any>(
      serverMetrics.securityAudit.checks.map((c: any) => [c.id, c])
    );
    const failed = (id: string) => checkById.get(id)?.status === 'fail';

    if (failed('firewall')) {
      alerts.push({
        type: 'firewall_off',
        severity: 'critical',
        message: `${hostname}: Firewall Windows WYŁĄCZONY — narażenie na atak sieciowy!`,
      });
    }
    if (failed('defender')) {
      alerts.push({
        type: 'defender_off',
        severity: 'critical',
        message: `${hostname}: Windows Defender WYŁĄCZONY — brak ochrony przed malware!`,
      });
    }
    if (failed('smb1')) {
      alerts.push({
        type: 'smb1_enabled',
        severity: 'critical',
        message: `${hostname}: SMBv1 WŁĄCZONY — podatność na ransomware (EternalBlue/WannaCry)!`,
      });
    }
    if (failed('admin_count')) {
      const detail = checkById.get('admin_count')?.detail || '';
      alerts.push({
        type: 'too_many_admins',
        severity: 'high',
        message: `${hostname}: nadmiarowi administratorzy (${detail}) — zweryfikuj grupę Administrators`,
      });
    }
    if (failed('guest')) {
      alerts.push({
        type: 'guest_enabled',
        severity: 'high',
        message: `${hostname}: konto Guest AKTYWNE — natychmiast wyłączyć`,
      });
    }
    if (failed('defender_defs')) {
      const detail = checkById.get('defender_defs')?.detail || '';
      alerts.push({
        type: 'defender_outdated',
        severity: 'high',
        message: `${hostname}: definicje antywirusa nieaktualne (${detail})`,
      });
    }
  }

  // 6b. Security events — failed logins, new users, admin group add, RDP new IP, USB
  const se = serverMetrics.securityEvents;
  if (se) {
    if (typeof se.failedLogins === 'number' && se.failedLogins > 5) {
      alerts.push({
        type: 'failed_logins',
        severity: se.failedLogins > 20 ? 'critical' : 'high',
        message: `${hostname}: ${se.failedLogins} nieudanych prób logowania w ostatniej dobie — możliwy brute-force`,
      });
    }
    if (Array.isArray(se.newAdmins) && se.newAdmins.length > 0) {
      const accs = se.newAdmins.map((u: any) => u.account).join(', ');
      alerts.push({
        type: 'new_admin',
        severity: 'critical',
        message: `${hostname}: dodano konto do grupy Administratorzy: ${accs}`,
      });
    }
    if (Array.isArray(se.newUsers) && se.newUsers.length > 0) {
      const accs = se.newUsers.map((u: any) => u.account).join(', ');
      alerts.push({
        type: 'new_user',
        severity: 'high',
        message: `${hostname}: utworzono nowe konta lokalne: ${accs}`,
      });
    }
    if (Array.isArray(se.rdpNewIp) && se.rdpNewIp.length > 0) {
      const ips = se.rdpNewIp.map((r: any) => r.ip).join(', ');
      alerts.push({
        type: 'rdp_new_ip',
        severity: 'high',
        message: `${hostname}: logowanie RDP z nowego IP: ${ips}`,
      });
    }
    if (Array.isArray(se.usbDevices) && se.usbDevices.length > 0) {
      alerts.push({
        type: 'usb_connected',
        severity: 'medium',
        message: `${hostname}: podłączono nowe urządzenie USB (${se.usbDevices.length} zdarzeń)`,
      });
    }
  }

  // 6d. Nowe urządzenia w LAN
  const ns = serverMetrics.networkScan;
  if (ns && Array.isArray(ns.newDevices) && ns.newDevices.length > 0) {
    const preview = ns.newDevices.slice(0, 5)
      .map((d: any) => `${d.ip}/${d.mac}${d.hostname ? ` (${d.hostname})` : ''}`).join(', ');
    alerts.push({
      type: 'new_lan_device',
      severity: 'medium',
      message: `${hostname}: wykryto ${ns.newDevices.length} nowych urządzeń w LAN: ${preview}${ns.newDevices.length > 5 ? '…' : ''}`,
    });
  }

  // 6c. Screen lock — flagged = user left PC unlocked and idle
  const sl = serverMetrics.screenLock;
  if (sl?.flagged) {
    const minutes = Math.round((sl.idleSeconds || 0) / 60);
    alerts.push({
      type: 'unlocked_idle',
      severity: 'medium',
      message: `${hostname}: odblokowany komputer bezczynny od ${minutes} min — ryzyko dostępu przez osoby trzecie`,
    });
  }

  // 6. Critical Event Log patterns — BSOD, WHEA hardware errors
  if (Array.isArray(serverMetrics.criticalEvents)) {
    const bsodEvents = serverMetrics.criticalEvents.filter((e: any) => {
      const src = (e.source || '').toLowerCase();
      return src.includes('bugcheck') || src.includes('kernel-power') || src.includes('whea');
    });
    if (bsodEvents.length > 0) {
      const first = bsodEvents[0];
      alerts.push({
        type: 'bsod_or_hw',
        severity: 'critical',
        message: `${hostname}: błąd krytyczny systemu (${first.source}) — ${bsodEvents.length} zdarzeń w ostatniej dobie`,
      });
    }
  }

  if (alerts.length === 0) return;

  // Deduplicate — don't create alert if same type+agent exists unresolved in last 6h
  const sixHoursAgo = new Date(Date.now() - 6 * 3600000);
  for (const alert of alerts) {
    const existing = await prisma.monitoringAlert.findFirst({
      where: {
        agentRegId: agentId,
        type: alert.type,
        resolved: false,
        createdAt: { gte: sixHoursAgo },
      },
    });
    if (existing) continue;

    await prisma.monitoringAlert.create({
      data: {
        workspaceId,
        agentRegId: agentId,
        ...alert,
      },
    });

    // Send email alert (non-blocking)
    sendAlertEmail(workspaceId, alert, hostname).catch(() => {});
  }
}

async function sendAlertEmail(workspaceId: string, alert: { type: string; severity: string; message: string }, hostname: string) {
  // Find workspace admin emails
  const members = await prisma.workspaceMembership.findMany({
    where: { workspaceId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
    include: { user: { select: { email: true } } },
  });
  const emails = members.map(m => m.user.email).filter(Boolean);
  if (emails.length === 0) return;

  const severityLabel = alert.severity === 'critical' ? 'KRYTYCZNY' : alert.severity === 'high' ? 'WYSOKI' : 'SREDNI';
  const subject = `[InfraDesk Alert] ${severityLabel}: ${hostname}`;

  const html = emailTemplate(`
    ${emailHeading(`Alert monitoringu — ${severityLabel}`)}
    ${emailText(alert.message)}
    ${emailInfoBox(`Typ: ${alert.type} | Agent: ${hostname}`)}
    ${emailText('Zaloguj sie do InfraDesk aby sprawdzic szczegoly i rozwiazac alert.')}
  `);

  for (const email of emails) {
    await sendMail(email, subject, html).catch(() => {});
  }
}
