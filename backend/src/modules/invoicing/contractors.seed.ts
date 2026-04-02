import prisma from '../../lib/prisma';

const CONTRACTORS = [
  { name: 'TechNova Sp. z o.o.', nip: '1234567890', email: 'biuro@technova.pl', phone: '+48 22 100 2000', city: 'Warszawa', address: 'ul. Innowacji 15' },
  { name: 'DataStream S.A.', nip: '9876543210', email: 'kontakt@datastream.pl', phone: '+48 12 300 4000', city: 'Kraków', address: 'al. Technologiczna 8' },
  { name: 'CloudBase Sp. z o.o.', nip: '5551234567', email: 'info@cloudbase.io', city: 'Wrocław', address: 'ul. Serwerowa 3' },
  { name: 'NetSolutions Sp. z o.o.', nip: '7779876543', email: 'hello@netsolutions.pl', phone: '+48 61 200 3000', city: 'Poznań' },
  { name: 'CyberLab S.A.', nip: '3335557777', email: 'lab@cyberlab.com', city: 'Gdańsk', address: 'ul. Portowa 22' },
  { name: 'SmartIT Sp. z o.o.', nip: '1112223334', email: 'kontakt@smartit.pl', phone: '+48 71 500 6000', city: 'Wrocław' },
  { name: 'PixelForge Sp. z o.o.', nip: '4445556667', city: 'Łódź', address: 'ul. Kreacji 7' },
  { name: 'ServerHub S.A.', nip: '8889990001', email: 'sales@serverhub.pl', phone: '+48 22 800 9000', city: 'Warszawa', address: 'ul. Datacenter 1' },
  { name: 'InfraTech Sp. z o.o.', nip: '2223334445', email: 'biuro@infratech.pl', city: 'Katowice', notes: 'Stały klient od 2024' },
  { name: 'PKS Garwolin Sp. z o.o.', nip: '8261510874', email: 'biuro@pks-garwolin.pl', phone: '+48 25 682 3000', city: 'Garwolin', address: 'ul. Lubelska 30' },
];

async function seed() {
  const ws = await prisma.workspace.findFirst({ where: { isActive: true } });
  if (!ws) { console.error('No workspace'); process.exit(1); }
  console.log(`Seeding contractors for: ${ws.name}`);
  for (const c of CONTRACTORS) {
    await prisma.invoicingContractor.create({ data: { ...c, workspaceId: ws.id } });
  }
  console.log(`✓ Created ${CONTRACTORS.length} contractors`);
  await prisma.$disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
