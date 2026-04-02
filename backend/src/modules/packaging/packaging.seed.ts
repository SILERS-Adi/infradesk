/**
 * Seed script for packaging module.
 * Run: npx ts-node src/modules/packaging/packaging.seed.ts
 */
import prisma from '../../lib/prisma';

const STATUSES = ['PENDING', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'ERROR'] as const;
const COURIERS = ['inpost', 'dpd', 'ups', 'dhl', 'poczta'] as const;

const CLIENTS = [
  'Jan Kowalski', 'Anna Nowak', 'Piotr Wiśniewski', 'Maria Zielińska',
  'Tomasz Lewandowski', 'Ewa Dąbrowska', 'Marek Szymański', 'Katarzyna Wójcik',
];

const PRODUCTS = [
  { name: 'Kabel USB-C 2m', sku: 'CBL-USBC-2M', weight: 80 },
  { name: 'Ładowarka GaN 65W', sku: 'CHG-GAN-65', weight: 150 },
  { name: 'Etui ochronne iPad Pro', sku: 'CSE-IPAD-129', weight: 320 },
  { name: 'Mysz bezprzewodowa Logitech', sku: 'MOU-LOGI-M', weight: 95 },
  { name: 'Klawiatura mechaniczna', sku: 'KBD-MECH-01', weight: 850 },
  { name: 'Podkładka pod mysz XL', sku: 'PAD-XL-01', weight: 300 },
  { name: 'Hub USB 4-port', sku: 'HUB-USB4', weight: 60 },
  { name: 'Słuchawki Bluetooth', sku: 'AUD-BT-01', weight: 210 },
  { name: 'Stacja dokująca USB-C', sku: 'DCK-USBC-01', weight: 450 },
  { name: 'Monitor przenośny 15.6"', sku: 'MON-PORT-15', weight: 1200 },
];

function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

async function seed() {
  const workspace = await prisma.workspace.findFirst({ where: { isActive: true } });
  if (!workspace) { console.error('No workspace found.'); process.exit(1); }
  const user = await prisma.user.findFirst();
  if (!user) { console.error('No user found.'); process.exit(1); }

  console.log(`Seeding packaging for workspace: ${workspace.name}`);

  for (let i = 0; i < 12; i++) {
    const status = pick(STATUSES);
    const itemCount = 1 + Math.floor(Math.random() * 4);
    const items = Array.from({ length: itemCount }, () => {
      const p = pick(PRODUCTS);
      const qty = 1 + Math.floor(Math.random() * 5);
      return { name: p.name, sku: p.sku, quantity: qty, weight: p.weight };
    });
    const totalWeight = items.reduce((s, it) => s + it.weight * it.quantity, 0);
    const orderNum = `ALG-${98200 + i}`;

    await prisma.shipment.create({
      data: {
        workspaceId: workspace.id,
        orderNumber: orderNum,
        customerName: pick(CLIENTS),
        status: status as any,
        courier: pick(COURIERS),
        totalWeight,
        notes: i % 4 === 0 ? 'Ostrożnie — zawartość delikatna' : null,
        createdById: user.id,
        items: { create: items },
      },
    });
  }

  console.log('✓ Created 12 sample shipments');
  await prisma.$disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
