import { buildApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { prismaBg } from './lib/prisma-bg';
import { startImapScheduler } from './modules/crm-email/imap-sync';
import { initAgentWsServer } from './modules/agents-ws/agents-ws.server';

async function main(): Promise<void> {
  await prisma.$connect();
  await prismaBg.$connect();
  const app = buildApp();
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'InfraDesk backend v2 listening');
    startImapScheduler();
  });

  // Mount WebSocket server for desktop agents at /api/agent/ws
  // (V1-compat URL; v4.14.6 and v5.0 both connect here).
  initAgentWsServer(server);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => logger.info('http server closed'));
    await prisma.$disconnect();
    await prismaBg.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
