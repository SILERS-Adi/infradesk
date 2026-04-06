import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createBackupConfigSchema, updateBackupConfigSchema } from './backup.validation';
import {
  getConfigs, getConfig, postConfig, patchConfig, removeConfig,
  getHistory, runNow,
} from './backup.controller';
import { requireFeature } from '../../middleware/planLimits';
import prisma from '../../lib/prisma';

const router = Router();

// ── Google Drive OAuth ─────────────────────────────────────────────

router.get('/google/auth-url', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await prisma.platformConfig.findUnique({ where: { id: 'global' } });
    if (!config?.googleClientId) {
      res.status(400).json({ error: 'Google API nie skonfigurowane. Ustaw Client ID w Ustawieniach platformy (SuperAdmin).' });
      return;
    }
    const redirectUri = 'urn:ietf:wg:oauth:2.0:oob'; // manual copy-paste flow
    const scope = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(config.googleClientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
    res.json({ url });
  } catch (err) { next(err); }
});

router.post('/google/exchange', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body;
    if (!code) { res.status(400).json({ error: 'Authorization code is required' }); return; }

    const config = await prisma.platformConfig.findUnique({ where: { id: 'global' } });
    if (!config?.googleClientId || !config?.googleClientSecret) {
      res.status(400).json({ error: 'Google API credentials not configured' }); return;
    }

    // Exchange authorization code for tokens
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenResp.json() as any;
    if (tokenData.error) {
      res.status(400).json({ error: `Google OAuth error: ${tokenData.error_description || tokenData.error}` });
      return;
    }

    // Get user email
    let email = '';
    try {
      const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userResp.json() as any;
      email = userData.email || '';
    } catch { /* email is optional */ }

    // Encrypt refresh token
    const { encrypt } = require('../../utils/encryption');
    const encryptedToken = encrypt(tokenData.refresh_token);

    res.json({
      email,
      refreshToken: encryptedToken,
      accessToken: tokenData.access_token,
    });
  } catch (err) { next(err); }
});

// ── Backup CRUD ────────────────────────────────────────────────────

router.use(withWorkspaceMembership, requireFeature('backup'));

router.get('/configs', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getConfigs);
router.get('/configs/:id', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getConfig);
router.post('/configs', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createBackupConfigSchema), postConfig);
router.patch('/configs/:id', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(updateBackupConfigSchema), patchConfig);
router.delete('/configs/:id', authorizeWorkspace('OWNER', 'ADMIN'), removeConfig);
router.get('/configs/:id/history', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), getHistory);
router.post('/configs/:id/run-now', authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), runNow);

export default router;
