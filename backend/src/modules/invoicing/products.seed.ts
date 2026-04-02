import prisma from '../../lib/prisma';

const PRODUCTS = [
  { name: 'Usługa IT — wsparcie techniczne', sku: 'SRV-IT-SUPPORT', unit: 'godz', priceNet: 150, vatRate: '23' },
  { name: 'Licencja Microsoft 365 Business', sku: 'LIC-M365-BIZ', unit: 'szt', priceNet: 89, vatRate: '23' },
  { name: 'Konfiguracja serwera Linux', sku: 'SRV-LINUX-CFG', unit: 'szt', priceNet: 500, vatRate: '23' },
  { name: 'Audyt bezpieczeństwa', sku: 'SRV-AUDIT-SEC', unit: 'szt', priceNet: 2000, vatRate: '23' },
  { name: 'Monitoring 24/7 — pakiet miesięczny', sku: 'SRV-MON-24', unit: 'mies', priceNet: 350, vatRate: '23' },
  { name: 'Backup w chmurze — 100GB', sku: 'SRV-BACKUP-100', unit: 'mies', priceNet: 49, vatRate: '23' },
  { name: 'Instalacja Access Point', sku: 'HW-AP-INST', unit: 'szt', priceNet: 250, vatRate: '23' },
  { name: 'Naprawa drukarki', sku: 'SRV-PRINT-REP', unit: 'szt', priceNet: 180, vatRate: '23' },
  { name: 'Kabel sieciowy Cat6 (1m)', sku: 'HW-CAT6-1M', unit: 'szt', priceNet: 8, vatRate: '23' },
  { name: 'Switch TP-Link 8-port', sku: 'HW-SW-TPL8', unit: 'szt', priceNet: 120, vatRate: '23' },
  { name: 'Router MikroTik hAP ac2', sku: 'HW-RT-MT-AC2', unit: 'szt', priceNet: 280, vatRate: '23' },
  { name: 'Dysk SSD 500GB Samsung', sku: 'HW-SSD-SAM500', unit: 'szt', priceNet: 220, vatRate: '23' },
];

async function seed() {
  const ws = await prisma.workspace.findFirst({ where: { isActive: true } });
  if (!ws) { console.error('No workspace'); process.exit(1); }
  console.log(`Seeding products for: ${ws.name}`);
  for (const p of PRODUCTS) {
    await prisma.invoicingProduct.create({ data: { ...p, workspaceId: ws.id } });
  }
  console.log(`✓ Created ${PRODUCTS.length} products`);
  await prisma.$disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
