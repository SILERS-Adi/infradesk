import prisma from '../../lib/prisma';

/** Haversine distance in meters between two GPS points */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GEOFENCE_RADIUS = 200; // meters

export async function updateTechPosition(userId: string, lat: number, lng: number, accuracy?: number) {
  // Get previous state
  const prev = await prisma.techPosition.findUnique({ where: { userId } });
  const prevNearIds: string[] = prev?.nearLocationIds ? (prev.nearLocationIds as string[]) : [];

  // Find all locations with coordinates
  const locations = await prisma.location.findMany({
    where: { latitude: { not: null }, longitude: { not: null } },
    select: { id: true, name: true, latitude: true, longitude: true, workspaceId: true },
  });

  // Calculate which locations are within geofence
  const nearNow: typeof locations = [];
  for (const loc of locations) {
    const dist = haversineMeters(lat, lng, loc.latitude!, loc.longitude!);
    if (dist <= GEOFENCE_RADIUS) nearNow.push(loc);
  }
  const nearNowIds = nearNow.map(l => l.id);

  // Detect enter/exit events
  const entered = nearNow.filter(l => !prevNearIds.includes(l.id));
  const exited = prevNearIds.filter(id => !nearNowIds.includes(id));

  // Get details for exited locations
  const exitedLocations = exited.length > 0
    ? await prisma.location.findMany({
        where: { id: { in: exited } },
        select: { id: true, name: true, workspaceId: true },
      })
    : [];

  // Upsert position
  await prisma.techPosition.upsert({
    where: { userId },
    create: { userId, latitude: lat, longitude: lng, accuracy, nearLocationIds: nearNowIds },
    update: { latitude: lat, longitude: lng, accuracy, nearLocationIds: nearNowIds },
  });

  // For entered locations, find open tickets
  const enteredWithTickets = [];
  for (const loc of entered) {
    const tickets = await prisma.ticket.findMany({
      where: {
        locationId: loc.id,
        status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
      },
      select: { id: true, ticketNumber: true, title: true, status: true, priority: true },
      take: 3,
    });
    enteredWithTickets.push({ location: loc, tickets });
  }

  const exitedWithTickets = [];
  for (const loc of exitedLocations) {
    const tickets = await prisma.ticket.findMany({
      where: {
        locationId: loc.id,
        status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
      },
      select: { id: true, ticketNumber: true, title: true, status: true, priority: true },
      take: 3,
    });
    exitedWithTickets.push({ location: loc, tickets });
  }

  return {
    nearLocations: nearNow.map(l => ({ id: l.id, name: l.name, workspaceId: l.workspaceId })),
    entered: enteredWithTickets.map(e => ({
      location: { id: e.location.id, name: e.location.name, workspaceId: e.location.workspaceId },
      tickets: e.tickets,
    })),
    exited: exitedWithTickets.map(e => ({
      location: { id: e.location.id, name: e.location.name, workspaceId: e.location.workspaceId },
      tickets: e.tickets,
    })),
  };
}

export async function getNearbyTickets(lat: number, lng: number, radiusMeters = 500) {
  const locations = await prisma.location.findMany({
    where: { latitude: { not: null }, longitude: { not: null } },
    select: { id: true, name: true, latitude: true, longitude: true, workspaceId: true },
  });

  const nearbyLocIds: string[] = [];
  const locMap = new Map<string, { name: string; distance: number }>();

  for (const loc of locations) {
    const dist = haversineMeters(lat, lng, loc.latitude!, loc.longitude!);
    if (dist <= radiusMeters) {
      nearbyLocIds.push(loc.id);
      locMap.set(loc.id, { name: loc.name, distance: Math.round(dist) });
    }
  }

  if (nearbyLocIds.length === 0) return [];

  const tickets = await prisma.ticket.findMany({
    where: {
      locationId: { in: nearbyLocIds },
      status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
    },
    select: {
      id: true, ticketNumber: true, title: true, status: true, priority: true,
      locationId: true,
      location: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { priority: 'desc' },
    take: 20,
  });

  return tickets.map(t => ({
    ...t,
    distance: locMap.get(t.locationId)?.distance ?? null,
  }));
}
