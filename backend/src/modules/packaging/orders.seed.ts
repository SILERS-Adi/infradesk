import prisma from '../../lib/prisma';

const STATUSES = ['NEW', 'PAID', 'PICKING', 'PICKED', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED'] as const;
const COURIERS = ['InPost', 'DPD', 'UPS', 'DHL', 'Poczta Polska'] as const;
const METHODS = ['INPOST_LOCKER', 'COURIER', 'PICKUP_POINT'] as const;
const CLIENTS = [
  { name: 'Jan Kowalski', street: 'ul. Testowa 1', city: 'Warszawa', zip: '00-001', phone: '+48600100200' },
  { name: 'Anna Nowak', street: 'ul. Główna 15', city: 'Kraków', zip: '30-001', phone: '+48601200300' },
  { name: 'Piotr Wiśniewski', street: 'os. Słoneczne 8/12', city: 'Poznań', zip: '60-001', phone: '+48602300400' },
  { name: 'Maria Zielińska', street: 'al. Wolności 22', city: 'Wrocław', zip: '50-001', phone: '+48603400500' },
  { name: 'Tomasz Lewandowski', street: 'ul. Parkowa 3', city: 'Gdańsk', zip: '80-001', phone: '+48604500600' },
];
const PRODUCTS = [
  { name: 'Kabel USB-C 2m', sku: 'CBL-USBC-2M', price: 19.99 },
  { name: 'Ładowarka GaN 65W', sku: 'CHG-GAN-65', price: 89.99 },
  { name: 'Etui iPhone 15 Pro', sku: 'CSE-IP15P', price: 49.99 },
  { name: 'Mysz Logitech MX Master', sku: 'MOU-LOGI-MXM', price: 399.00 },
  { name: 'Słuchawki AirPods Pro 2', sku: 'AUD-APP2', price: 1099.00 },
  { name: 'Hub USB-C 7w1', sku: 'HUB-7IN1', price: 149.00 },
  { name: 'Folia ochronna Samsung S24', sku: 'FLM-S24', price: 29.99 },
  { name: 'Powerbank 10000mAh', sku: 'PWR-10K', price: 79.99 },
];

function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

async function seed() {
  const ws = await prisma.workspace.findFirst({ where: { isActive: true } });
  if (!ws) { console.error('No workspace'); process.exit(1); }
  console.log(`Seeding packing orders for: ${ws.name}`);

  for (let i = 0; i < 20; i++) {
    const client = pick(CLIENTS);
    const status = pick(STATUSES);
    const itemCount = 1 + Math.floor(Math.random() * 4);
    const items = Array.from({ length: itemCount }, () => {
      const p = pick(PRODUCTS);
      const qty = 1 + Math.floor(Math.random() * 3);
      return { name: p.name, sku: p.sku, quantity: qty, unitPrice: p.price };
    });
    const total = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + Math.floor(Math.random() * 3));

    await prisma.packingOrder.create({
      data: {
        workspaceId: ws.id,
        externalOrderId: `ALG-${10000 + i}`,
        status: status as any,
        paymentStatus: ['NEW', 'CANCELLED'].includes(status) ? 'pending' : 'paid',
        totalAmount: parseFloat(total.toFixed(2)),
        addressName: client.name,
        addressStreet: client.street,
        addressCity: client.city,
        addressZip: client.zip,
        addressPhone: client.phone,
        deliveryMethod: pick(METHODS),
        courierName: pick(COURIERS),
        dispatchDeadline: deadline,
        paidAt: status !== 'NEW' ? new Date() : undefined,
        shippedAt: ['SHIPPED', 'DELIVERED'].includes(status) ? new Date() : undefined,
        items: { create: items },
      },
    });
  }
  console.log('✓ Created 20 packing orders');
  await prisma.$disconnect();
}
seed().catch(e => { console.error(e); process.exit(1); });
