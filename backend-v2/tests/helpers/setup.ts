// Jest global setup — loads test env + cleans DB between suites.
import dotenv from 'dotenv';
import path from 'path';

const envFile = path.resolve(__dirname, '..', '..', '.env.test');
dotenv.config({ path: envFile });
process.env.NODE_ENV = 'test';

// Global safety: fail fast if pointing at a non-test DB.
const url = process.env.DATABASE_URL ?? '';
if (!url.includes('test')) {
  // eslint-disable-next-line no-console
  console.error('[tests] DATABASE_URL does not look like a test database:', url);
  process.exit(1);
}

jest.setTimeout(20000);
