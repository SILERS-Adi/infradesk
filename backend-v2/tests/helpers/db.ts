import { PrismaClient } from '@prisma/client';

export const testDb = new PrismaClient();

export async function resetDatabase(): Promise<void> {
  await testDb.$transaction([
    testDb.permissionOverride.deleteMany(),
    testDb.accessGrant.deleteMany(),
    testDb.refreshToken.deleteMany(),
    testDb.passwordResetToken.deleteMany(),
    testDb.membership.deleteMany(),
    testDb.workspace.deleteMany(),
    testDb.user.deleteMany(),
  ]);
}

export async function disconnect(): Promise<void> {
  await testDb.$disconnect();
}
