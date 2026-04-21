import { PrismaClient } from '@prisma/client';
import { config } from '../config';

export const prisma = new PrismaClient({
  log: config.isProduction
    ? ['warn', 'error']
    : ['warn', 'error'],
});

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
