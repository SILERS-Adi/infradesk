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

router.get('/google/auth-url', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await prisma.platformConfig.findUnique({ where: { id: 'global' } });
    if (!config?.googleClientId) {
      res.status(400).json({ error: 'Google API nie skonfigurowane. Ustaw Client ID w Ustawieniach platformy (SuperAdmin).' });
      return;
    }
    const host = req.get('host') || 'infradesk.pl';
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const redirectUri = `${protocol}://${host}/api/backup/google/callback`;
    const scope = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
    const state = Buffer.from(JSON.stringify({ userId: req.user?.userId })).toString('base64');
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(config.googleClientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
    res.json({ url });
  } catch (err) { next(err); }
});

// Google OAuth callback — redirect z Google po autoryzacji
router.get('/google/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, error } = req.query as Record<string, string>;
    if (error) {
      res.redirect('/?gdrive_error=' + encodeURIComponent(error));
      return;
    }
    if (!code) { res.redirect('/?gdrive_error=no_code'); return; }

    const config = await prisma.platformConfig.findUnique({ where: { id: 'global' } });
    if (!config?.googleClientId || !config?.googleClientSecret) {
      res.redirect('/?gdrive_error=not_configured'); return;
    }

    const host = req.get('host') || 'infradesk.pl';
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const redirectUri = `${protocol}://${host}/api/backup/google/callback`;

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenResp.json() as any;
    if (tokenData.error) {
      res.redirect('/?gdrive_error=' + encodeURIComponent(tokenData.error_description || tokenData.error));
      return;
    }

    let email = '';
    try {
      const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userResp.json() as any;
      email = userData.email || '';
    } catch {}

    // Zamknij popup i przekaż dane do okna rodzica przez postMessage
    const payload = JSON.stringify({ email, refreshToken: tokenData.refresh_token });
    res.send(`<!DOCTYPE html><html><body><script>
      window.opener.postMessage({type:'gdrive_auth',payload:${JSON.stringify(payload)}},'*');
      window.close();
    </script><p>Autoryzacja udana. To okno zamknie sie automatycznie...</p></body></html>`);
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
    const host = req.get('host') || 'infradesk.pl';
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const redirectUri = `${protocol}://${host}/api/backup/google/callback`;

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: redirectUri,
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
