import prisma from '../../lib/prisma';

const VEHICLES = [
  { plate: 'WGR 12345', brand: 'Toyota', model: 'Corolla', year: 2020, ownerName: 'Jan Kowalski', ownerPhone: '+48 600 100 200' },
  { plate: 'WGR 67890', brand: 'Volkswagen', model: 'Golf', year: 2019, ownerName: 'Anna Nowak', ownerPhone: '+48 601 200 300' },
  { plate: 'WGR 11223', brand: 'Ford', model: 'Focus', year: 2021, ownerName: 'Piotr Wiśniewski' },
  { plate: 'WGR 44556', brand: 'Skoda', model: 'Octavia', year: 2018, ownerName: 'Maria Zielińska', ownerEmail: 'maria@example.com' },
  { plate: 'WGR 77889', brand: 'Opel', model: 'Astra', year: 2022, ownerName: 'Tomasz Lewandowski' },
  { plate: 'WGR 99001', brand: 'Renault', model: 'Megane', year: 2017, ownerName: 'Ewa Dąbrowska', ownerPhone: '+48 602 300 400' },
  { plate: 'WSE 55667', brand: 'Hyundai', model: 'i30', year: 2023, ownerName: 'Marek Szymański' },
  { plate: 'WSE 88990', brand: 'Kia', model: 'Ceed', year: 2021, ownerName: 'Katarzyna Wójcik', ownerEmail: 'kasia@example.com' },
];

const TYPES = ['PERIODIC', 'TECHNICAL', 'GAS_INSTALLATION'] as const;
const STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] as const;
const RESULTS = ['POSITIVE', 'NEGATIVE', 'CONDITIONAL'] as const;
const TECHS = ['Adam Mechanik', 'Bogdan Diagnosta', 'Celina Inspektor'];

function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

async function seed() {
  const ws = await prisma.workspace.findFirst({ where: { isActive: true } });
  if (!ws) { console.error('No workspace'); process.exit(1); }
  const user = await prisma.user.findFirst();
  if (!user) { console.error('No user'); process.exit(1); }

  console.log(`Seeding service module for: ${ws.name}`);

  const vehicles = [];
  for (const v of VEHICLES) {
    const created = await prisma.serviceVehicle.create({ data: { ...v, workspaceId: ws.id } });
    vehicles.push(created);
  }
  console.log(`✓ Created ${vehicles.length} vehicles`);

  let inspNum = 1;
  for (let i = 0; i < 15; i++) {
    const vehicle = pick(vehicles);
    const status = pick(STATUSES);
    const scheduled = new Date();
    scheduled.setDate(scheduled.getDate() - Math.floor(Math.random() * 30) + Math.floor(Math.random() * 10));

    await prisma.serviceInspection.create({
      data: {
        workspaceId: ws.id,
        vehicleId: vehicle.id,
        inspectionNumber: `SKP/${new Date().getFullYear()}/${String(inspNum++).padStart(4, '0')}`,
        type: pick(TYPES) as any,
        status: status as any,
        result: status === 'COMPLETED' ? (pick(RESULTS) as any) : undefined,
        scheduledAt: scheduled,
        completedAt: status === 'COMPLETED' ? new Date() : undefined,
        technicianName: pick(TECHS),
        mileage: 50000 + Math.floor(Math.random() * 150000),
        notes: i % 4 === 0 ? 'Wymiana płynu hamulcowego zalecana' : undefined,
        createdById: user.id,
      },
    });
  }
  console.log(`✓ Created 15 inspections`);
  await prisma.$disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
