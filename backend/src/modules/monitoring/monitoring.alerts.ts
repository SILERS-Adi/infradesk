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
