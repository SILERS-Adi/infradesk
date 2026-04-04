import prisma from '../../lib/prisma';

export async function getMenuPreference(userId: string, workspaceId: string) {
  const pref = await prisma.userMenuPreference.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return pref?.layout ?? null;
}

export async function saveMenuPreference(userId: string, workspaceId: string, layout: unknown) {
  await prisma.userMenuPreference.upsert({
    where: { userId_workspaceId: { userId, workspaceId } },
    create: { userId, workspaceId, layout: layout as any, version: 1 },
    update: { layout: layout as any, version: 1 },
  });
}

export async function deleteMenuPreference(userId: string, workspaceId: string) {
  await prisma.userMenuPreference.deleteMany({
    where: { userId, workspaceId },
  });
}
