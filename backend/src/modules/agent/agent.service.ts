import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { RegisterInput, MetricsInput, AgentTicketInput, ApproveInput } from './agent.validation';
import { notifyAgent } from '../../utils/websocket';

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
  clientId: string,
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
    rustdeskId:      (data as any).rustdeskId ?? undefined,
    macAddress:      mac,
  };

  // 1) Szukaj po numerze seryjnym (globalna unikalność)
  const BOGUS_SERIALS = ['to be filled by o.e.m.', 'default string', '0', 'none', 'not specified'];
  const validSerial = serial && !BOGUS_SERIALS.includes(serial.toLowerCase()) ? serial : undefined;

  if (validSerial) {
    const bySerial = await prisma.device.findFirst({ where: { clientId, serialNumber: validSerial } });
    if (bySerial) {
      await prisma.device.update({ where: { id: bySerial.id }, data: commonUpdate });
      return bySerial.id;
    }
  }

  // 2) Szukaj po MAC adresie
  if (mac) {
    const byMac = await prisma.device.findFirst({ where: { clientId, macAddress: mac } });
    if (byMac) {
      await prisma.device.update({ where: { id: byMac.id }, data: { ...commonUpdate, serialNumber: validSerial } });
      return byMac.id;
    }
  }

  // 3) Utwórz nowe urządzenie
  const device = await prisma.device.create({
    data: {
      clientId,
      locationId,
      name:            hostname ?? `Komputer ${new Date().toLocaleDateString('pl-PL')}`,
      serialNumber:    validSerial,
      macAddress:      mac,
      hostname,
      ipAddress:       (data as any).ipAddress,
      operatingSystem: osInfo,
      rustdeskId:      (data as any).rustdeskId ?? undefined,
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
    appVersion:        (data as any).appVersion,
  };
}

export async function registerAgent(data: RegisterInput) {
  const token = uuidv4();

  // ── Logowanie istniejącego klienta (email + hasło) ──────────────────────
  if (data.email && data.password && !data.companyName && !data.nip) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { client: { select: { id: true, name: true } } },
    });

    if (!user || !user.isActive) throw new AppError('Invalid credentials', 401);
    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) throw new AppError('Invalid credentials', 401);
    if (!user.clientId) throw new AppError('User not linked to a client', 400);

    // Identyfikuj urządzenie: najpierw po deviceId z config.json, potem serial/MAC
    let deviceId: string | undefined;
    const knownDeviceId = (data as any).deviceId as string | undefined;
    if (knownDeviceId) {
      const known = await prisma.device.findFirst({
        where: { id: knownDeviceId, clientId: user.clientId! },
      });
      if (known) {
        deviceId = known.id;
        await prisma.device.update({
          where: { id: known.id },
          data: {
            hostname:        (data as any).hostname,
            ipAddress:       (data as any).ipAddress,
            operatingSystem: osLabel(data),
            rustdeskId:      (data as any).rustdeskId ?? undefined,
            macAddress:      primaryMac((data as any).networkIfaces ?? []),
          },
        });
      }
    }
    if (!deviceId) {
      const location = await prisma.location.findFirst({
        where: { clientId: user.clientId! },
        select: { id: true },
      });
      if (location) deviceId = await resolveDevice(user.clientId!, location.id, data);
    }

    await prisma.agentRegistration.create({
      data: {
        agentToken: token,
        status:     'ACTIVE',
        clientId:   user.clientId,
        deviceId,
        allowMonitoring: true,
        allowRustdesk:   true,
        ...hardwareFields(data),
      },
    });

    return { token, status: 'ACTIVE', deviceId, clientName: user.client?.name ?? null, clientId: user.clientId };
  }

  // ── Rejestracja nowego urządzenia (formularz) ────────────────────────────
  const nip = data.nip?.replace(/[-\s]/g, '') ?? undefined;

  // 1) Szukaj klienta po NIP
  let matchedClientId: string | undefined;
  if (nip) {
    const clientByNip = await prisma.client.findFirst({
      where: { taxId: nip },
      select: { id: true },
    });
    if (clientByNip) matchedClientId = clientByNip.id;
  }

  // 2) Jeśli brak — szukaj po e-mailu kontaktowym
  if (!matchedClientId && data.contactEmail) {
    const userByEmail = await prisma.user.findUnique({
      where: { email: data.contactEmail },
      select: { clientId: true },
    });
    if (userByEmail?.clientId) matchedClientId = userByEmail.clientId;
  }

  // Zahashuj hasło żeby można było stworzyć użytkownika przy approve
  const contactPasswordHash = data.password ? await bcrypt.hash(data.password, 10) : undefined;

  const reg = await prisma.agentRegistration.create({
    data: {
      agentToken:           token,
      status:               'PENDING',
      nip,
      clientId:             matchedClientId,
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

  const matchedClient = matchedClientId
    ? await prisma.client.findUnique({ where: { id: matchedClientId }, select: { name: true } })
    : null;

  return { token, status: 'PENDING', clientName: matchedClient?.name ?? null, registrationId: reg.id };
}

export async function updateMetrics(token: string, data: MetricsInput) {
  const reg = await prisma.agentRegistration.findUnique({ where: { agentToken: token } });
  if (!reg) throw new AppError('Agent not found', 404);

  return prisma.agentRegistration.update({
    where: { agentToken: token },
    data: {
      lastSeen: new Date(),
      ...hardwareFields(data),
    },
  });
}

export async function createAgentTicket(token: string, data: AgentTicketInput) {
  const reg = await prisma.agentRegistration.findUnique({
    where: { agentToken: token },
    include: { device: { select: { locationId: true } } },
  });

  if (!reg || reg.status !== 'ACTIVE' || !reg.clientId) {
    throw new AppError('Agent not active or not linked to client', 403);
  }

  let location: { id: string } | null = reg.device?.locationId
    ? { id: reg.device.locationId }
    : await prisma.location.findFirst({ where: { clientId: reg.clientId! }, select: { id: true } });

  if (!location) {
    // Brak lokalizacji — utwórz domyślną żeby zgłoszenie mogło powstać
    const client = await prisma.client.findUnique({ where: { id: reg.clientId! }, select: { name: true } });
    const created = await prisma.location.create({
      data: {
        clientId:     reg.clientId!,
        name:         'Główna siedziba',
        type:         'OFFICE',
        addressLine1: '-',
        postalCode:   '00-000',
        city:         client?.name ?? 'Nieznane',
      },
    });
    location = { id: created.id };
  }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } });
  if (!admin) throw new AppError('No admin configured', 500);

  const count  = await prisma.ticket.count();
  const ticketNumber = `T-${String(count + 1).padStart(4, '0')}`;

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      clientId:        reg.clientId,
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
    },
  });

  notifyAgent(reg.agentToken, {
    type:  'notification',
    title: 'Nowe zgłoszenie',
    body:  `Zgłoszenie ${ticketNumber} zostało utworzone przez administratora.`,
  });

  return ticket;
}

export async function getAllRegistrations() {
  return prisma.agentRegistration.findMany({
    include: {
      client: { select: { id: true, name: true } },
      device: { select: { id: true, name: true } },
    },
    orderBy: [{ status: 'asc' }, { lastSeen: 'desc' }],
  });
}

export async function approveRegistration(id: string, data: ApproveInput) {
  const reg = await prisma.agentRegistration.findUnique({ where: { id } });
  if (!reg) throw new AppError('Registration not found', 404);

  // Use clientId from request or fall back to what was matched during registration
  const clientId = data.clientId ?? reg.clientId;
  if (!clientId) throw new AppError('Brak klienta — wybierz ręcznie lub uzupełnij NIP/e-mail klienta', 400);

  // Upewnij się że klient ma co najmniej jedną lokalizację (wymaganą przez Device)
  let location = await prisma.location.findFirst({ where: { clientId }, select: { id: true } });
  if (!location) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    const created = await prisma.location.create({
      data: {
        clientId,
        name:         'Główna siedziba',
        type:         'OFFICE',
        addressLine1: '-',
        postalCode:   '00-000',
        city:         client?.name ?? 'Nieznane',
      },
    });
    location = { id: created.id };
  }

  // Auto-create or find device using serial/MAC priority
  let deviceId = data.deviceId ?? reg.deviceId ?? undefined;
  if (!deviceId) {
    deviceId = await resolveDevice(clientId, location.id, {
      hostname:       reg.hostname       ?? undefined,
      ipAddress:      reg.ipAddress      ?? undefined,
      osInfo:         reg.osInfo         ?? undefined,
      windowsVersion: reg.windowsVersion ?? undefined,
      serialNumber:   reg.serialNumber   ?? undefined,
      rustdeskId:     reg.rustdeskId     ?? undefined,
      networkIfaces:  reg.networkIfaces as any ?? [],
    } as any);
  }

  // Utwórz konto użytkownika CLIENT jeśli mamy e-mail + hasło i konto jeszcze nie istnieje
  if (reg.contactEmail && reg.contactPasswordHash) {
    const existing = await prisma.user.findUnique({ where: { email: reg.contactEmail } });
    if (!existing) {
      await prisma.user.create({
        data: {
          firstName:    reg.contactFirstName ?? 'Użytkownik',
          lastName:     reg.contactLastName  ?? '',
          email:        reg.contactEmail,
          phone:        reg.contactPhone     ?? undefined,
          passwordHash: reg.contactPasswordHash,
          role:         'CLIENT',
          clientId,
          isActive:     true,
        },
      });
    } else if (!existing.clientId) {
      // Konto istnieje ale bez klienta — przypisz
      await prisma.user.update({ where: { id: existing.id }, data: { clientId } });
    }
  }

  const updated = await prisma.agentRegistration.update({
    where: { id },
    data: { status: 'ACTIVE', clientId, deviceId },
  });

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  notifyAgent(reg.agentToken, {
    type:  'notification',
    title: 'Urządzenie zatwierdzone!',
    body:  `Twoje urządzenie zostało aktywowane. Klient: ${client?.name}`,
  });

  return updated;
}

export async function approveRegistrationWithNewClient(id: string, clientData: {
  name: string; taxId?: string; phone?: string; email?: string;
  addressLine1?: string; postalCode?: string; city?: string;
}) {
  const reg = await prisma.agentRegistration.findUnique({ where: { id } });
  if (!reg) throw new AppError('Registration not found', 404);

  // Utwórz nowego klienta
  const client = await prisma.client.create({
    data: {
      name:         clientData.name,
      taxId:        clientData.taxId    || undefined,
      phone:        clientData.phone    || undefined,
      email:        clientData.email    || undefined,
      addressLine1: clientData.addressLine1 || '-',
      postalCode:   clientData.postalCode   || '00-000',
      city:         clientData.city         || clientData.name,
      status:       'ACTIVE',
    },
  });

  // Przekaż do standardowego approve (stworzy lokalizację + device)
  return approveRegistration(id, { clientId: client.id });
}

export async function deleteRegistration(id: string) {
  const reg = await prisma.agentRegistration.findUnique({ where: { id } });
  if (!reg) throw new AppError('Registration not found', 404);
  return prisma.agentRegistration.delete({ where: { id } });
}
