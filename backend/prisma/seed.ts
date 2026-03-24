import { PrismaClient, Role, ClientStatus, DeviceStatus, DeviceCriticality, CredentialCategory, TicketType, TicketPriority, TicketStatus, TicketSource } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'changeme-32-char-encryption-key!';

function encrypt(text: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function getNextTicketNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.ticket.count();
  const num = String(count + 1).padStart(4, '0');
  return `INF-${year}-${num}`;
}

async function main() {
  console.log('Seeding database...');

  // Device types
  const deviceTypes = await Promise.all([
    prisma.deviceType.upsert({
      where: { name: 'Server' },
      update: {},
      create: { name: 'Server', icon: 'server' },
    }),
    prisma.deviceType.upsert({
      where: { name: 'Workstation' },
      update: {},
      create: { name: 'Workstation', icon: 'monitor' },
    }),
    prisma.deviceType.upsert({
      where: { name: 'Laptop' },
      update: {},
      create: { name: 'Laptop', icon: 'laptop' },
    }),
    prisma.deviceType.upsert({
      where: { name: 'Router' },
      update: {},
      create: { name: 'Router', icon: 'router' },
    }),
    prisma.deviceType.upsert({
      where: { name: 'Switch' },
      update: {},
      create: { name: 'Switch', icon: 'network' },
    }),
    prisma.deviceType.upsert({
      where: { name: 'NAS' },
      update: {},
      create: { name: 'NAS', icon: 'database' },
    }),
    prisma.deviceType.upsert({
      where: { name: 'Printer' },
      update: {},
      create: { name: 'Printer', icon: 'printer' },
    }),
    prisma.deviceType.upsert({
      where: { name: 'IP Camera' },
      update: {},
      create: { name: 'IP Camera', icon: 'camera' },
    }),
  ]);

  const [serverType, workstationType, laptopType, routerType, , nasType] = deviceTypes;

  // Admin user
  const adminPassword = await hashPassword('Admin123!');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@infradesk.pl' },
    update: {},
    create: {
      firstName: 'Administrator',
      lastName: 'InfraDesk',
      email: 'admin@infradesk.pl',
      passwordHash: adminPassword,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  // Technician users
  const techPassword = await hashPassword('Tech123!');
  const tech1 = await prisma.user.upsert({
    where: { email: 'jan.kowalski@infradesk.pl' },
    update: {},
    create: {
      firstName: 'Jan',
      lastName: 'Kowalski',
      email: 'jan.kowalski@infradesk.pl',
      passwordHash: techPassword,
      role: Role.TECHNICIAN,
      phone: '+48 501 123 456',
      isActive: true,
    },
  });

  const tech2 = await prisma.user.upsert({
    where: { email: 'anna.nowak@infradesk.pl' },
    update: {},
    create: {
      firstName: 'Anna',
      lastName: 'Nowak',
      email: 'anna.nowak@infradesk.pl',
      passwordHash: techPassword,
      role: Role.TECHNICIAN,
      phone: '+48 502 234 567',
      isActive: true,
    },
  });

  // Client 1: TechCorp
  const client1 = await prisma.client.upsert({
    where: { id: 'client-techcorp-001' },
    update: {},
    create: {
      id: 'client-techcorp-001',
      name: 'TechCorp Sp. z o.o.',
      legalName: 'TechCorp Spółka z ograniczoną odpowiedzialnością',
      taxId: 'PL1234567890',
      email: 'it@techcorp.pl',
      phone: '+48 22 123 45 67',
      website: 'https://techcorp.pl',
      addressLine1: 'ul. Informatyczna 15',
      postalCode: '00-001',
      city: 'Warszawa',
      country: 'PL',
      notes: 'Klient premium, umowa SLA 4h',
      status: ClientStatus.ACTIVE,
    },
  });

  // Client 2: BuildMaster
  const client2 = await prisma.client.upsert({
    where: { id: 'client-buildmaster-002' },
    update: {},
    create: {
      id: 'client-buildmaster-002',
      name: 'BuildMaster S.A.',
      legalName: 'BuildMaster Spółka Akcyjna',
      taxId: 'PL9876543210',
      email: 'admin@buildmaster.pl',
      phone: '+48 12 345 67 89',
      website: 'https://buildmaster.pl',
      addressLine1: 'al. Budowniczych 42',
      postalCode: '30-001',
      city: 'Kraków',
      country: 'PL',
      status: ClientStatus.ACTIVE,
    },
  });

  // Client 3: MediCare
  const client3 = await prisma.client.upsert({
    where: { id: 'client-medicare-003' },
    update: {},
    create: {
      id: 'client-medicare-003',
      name: 'MediCare Clinic',
      legalName: 'MediCare Klinika Sp. z o.o.',
      taxId: 'PL5555555555',
      email: 'it@medicare-clinic.pl',
      phone: '+48 61 456 78 90',
      addressLine1: 'ul. Zdrowia 8',
      postalCode: '60-001',
      city: 'Poznań',
      country: 'PL',
      notes: 'Placówka medyczna - dane wrażliwe RODO',
      status: ClientStatus.ACTIVE,
    },
  });

  // Client portal user for TechCorp
  const clientPassword = await hashPassword('Client123!');
  await prisma.user.upsert({
    where: { email: 'portal@techcorp.pl' },
    update: {},
    create: {
      firstName: 'Marek',
      lastName: 'Wiśniewski',
      email: 'portal@techcorp.pl',
      passwordHash: clientPassword,
      role: Role.CLIENT,
      clientId: client1.id,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'portal@buildmaster.pl' },
    update: {},
    create: {
      firstName: 'Katarzyna',
      lastName: 'Zielińska',
      email: 'portal@buildmaster.pl',
      passwordHash: clientPassword,
      role: Role.CLIENT,
      clientId: client2.id,
      isActive: true,
    },
  });

  // Locations for TechCorp
  const loc1 = await prisma.location.upsert({
    where: { id: 'loc-techcorp-hq' },
    update: {},
    create: {
      id: 'loc-techcorp-hq',
      clientId: client1.id,
      name: 'Siedziba Główna',
      type: 'Biuro',
      addressLine1: 'ul. Informatyczna 15',
      postalCode: '00-001',
      city: 'Warszawa',
      country: 'PL',
      contactPersonName: 'Marek Wiśniewski',
      contactPersonPhone: '+48 501 987 654',
      contactPersonEmail: 'marek@techcorp.pl',
    },
  });

  const loc2 = await prisma.location.upsert({
    where: { id: 'loc-techcorp-branch' },
    update: {},
    create: {
      id: 'loc-techcorp-branch',
      clientId: client1.id,
      name: 'Oddział Wrocław',
      type: 'Biuro',
      addressLine1: 'ul. Świdnicka 20',
      postalCode: '50-001',
      city: 'Wrocław',
      country: 'PL',
      contactPersonName: 'Piotr Adamski',
      contactPersonPhone: '+48 502 111 222',
      contactPersonEmail: 'p.adamski@techcorp.pl',
    },
  });

  // Location for BuildMaster
  const loc3 = await prisma.location.upsert({
    where: { id: 'loc-buildmaster-hq' },
    update: {},
    create: {
      id: 'loc-buildmaster-hq',
      clientId: client2.id,
      name: 'Centrala Kraków',
      type: 'Biuro + magazyn',
      addressLine1: 'al. Budowniczych 42',
      postalCode: '30-001',
      city: 'Kraków',
      country: 'PL',
      contactPersonName: 'Tomasz Budny',
      contactPersonPhone: '+48 601 333 444',
    },
  });

  // Location for MediCare
  const loc4 = await prisma.location.upsert({
    where: { id: 'loc-medicare-clinic' },
    update: {},
    create: {
      id: 'loc-medicare-clinic',
      clientId: client3.id,
      name: 'Klinika Główna',
      type: 'Placówka medyczna',
      addressLine1: 'ul. Zdrowia 8',
      postalCode: '60-001',
      city: 'Poznań',
      country: 'PL',
      contactPersonName: 'dr Anna Lewandowska',
      contactPersonPhone: '+48 603 555 666',
      contactPersonEmail: 'a.lewandowska@medicare-clinic.pl',
    },
  });

  // Devices for TechCorp HQ
  const device1 = await prisma.device.upsert({
    where: { id: 'dev-techcorp-srv-001' },
    update: {},
    create: {
      id: 'dev-techcorp-srv-001',
      clientId: client1.id,
      locationId: loc1.id,
      deviceTypeId: serverType.id,
      name: 'Server Produkcyjny #1',
      assetTag: 'TC-SRV-001',
      manufacturer: 'Dell',
      model: 'PowerEdge R740',
      serialNumber: 'DELL7X8K9L',
      hostname: 'srv-prod-01.techcorp.local',
      ipAddress: '192.168.1.10',
      macAddress: 'AA:BB:CC:DD:EE:01',
      operatingSystem: 'Ubuntu Server',
      osVersion: '22.04 LTS',
      warrantyUntil: new Date('2026-12-31'),
      purchaseDate: new Date('2022-01-15'),
      status: DeviceStatus.ACTIVE,
      criticality: DeviceCriticality.HIGH,
      qrCodeValue: uuidv4(),
      internalNotes: 'Główny serwer produkcyjny - nie restartować bez zgody klienta',
      clientVisibleNotes: 'Serwer produkcyjny aplikacji',
      rustdeskId: '123456789',
      sshAddress: '192.168.1.10:22',
    },
  });

  const device2 = await prisma.device.upsert({
    where: { id: 'dev-techcorp-nas-001' },
    update: {},
    create: {
      id: 'dev-techcorp-nas-001',
      clientId: client1.id,
      locationId: loc1.id,
      deviceTypeId: nasType.id,
      name: 'NAS Backup',
      assetTag: 'TC-NAS-001',
      manufacturer: 'Synology',
      model: 'DS923+',
      serialNumber: 'SYN9234X',
      hostname: 'nas-backup.techcorp.local',
      ipAddress: '192.168.1.20',
      operatingSystem: 'DiskStation Manager',
      osVersion: '7.2',
      warrantyUntil: new Date('2027-06-30'),
      purchaseDate: new Date('2023-06-01'),
      status: DeviceStatus.ACTIVE,
      criticality: DeviceCriticality.HIGH,
      qrCodeValue: uuidv4(),
      clientVisibleNotes: 'Urządzenie do backupu danych',
    },
  });

  const device3 = await prisma.device.upsert({
    where: { id: 'dev-techcorp-ws-001' },
    update: {},
    create: {
      id: 'dev-techcorp-ws-001',
      clientId: client1.id,
      locationId: loc1.id,
      deviceTypeId: workstationType.id,
      name: 'Stacja robocza - Kowalski',
      assetTag: 'TC-WS-001',
      manufacturer: 'HP',
      model: 'EliteDesk 800 G6',
      serialNumber: 'HP5KL234',
      hostname: 'ws-kowalski.techcorp.local',
      ipAddress: '192.168.1.101',
      operatingSystem: 'Windows 11 Pro',
      osVersion: '23H2',
      purchaseDate: new Date('2021-09-01'),
      status: DeviceStatus.ACTIVE,
      criticality: DeviceCriticality.MEDIUM,
      qrCodeValue: uuidv4(),
      rdpAddress: '192.168.1.101:3389',
    },
  });

  // Devices for BuildMaster
  const device4 = await prisma.device.upsert({
    where: { id: 'dev-buildmaster-rtr-001' },
    update: {},
    create: {
      id: 'dev-buildmaster-rtr-001',
      clientId: client2.id,
      locationId: loc3.id,
      deviceTypeId: routerType.id,
      name: 'Router Główny',
      assetTag: 'BM-RTR-001',
      manufacturer: 'MikroTik',
      model: 'RB4011iGS+',
      serialNumber: 'MT4011XZ',
      hostname: 'gw.buildmaster.local',
      ipAddress: '192.168.0.1',
      status: DeviceStatus.ACTIVE,
      criticality: DeviceCriticality.HIGH,
      qrCodeValue: uuidv4(),
      internalNotes: 'Hasło do routera w credentialach',
    },
  });

  // Devices for MediCare
  const device5 = await prisma.device.upsert({
    where: { id: 'dev-medicare-srv-001' },
    update: {},
    create: {
      id: 'dev-medicare-srv-001',
      clientId: client3.id,
      locationId: loc4.id,
      deviceTypeId: serverType.id,
      name: 'Serwer HIS',
      assetTag: 'MC-SRV-001',
      manufacturer: 'HPE',
      model: 'ProLiant DL360 Gen10',
      serialNumber: 'HPE1234567',
      hostname: 'his-server.medicare.local',
      ipAddress: '10.0.1.10',
      operatingSystem: 'Windows Server',
      osVersion: '2022 Standard',
      warrantyUntil: new Date('2027-03-31'),
      purchaseDate: new Date('2022-03-15'),
      status: DeviceStatus.ACTIVE,
      criticality: DeviceCriticality.HIGH,
      qrCodeValue: uuidv4(),
      internalNotes: 'Serwer systemu HIS - wrażliwe dane medyczne. Wymagana zgoda dyr. IT przed pracami.',
      rdpAddress: '10.0.1.10:3389',
      rustdeskId: '987654321',
    },
  });

  // Credentials for TechCorp
  await prisma.credential.upsert({
    where: { id: 'cred-techcorp-srv-001' },
    update: {},
    create: {
      id: 'cred-techcorp-srv-001',
      clientId: client1.id,
      locationId: loc1.id,
      deviceId: device1.id,
      name: 'SSH - Server Produkcyjny #1',
      category: CredentialCategory.SERVER,
      username: 'admin',
      passwordEncrypted: encrypt('P@ssw0rd!Srv01'),
      urlOrHost: '192.168.1.10',
      port: 22,
      notes: 'Klucz SSH w KeePass',
      isSharedWithClient: false,
      createdByUserId: admin.id,
    },
  });

  await prisma.credential.upsert({
    where: { id: 'cred-techcorp-nas-001' },
    update: {},
    create: {
      id: 'cred-techcorp-nas-001',
      clientId: client1.id,
      locationId: loc1.id,
      deviceId: device2.id,
      name: 'NAS Admin',
      category: CredentialCategory.NAS,
      username: 'admin',
      passwordEncrypted: encrypt('NasAdmin#2023'),
      urlOrHost: '192.168.1.20',
      port: 5001,
      isSharedWithClient: true,
      createdByUserId: tech1.id,
    },
  });

  await prisma.credential.upsert({
    where: { id: 'cred-techcorp-wifi-001' },
    update: {},
    create: {
      id: 'cred-techcorp-wifi-001',
      clientId: client1.id,
      locationId: loc1.id,
      name: 'WiFi Biurowe',
      category: CredentialCategory.WIFI,
      username: 'TechCorp-Office',
      passwordEncrypted: encrypt('WiFi$ecure2024!'),
      isSharedWithClient: true,
      createdByUserId: admin.id,
    },
  });

  await prisma.credential.upsert({
    where: { id: 'cred-buildmaster-rtr-001' },
    update: {},
    create: {
      id: 'cred-buildmaster-rtr-001',
      clientId: client2.id,
      locationId: loc3.id,
      deviceId: device4.id,
      name: 'MikroTik Admin',
      category: CredentialCategory.ROUTER,
      username: 'admin',
      passwordEncrypted: encrypt('Mikrotik#Pass01'),
      urlOrHost: '192.168.0.1',
      port: 8291,
      isSharedWithClient: false,
      createdByUserId: tech1.id,
    },
  });

  // Tickets
  const ticketNum1 = `INF-${new Date().getFullYear()}-0001`;
  const ticketNum2 = `INF-${new Date().getFullYear()}-0002`;
  const ticketNum3 = `INF-${new Date().getFullYear()}-0003`;

  await prisma.ticket.upsert({
    where: { ticketNumber: ticketNum1 },
    update: {},
    create: {
      ticketNumber: ticketNum1,
      clientId: client1.id,
      locationId: loc1.id,
      deviceId: device1.id,
      createdByUserId: admin.id,
      assignedToUserId: tech1.id,
      type: TicketType.INCIDENT,
      priority: TicketPriority.HIGH,
      status: TicketStatus.IN_PROGRESS,
      source: TicketSource.PHONE,
      title: 'Server produkcyjny - wolne działanie aplikacji',
      description: 'Klient zgłasza znaczne spowolnienie działania aplikacji. CPU na serwerze wynosi 95%.',
      reportedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.ticket.upsert({
    where: { ticketNumber: ticketNum2 },
    update: {},
    create: {
      ticketNumber: ticketNum2,
      clientId: client1.id,
      locationId: loc2.id,
      createdByUserId: admin.id,
      assignedToUserId: tech2.id,
      type: TicketType.REQUEST,
      priority: TicketPriority.MEDIUM,
      status: TicketStatus.NEW,
      source: TicketSource.CLIENT_PORTAL,
      title: 'Konfiguracja nowego laptopa dla pracownika',
      description: 'Prośba o konfigurację nowego laptopa dla nowego pracownika działu HR.',
      reportedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.ticket.upsert({
    where: { ticketNumber: ticketNum3 },
    update: {},
    create: {
      ticketNumber: ticketNum3,
      clientId: client2.id,
      locationId: loc3.id,
      deviceId: device4.id,
      createdByUserId: tech1.id,
      type: TicketType.MAINTENANCE,
      priority: TicketPriority.LOW,
      status: TicketStatus.RESOLVED,
      source: TicketSource.INTERNAL,
      title: 'Planowana aktualizacja firmware routera',
      description: 'Aktualizacja firmware MikroTik do najnowszej wersji stable.',
      resolutionSummary: 'Zaktualizowano firmware do wersji 7.13.2. Brak problemów.',
      reportedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      resolvedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
  });

  // Activity logs
  await prisma.activityLog.createMany({
    data: [
      {
        entityType: 'User',
        entityId: admin.id,
        actionType: 'LOGIN',
        description: 'Administrator zalogował się do systemu',
        performedByUserId: admin.id,
        createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      },
      {
        entityType: 'Ticket',
        entityId: ticketNum1,
        actionType: 'STATUS_CHANGE',
        description: `Ticket ${ticketNum1} zmienił status z NEW na IN_PROGRESS`,
        performedByUserId: tech1.id,
        metadata: { from: 'NEW', to: 'IN_PROGRESS' },
        createdAt: new Date(Date.now() - 90 * 60 * 1000),
      },
      {
        entityType: 'Device',
        entityId: device1.id,
        actionType: 'CREATE',
        description: 'Dodano nowe urządzenie: Server Produkcyjny #1',
        performedByUserId: admin.id,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    ],
    skipDuplicates: true,
  });

  console.log('Seed completed successfully!');
  console.log('');
  console.log('Demo accounts:');
  console.log('  Admin:       admin@infradesk.pl / Admin123!');
  console.log('  Technician1: jan.kowalski@infradesk.pl / Tech123!');
  console.log('  Technician2: anna.nowak@infradesk.pl / Tech123!');
  console.log('  Client:      portal@techcorp.pl / Client123!');
  console.log('  Client:      portal@buildmaster.pl / Client123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
