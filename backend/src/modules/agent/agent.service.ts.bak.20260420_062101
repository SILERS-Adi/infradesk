import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logActivity } from '../../utils/activityLogger';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { RegisterInput, MetricsInput, AgentTicketInput, ApproveInput } from './agent.validation';
import { notifyAgent } from '../../utils/websocket';
import { sendPushToRole } from '../../lib/webpush';

/** Wyciąga główny MAC (pierwsza fizyczna karta z adresem MAC). */
function primaryMac(networkIfaces: any[]): string | undefined {
  if (!Array.isArray(networkIfaces)) return undefined;
  const skip = ['loopback', 'lo', 'virtual', 'vmware', 'vethernet', 'docker'];
  const iface = networkIfaces.find(i =>
    i.mac &&
    i.mac !== '00:00:00:00:00:00' &&
    !skip.some(s => (i.name ?? '').toLowerCase().includes(s))
  );
  return iface?.mac?.toLowerCase() ?? undefined;
}

/** Skrótowy opis OS z danych agenta. */
function osLabel(data: Partial<RegisterInput & MetricsInput>): string | undefined {
  return [(data as any).osInfo, (data as any).windowsVersion]
    .filter(Boolean).join(' ').trim() || undefined;
}

/**
 * Szuka istniejącego urządzenia wg priorytetu:
 *   1. Numer seryjny BIOS
 *   2. Adres MAC głównej karty sieciowej
 * Jeśli nie znajdzie — tworzy nowe i zwraca jego id.
 */
async function resolveDevice(
  workspaceId: string,
  locationId: string,
  data: Partial<RegisterInput & MetricsInput>
): Promise<string> {
  const serial   = (data as any).serialNumber as string | undefined;
  const mac      = primaryMac((data as any).networkIfaces ?? []);
  const hostname = (data as any).hostname as string | undefined;
  const osInfo   = osLabel(data);
  const commonUpdate = {
    hostname,
    ipAddress:       (data as any).ipAddress,
    operatingSystem: osInfo,
    rustdeskId:      (data as any).rustdeskId  ?? undefined,
    anydeskId:       (data as any).anydeskId   ?? undefined,
    teamviewerId:    (data as any).teamviewerId ?? undefined,
    macAddress:      mac,
  };

  // 1) Szukaj po numerze seryjnym (globalna unikalność)
  const BOGUS_SERIALS = ['to be filled by o.e.m.', 'default string', '0', 'none', 'not specified'];
  const validSerial = serial && !BOGUS_SERIALS.includes(serial.toLowerCase()) ? serial : undefined;

  if (validSerial) {
    const bySerial = await prisma.device.findFirst({ where: { workspaceId, serialNumber: validSerial } });
    if (bySerial) {
      await prisma.device.update({ where: { id: bySerial.id }, data: commonUpdate });
      return bySerial.id;
    }
  }

  // 2) Szukaj po MAC adresie
  if (mac) {
    const byMac = await prisma.device.findFirst({ where: { workspaceId, macAddress: mac } });
    if (byMac) {
      await prisma.device.update({ where: { id: byMac.id }, data: { ...commonUpdate, serialNumber: validSerial } });
      return byMac.id;
    }
  }

  // 3) Utwórz nowe urządzenie
  const device = await prisma.device.create({
    data: {
      workspaceId,
      locationId,
      name:            hostname ?? `Komputer ${new Date().toLocaleDateString('pl-PL')}`,
      serialNumber:    validSerial,
      macAddress:      mac,
      hostname,
      ipAddress:       (data as any).ipAddress,
      operatingSystem: osInfo,
      rustdeskId:      (data as any).rustdeskId  ?? undefined,
      anydeskId:       (data as any).anydeskId   ?? undefined,
      teamviewerId:    (data as any).teamviewerId ?? undefined,
      status:          'ACTIVE',
    },
  });
  return device.id;
}

function hardwareFields(data: Partial<RegisterInput & MetricsInput>) {
  return {
    hostname:          data.hostname,
    ipAddress:         data.ipAddress,
    osInfo:            data.osInfo,
    windowsVersion:    data.windowsVersion,
    domain:            data.domain,
    currentUser:       data.currentUser,
    serialNumber:      (data as any).serialNumber,
    cpuModel:          data.cpuModel,
    cpuCores:          data.cpuCores,
    cpuThreads:        (data as any).cpuThreads,
    ramTotalGb:        data.ramTotalGb,
    gpuModel:          (data as any).gpuModel,
    motherboard:       (data as any).motherboard,
    rustdeskId:        (data as any).rustdeskId,
    lastBootTime:      data.lastBootTime,
    cpuUsage:          data.cpuUsage,
    ramUsage:          data.ramUsage,
    diskFree:          data.diskFree,
    diskTotal:         data.diskTotal,
    cpuTempC:          (data as any).cpuTempC,
    diskInfo:          data.diskInfo          as any,
    networkIfaces:     data.networkIfaces     as any,
    installedSoftware: data.installedSoftware as any,
    serverMetrics:     (data as any).serverMetrics ?? undefined,
    appVersion:        (data as any).appVersion,
  };
}

export async function registerAgent(data: RegisterInput) {
  // Security: use crypto.randomBytes instead of UUID for agent tokens
  const crypto = require('crypto');
  const token = crypto.randomBytes(48).toString('hex');

  // ── Resolve workspace from workspaceKey ──────────────────────────────────────
  let workspaceId: string | undefined;
  if (data.tenantKey) {
    const workspace = await prisma.workspace.findUnique({
      where: { workspaceKey: data.tenantKey },
      select: { id: true, isActive: true },
    });
    if (!workspace) throw new AppError('Invalid workspace key', 400);
    if (!workspace.isActive) throw new AppError('Workspace is inactive', 403);
    workspaceId = workspace.id;
  }

  // ── Logowanie istniejącego użytkownika (email + hasło) ──────────────────────
  if (data.email && data.password && !data.companyName && !data.nip) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user || !user.isActive) throw new AppError('Invalid credentials', 401);
    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) throw new AppError('Invalid credentials', 401);

    // Find workspace for user if not provided
    if (!workspaceId) {
      const membership = await prisma.workspaceMembership.findFirst({
        where: { userId: user.id },
        select: { workspaceId: true },
      });
      if (membership) workspaceId = membership.workspaceId;
    }
    if (!workspaceId) throw new AppError('User not linked to a workspace', 400);

    // Identyfikuj urządzenie: najpierw po deviceId z config.json, potem serial/MAC
    let deviceId: string | undefined;
    const knownDeviceId = (data as any).deviceId as string | undefined;
    if (knownDeviceId) {
      const known = await prisma.device.findFirst({
        where: { id: knownDeviceId, workspaceId },
      });
      if (known) {
        deviceId = known.id;
        await prisma.device.update({
          where: { id: known.id },
          data: {
            hostname:        (data as any).hostname,
            ipAddress:       (data as any).ipAddress,
            operatingSystem: osLabel(data),
            rustdeskId:      (data as any).rustdeskId  ?? undefined,
            anydeskId:       (data as any).anydeskId   ?? undefined,
            teamviewerId:    (data as any).teamviewerId ?? undefined,
            macAddress:      primaryMac((data as any).networkIfaces ?? []),
          },
        });
      }
    }
    if (!deviceId) {
      let location = await prisma.location.findFirst({
        where: { workspaceId },
        select: { id: true },
      });
      if (!location) {
        const created = await prisma.location.create({
          data: {
            workspaceId,
            name:         'Główna siedziba',
            type:         'OFFICE',
            addressLine1: '-',
            postalCode:   '00-000',
            city:         'Nieznane',
          },
        });
        location = { id: created.id };
      }
      deviceId = await resolveDevice(workspaceId, location.id, data);
    }

    // Szukaj istniejącej rejestracji — po hostname+workspace lub serial lub MAC
    const hostname = (data as any).hostname as string | undefined;
    const serial   = (data as any).serialNumber as string | undefined;
    const mac      = primaryMac((data as any).networkIfaces ?? []);

    let existingReg = null as any;

    // 1) Po deviceId (ten sam komputer, reinstalacja)
    if (deviceId) {
      existingReg = await prisma.agentRegistration.findFirst({
        where: { workspaceId, deviceId },
      });
    }
    // 2) Po hostname + workspace
    if (!existingReg && hostname) {
      existingReg = await prisma.agentRegistration.findFirst({
        where: { workspaceId, hostname },
      });
    }
    // 3) Po serialNumber
    if (!existingReg && serial) {
      existingReg = await prisma.agentRegistration.findFirst({
        where: { workspaceId, serialNumber: serial },
      });
    }
    // 4) Po MAC — szukaj przez powiązane urządzenie
    if (!existingReg && mac) {
      const devByMac = await prisma.device.findFirst({
        where: { workspaceId, macAddress: mac },
        select: { id: true },
      });
      if (devByMac) {
        existingReg = await prisma.agentRegistration.findFirst({
          where: { workspaceId, deviceId: devByMac.id },
        });
      }
    }

    if (existingReg) {
      // Reuse existing registration — update token and data
      await prisma.agentRegistration.update({
        where: { id: existingReg.id },
        data: {
          agentToken: token,
          status: 'ACTIVE',
          workspaceId,
          deviceId: deviceId ?? existingReg.deviceId,
          ...hardwareFields(data),
        },
      });
    } else {
      // Create new registration only if no match found
      await prisma.agentRegistration.create({
        data: {
          agentToken: token,
          agentType:  (data as any).agentType || 'CLIENT',
          status:     'ACTIVE',
          workspaceId,
          deviceId,
          allowMonitoring: true,
          allowRustdesk:   true,
          ...hardwareFields(data),
        },
      });
    }

    // Auto-assign user to device
    if (deviceId && user.id) {
      await prisma.device.update({
        where: { id: deviceId },
        data: { assignedUserId: user.id },
      }).catch(() => {});
    }

    return { token, status: 'ACTIVE', deviceId };
  }

  // ── Rejestracja nowego urządzenia (formularz) ────────────────────────────
  const nip = data.nip?.replace(/[-\s]/g, '') ?? undefined;

  // Zahashuj hasło żeby można było stworzyć użytkownika przy approve
  let contactPasswordHash: string | undefined;
  if (data.password) {
    const { validatePassword } = await import('../../utils/passwordPolicy');
    validatePassword(data.password);
    contactPasswordHash = await bcrypt.hash(data.password, 10);
  }

  const reg = await prisma.agentRegistration.create({
    data: {
      agentToken:           token,
      agentType:            (data as any).agentType || 'CLIENT',
      status:               'PENDING',
      workspaceId,
      nip,
      companyName:          data.companyName,
      contactFirstName:     data.contactFirstName,
      contactLastName:      data.contactLastName,
      contactPhone:         data.contactPhone,
      contactEmail:         data.contactEmail,
      contactPasswordHash,
      registrationNotes:    data.registrationNotes,
      allowRustdesk:        data.allowRustdesk  ?? true,
      allowMonitoring:      data.allowMonitoring ?? true,
      ...hardwareFields(data),
    },
  });

  // Push notification do adminów/techników o nowej rejestracji
  sendPushToRole('ADMIN', {
    title: 'Nowy agent do akceptacji',
    body: `${data.hostname ?? 'Nowe urządzenie'}`,
    url: '/agents',
  }).catch(() => {});
  sendPushToRole('TECHNICIAN', {
    title: 'Nowy agent do akceptacji',
    body: `${data.hostname ?? 'Nowe urządzenie'}`,
    url: '/agents',
  }).catch(() => {});

  return { token, status: 'PENDING', registrationId: reg.id };
}

export async function updateMetrics(token: string, data: MetricsInput) {
  const reg = await prisma.agentRegistration.findUnique({ where: { agentToken: token } });
  if (!reg) throw new AppError('Agent not found', 404);
  // Security: PENDING agents can only report status — no device creation or data updates
  if (reg.status === 'REJECTED') throw new AppError('Agent rejected', 403);

  // Auto-create device if agent is ACTIVE with workspaceId but missing deviceId
  if (!reg.deviceId && reg.workspaceId && reg.status === 'ACTIVE') {
    const location = await prisma.location.findFirst({
      where: { workspaceId: reg.workspaceId },
      select: { id: true },
    });
    if (location) {
      const deviceId = await resolveDevice(reg.workspaceId, location.id, { ...data, ...reg } as any);
      await prisma.agentRegistration.update({ where: { id: reg.id }, data: { deviceId } });
      reg.deviceId = deviceId;
    }
  }

  // Aktualizuj device jeśli znane — zapisuj ID narzędzi zdalnych
  if (reg.deviceId) {
    const remoteUpdate: Record<string, unknown> = {};
    if ((data as any).rustdeskId)   remoteUpdate.rustdeskId   = (data as any).rustdeskId;
    if ((data as any).anydeskId)    remoteUpdate.anydeskId    = (data as any).anydeskId;
    if ((data as any).teamviewerId) remoteUpdate.teamviewerId = (data as any).teamviewerId;
    if (Object.keys(remoteUpdate).length > 0) {
      await prisma.device.update({ where: { id: reg.deviceId }, data: remoteUpdate });
    }
  }

  const updated = await prisma.agentRegistration.update({
    where: { agentToken: token },
    data: {
      lastSeen: new Date(),
      ...hardwareFields(data),
    },
  });

  // Save metrics snapshots for history (non-blocking)
  const sm = (data as any).serverMetrics;
  if (sm && reg.id) {
    const snapshots: { agentRegId: string; type: string; data: any; score?: number }[] = [];
    if (sm.securityAudit) {
      snapshots.push({ agentRegId: reg.id, type: 'audit', data: sm.securityAudit, score: sm.securityAudit.score });
    }
    if (sm.networkScan) {
      snapshots.push({ agentRegId: reg.id, type: 'network', data: sm.networkScan });
    }
    if (sm.smartDisks || sm.services || sm.criticalEvents) {
      snapshots.push({ agentRegId: reg.id, type: 'health', data: { smartDisks: sm.smartDisks, services: sm.services, criticalEvents: sm.criticalEvents } });
    }
    if (snapshots.length) {
      prisma.metricsSnapshot.createMany({ data: snapshots }).catch(() => {});
    }

    // Check for alert conditions (non-blocking)
    if (reg.workspaceId) {
      import('../monitoring/monitoring.alerts').then(m =>
        m.checkAndCreateAlerts(reg.id, reg.workspaceId!, sm)
      ).catch(() => {});
    }
  }

  return updated;
}

export async function createAgentTicket(token: string, data: AgentTicketInput) {
  const reg = await prisma.agentRegistration.findUnique({
    where: { agentToken: token },
    include: { device: { select: { locationId: true } } },
  });

  if (!reg || reg.status !== 'ACTIVE' || !reg.workspaceId) {
    throw new AppError('Agent not active or not linked to workspace', 403);
  }

  // ── Deduplication: skip if an open ticket with the same title exists for this agent ──
  const existingTicket = await prisma.ticket.findFirst({
    where: {
      workspaceId: reg.workspaceId!,
      deviceId: reg.deviceId ?? undefined,
      source: 'AGENT' as any,
      title: data.title,
      status: { in: ['NEW', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CLIENT'] },
    },
    select: { id: true, ticketNumber: true },
  });

  if (existingTicket) {
    return existingTicket;
  }

  let location: { id: string } | null = reg.device?.locationId
    ? { id: reg.device.locationId }
    : await prisma.location.findFirst({ where: { workspaceId: reg.workspaceId! }, select: { id: true } });

  if (!location) {
    // Brak lokalizacji — utwórz domyślną żeby zgłoszenie mogło powstać
    const created = await prisma.location.create({
      data: {
        workspaceId:  reg.workspaceId!,
        name:         'Główna siedziba',
        type:         'OFFICE',
        addressLine1: '-',
        postalCode:   '00-000',
        city:         'Nieznane',
      },
    });
    location = { id: created.id };
  }

  const admin = await prisma.user.findFirst({ where: { isActive: true } });
  if (!admin) throw new AppError('No admin configured', 500);

  const count  = await prisma.ticket.count();
  const ticketNumber = `T-${String(count + 1).padStart(4, '0')}`;

  // Best available name: contact name > Windows user > hostname
  const contactName = [reg.contactFirstName, reg.contactLastName].filter(Boolean).join(' ');
  const reporterName = contactName || reg.currentUser || reg.hostname || 'Agent';

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      workspaceId:     reg.workspaceId!,
      locationId:      location.id,
      deviceId:        reg.deviceId ?? undefined,
      createdByUserId: admin.id,
      type:            'INCIDENT',
      priority:        (data.priority ?? 'MEDIUM') as any,
      status:          'PENDING',
      source:          'AGENT' as any,
      title:           data.title,
      description:     data.description ?? '',
      dueAt:           data.dueAt ? new Date(data.dueAt) : undefined,
      reportedAt:      new Date(),
      reporterName:    reporterName,
      reporterPhone:   reg.contactPhone ?? undefined,
    },
  });

  notifyAgent(reg.agentToken, {
    type:  'notification',
    title: 'Nowe zgłoszenie',
    body:  `Zgłoszenie ${ticketNumber} zostało utworzone przez administratora.`,
  });

  return ticket;
}

export async function getAllRegistrations(params: {
  workspaceId?: string | null;
  workspaceIds?: string[];
  scopeFilter?: Record<string, unknown>;
  includePendingUnassigned?: boolean;
}) {
  const { workspaceId, workspaceIds, scopeFilter, includePendingUnassigned } = params;
  const where: Record<string, unknown> = {};

  if (workspaceIds && workspaceIds.length > 0) {
    if (includePendingUnassigned) {
      // MSP: show agents from client workspaces + PENDING agents without workspace
      where.OR = [
        { workspaceId: { in: workspaceIds } },
        { workspaceId: null, status: 'PENDING' },
      ];
    } else {
      where.workspaceId = { in: workspaceIds };
    }
  } else if (workspaceId) {
    where.workspaceId = workspaceId;
  }

  if (scopeFilter && Object.keys(scopeFilter).length > 0) {
    where.AND = [...((where.AND as any[]) || []), scopeFilter];
  }

  return prisma.agentRegistration.findMany({
    where,
    include: {
      device: { select: { id: true, name: true, locationId: true } },
    },
    orderBy: [{ status: 'asc' }, { hostname: 'asc' }],
  });
}

export async function getAuditOverview(workspaceId?: string | null) {
  const where: any = { status: 'ACTIVE' };
  if (workspaceId) where.workspaceId = workspaceId;

  const agents = await prisma.agentRegistration.findMany({
    where,
    select: {
      id: true,
      hostname: true,
      ipAddress: true,
      agentType: true,
      cpuUsage: true,
      ramUsage: true,
      diskFree: true,
      diskTotal: true,
      serverMetrics: true,
      lastSeen: true,
      appVersion: true,
    },
    orderBy: { hostname: 'asc' },
  });

  return agents;
}

export async function approveRegistration(id: string, data: ApproveInput, performedByUserId?: string) {
  const reg = await prisma.agentRegistration.findUnique({ where: { id } });
  if (!reg) throw new AppError('Registration not found', 404);

  // Use workspaceId from request data or fall back to registration's workspace
  const effectiveWorkspaceId = data.workspaceId ?? reg.workspaceId;
  if (!effectiveWorkspaceId) throw new AppError('Brak workspace — przypisz workspace', 400);

  // Upewnij się że workspace ma co najmniej jedną lokalizację (wymaganą przez Device)
  let location = await prisma.location.findFirst({ where: { workspaceId: effectiveWorkspaceId }, select: { id: true } });
  if (!location) {
    const created = await prisma.location.create({
      data: {
        workspaceId: effectiveWorkspaceId,
        name:         'Główna siedziba',
        type:         'OFFICE',
        addressLine1: '-',
        postalCode:   '00-000',
        city:         'Nieznane',
      },
    });
    location = { id: created.id };
  }

  // Auto-create or find device using serial/MAC priority
  let deviceId = data.deviceId ?? reg.deviceId ?? undefined;
  if (!deviceId) {
    deviceId = await resolveDevice(effectiveWorkspaceId, location.id, {
      hostname:       reg.hostname       ?? undefined,
      ipAddress:      reg.ipAddress      ?? undefined,
      osInfo:         reg.osInfo         ?? undefined,
      windowsVersion: reg.windowsVersion ?? undefined,
      serialNumber:   reg.serialNumber   ?? undefined,
      rustdeskId:     reg.rustdeskId     ?? undefined,
      networkIfaces:  reg.networkIfaces as any ?? [],
    } as any);
  }

  // Utwórz konto użytkownika jeśli mamy e-mail + hasło i konto jeszcze nie istnieje
  if (reg.contactEmail && reg.contactPasswordHash) {
    const existing = await prisma.user.findUnique({ where: { email: reg.contactEmail } });
    if (!existing) {
      const newUser = await prisma.user.create({
        data: {
          firstName:    reg.contactFirstName ?? 'Użytkownik',
          lastName:     reg.contactLastName  ?? '',
          email:        reg.contactEmail,
          phone:        reg.contactPhone     ?? undefined,
          passwordHash: reg.contactPasswordHash,
          isActive:     true,
        },
      });
      // Add user to workspace
      await prisma.workspaceMembership.create({
        data: { workspaceId: effectiveWorkspaceId, userId: newUser.id, role: 'MEMBER' },
      }).catch(() => {});
    }
  }

  const updated = await prisma.agentRegistration.update({
    where: { id },
    data: { status: 'ACTIVE', workspaceId: effectiveWorkspaceId, deviceId },
  });

  notifyAgent(reg.agentToken, {
    type:  'notification',
    title: 'Urządzenie zatwierdzone!',
    body:  `Twoje urządzenie zostało aktywowane.`,
  });

  if (performedByUserId) {
    await logActivity(prisma, {
      entityType: 'AgentRegistration', entityId: id, actionType: 'APPROVE',
      description: `Agent "${reg.hostname ?? id}" approved (workspace=${effectiveWorkspaceId})`,
      performedByUserId, workspaceId: effectiveWorkspaceId,
    }).catch(() => {});
  }

  return updated;
}

export async function approveRegistrationWithNewClient(id: string, clientData: {
  name: string; taxId?: string; phone?: string; email?: string;
  addressLine1?: string; postalCode?: string; city?: string;
}, performedByUserId?: string) {
  const reg = await prisma.agentRegistration.findUnique({ where: { id } });
  if (!reg) throw new AppError('Registration not found', 404);

  // Create a new workspace for the client
  const workspace = await prisma.workspace.create({
    data: {
      name:         clientData.name,
      slug:         clientData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      type:         'COMPANY',
      taxId:        clientData.taxId    || undefined,
      phone:        clientData.phone    || undefined,
      email:        clientData.email    || undefined,
      addressLine1: clientData.addressLine1 || '-',
      postalCode:   clientData.postalCode   || '00-000',
      city:         clientData.city         || clientData.name,
    },
  });

  // Przekaż do standardowego approve (stworzy lokalizację + device)
  return approveRegistration(id, { workspaceId: workspace.id }, performedByUserId);
}

export async function deleteRegistration(id: string, performedByUserId?: string) {
  const reg = await prisma.agentRegistration.findUnique({ where: { id } });
  if (!reg) throw new AppError('Registration not found', 404);

  await prisma.agentRegistration.delete({ where: { id } });

  if (performedByUserId) {
    await logActivity(prisma, {
      entityType: 'AgentRegistration', entityId: id, actionType: 'DELETE',
      description: `Agent "${reg.hostname ?? id}" deleted`,
      performedByUserId, workspaceId: reg.workspaceId ?? undefined,
    }).catch(() => {});
  }
}
