/**
 * Seed script for invoicing module.
 * Run: npx ts-node src/modules/invoicing/invoicing.seed.ts
 */
import prisma from '../../lib/prisma';

const TYPES = ['SALE_INVOICE', 'PROFORMA', 'CORRECTION', 'RECEIPT', 'PURCHASE_INVOICE'] as const;
const STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'SENT', 'OVERDUE', 'PARTIALLY_PAID'] as const;

const CONTRACTORS = [
  { name: 'TechNova Sp. z o.o.', nip: '1234567890' },
  { name: 'DataStream S.A.', nip: '9876543210' },
  { name: 'CloudBase Sp. z o.o.', nip: '5551234567' },
  { name: 'NetSolutions Sp. z o.o.', nip: '7779876543' },
  { name: 'CyberLab S.A.', nip: '3335557777' },
  { name: 'SmartIT Sp. z o.o.', nip: '1112223334' },
  { name: 'PixelForge Sp. z o.o.', nip: '4445556667' },
  { name: 'ServerHub S.A.', nip: '8889990001' },
];

const PRODUCTS = [
  { name: 'Usługa IT - wsparcie techniczne', price: 150, vat: '23' },
  { name: 'Licencja Microsoft 365 Business', price: 89, vat: '23' },
  { name: 'Konfiguracja serwera Linux', price: 500, vat: '23' },
  { name: 'Audyt bezpieczeństwa', price: 2000, vat: '23' },
  { name: 'Monitoring 24/7 - pakiet miesięczny', price: 350, vat: '23' },
  { name: 'Backup w chmurze - 100GB', price: 49, vat: '23' },
  { name: 'Instalacja Access Point', price: 250, vat: '23' },
  { name: 'Naprawa drukarki', price: 180, vat: '23' },
  { name: 'Kabel sieciowy Cat6 (1m)', price: 8, vat: '23' },
  { name: 'Switch TP-Link 8-port', price: 120, vat: '23' },
];

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(daysBack: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  return d;
}

async function seed() {
  // Find first workspace
  const workspace = await prisma.workspace.findFirst({ where: { isActive: true } });
  if (!workspace) {
    console.error('No active workspace found. Create a workspace first.');
    process.exit(1);
  }

  // Find first user
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error('No user found. Create a user first.');
    process.exit(1);
  }

  console.log(`Seeding invoicing data for workspace: ${workspace.name} (${workspace.id})`);

  let docNumber = 1;

  for (let i = 0; i < 15; i++) {
    const type = randomItem(TYPES);
    const status = randomItem(STATUSES);
    const contractor = randomItem(CONTRACTORS);
    const issuedAt = randomDate(90);
    const dueDate = new Date(issuedAt);
    dueDate.setDate(dueDate.getDate() + 14);

    // 1-4 random items
    const itemCount = 1 + Math.floor(Math.random() * 4);
    const items = [];
    let totalNet = 0;
    let totalVat = 0;
    let totalGross = 0;

    for (let j = 0; j < itemCount; j++) {
      const product = randomItem(PRODUCTS);
      const qty = 1 + Math.floor(Math.random() * 10);
      const net = product.price * qty;
      const vat = net * 0.23;
      const gross = net + vat;

      totalNet += net;
      totalVat += vat;
      totalGross += gross;

      items.push({
        name: product.name,
        quantity: qty,
        priceNet: product.price,
        vatRate: product.vat,
        totalNet: parseFloat(net.toFixed(2)),
        totalVat: parseFloat(vat.toFixed(2)),
        totalGross: parseFloat(gross.toFixed(2)),
      });
    }

    const prefix = type === 'SALE_INVOICE' ? 'FV' : type === 'PROFORMA' ? 'PF' : type === 'CORRECTION' ? 'FK' : type === 'RECEIPT' ? 'PA' : 'FZ';
    const number = `${prefix}/${issuedAt.getFullYear()}/${String(issuedAt.getMonth() + 1).padStart(2, '0')}/${String(docNumber++).padStart(3, '0')}`;

    await prisma.invoiceDocument.create({
      data: {
        workspaceId: workspace.id,
        number,
        type: type as any,
        status: status as any,
        contractorName: contractor.name,
        contractorNip: contractor.nip,
        totalNet: parseFloat(totalNet.toFixed(2)),
        totalVat: parseFloat(totalVat.toFixed(2)),
        totalGross: parseFloat(totalGross.toFixed(2)),
        issuedAt,
        dueDate,
        notes: i % 3 === 0 ? 'Płatność przelewem na konto podane na fakturze.' : null,
        createdById: user.id,
        items: {
          create: items,
        },
      },
    });
  }

  console.log('✓ Created 15 sample invoice documents with items');
  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
