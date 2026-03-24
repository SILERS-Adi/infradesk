import prisma from '../../lib/prisma';

export async function startSession(techId: string, agentRegId: string) {
  const reg = await prisma.agentRegistration.findUnique({
    where: { id: agentRegId },
    select: { clientId: true, deviceId: true },
  });
  if (!reg?.clientId) throw new Error('Agent nie jest przypisany do klienta');

  return prisma.workSession.create({
    data: {
      techId,
      agentRegId,
      clientId: reg.clientId,
      deviceId: reg.deviceId ?? undefined,
      startedAt: new Date(),
    },
    include: {
      client: { select: { id: true, name: true } },
      device: { select: { id: true, name: true } },
    },
  });
}

export async function endSession(id: string, techId: string, notes?: string) {
  const session = await prisma.workSession.findFirst({
    where: { id, techId },
  });
  if (!session) throw Object.assign(new Error('Sesja nie znaleziona'), { status: 404 });
  if (session.endedAt) throw Object.assign(new Error('Sesja już zakończona'), { status: 400 });

  const endedAt = new Date();
  const durationMin = Math.round((endedAt.getTime() - session.startedAt.getTime()) / 60000);

  return prisma.workSession.update({
    where: { id },
    data: { endedAt, durationMin, notes },
    include: {
      client: { select: { id: true, name: true } },
      device: { select: { id: true, name: true } },
    },
  });
}

export async function getSessionsByClient(clientId: string) {
  return prisma.workSession.findMany({
    where: { clientId },
    orderBy: { startedAt: 'desc' },
    take: 100,
    include: {
      tech: { select: { id: true, firstName: true, lastName: true } },
      device: { select: { id: true, name: true } },
    },
  });
}
