import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'changeme-secret-key',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'changeme-refresh-secret',
  jwtExpiresIn: '15m',
  jwtRefreshExpiresIn: '7d',
  encryptionKey: process.env.ENCRYPTION_KEY || 'changeme-32-char-encryption-key!',
  nodeEnv: process.env.NODE_ENV || 'development',
};
