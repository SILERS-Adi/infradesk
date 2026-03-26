const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const admin = await p.user.findFirst({ where: { role: 'ADMIN' } });
  console.log('Admin:', admin.firstName, admin.lastName);

  // Find client that has at least one location
  const client = await p.client.findFirst({
    where: { status: 'ACTIVE', locations: { some: {} } },
    include: { locations: { take: 1 } },
  });
  if (!client || !client.locations[0]) { console.log('No client/location found'); return; }
  console.log('Client:', client.name, '| Location:', client.locations[0].name);

  const ticket = await p.ticket.create({
    data: {
      ticketNumber: 'TEST-' + Date.now().toString().slice(-6),
      clientId: client.id,
      locationId: client.locations[0].id,
      createdByUserId: admin.id,
      type: 'INCIDENT',
      priority: 'MEDIUM',
      status: 'PENDING',
      source: 'PHONE',
      title: 'Testowe zgłoszenie - drukarka nie działa',
      description: 'Drukarka HP w biurze głównym przestała drukować. Mruga czerwona lampka błędu. Wymiana tonera nie pomogła.',
      reportedAt: new Date(),
    },
  });
  console.log('---');
  console.log('TICKET CREATED:');
  console.log('  Number:', ticket.ticketNumber);
  console.log('  ID:', ticket.id);
  console.log('  Status:', ticket.status);
  console.log('  Priority:', ticket.priority);
  console.log('  Source:', ticket.source);
  console.log('  Title:', ticket.title);
  console.log('---');
  console.log('SUCCESS - zgłoszenie testowe utworzone poprawnie!');
  await p['$disconnect']();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
