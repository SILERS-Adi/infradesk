/**
 * Starts an embedded PostgreSQL instance for local development/testing.
 * Creates the 'infradesk' database and keeps running until Ctrl+C.
 *
 * Usage: npx ts-node src/scripts/start-local-pg.ts
 */
// @ts-ignore
const EmbeddedPostgres = require('embedded-postgres').default;

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: './pg-data',
    user: 'infradesk',
    password: 'infradesk',
    port: 5433,
    persistent: true,
  });

  console.log('Starting embedded PostgreSQL on port 5432...');
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('infradesk');
  console.log('PostgreSQL ready! DATABASE_URL=postgresql://infradesk:infradesk@localhost:5432/infradesk');
  console.log('Press Ctrl+C to stop.\n');

  process.on('SIGINT', async () => {
    console.log('\nStopping PostgreSQL...');
    await pg.stop();
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}

main().catch(err => {
  console.error('Failed to start PostgreSQL:', err);
  process.exit(1);
});
