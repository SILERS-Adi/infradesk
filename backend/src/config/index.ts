import dotenv from 'dotenv';
dotenv.config();

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`FATAL: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return val;
}

export const config = {
  port: process.env.PORT || 3000,
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtRefreshSecret: requireEnv('JWT_REFRESH_SECRET'),
  jwtExpiresIn: '15m',
  jwtRefreshExpiresIn: '7d',
  encryptionKey: requireEnv('ENCRYPTION_KEY'),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseDomain: process.env.BASE_DOMAIN || 'infradesk.pl',
  cookieDomain: process.env.COOKIE_DOMAIN || '.infradesk.pl',
  isProduction: (process.env.NODE_ENV || 'production') === 'production',
};
