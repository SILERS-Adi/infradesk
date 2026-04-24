import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { google } from 'googleapis';
import { requireAuth } from '../../middleware/auth';
import { HttpError } from '../../utils/httpError';
import { logger } from '../../lib/logger';
import { config } from '../../config';
import {
  GOOGLE_SCOPES,
  assertConfigured,
  buildOAuthClient,
  saveTokensForUser,
  revokeAndClear,
  type GoogleTokensDecoded,
} from './google.service';
import { createState, consumeState } from './google.state';

const router = Router();

// Default redirect back to frontend after callback handling completes.
const DEFAULT_REDIRECT = '/settings';

const startSchema = z.object({
  redirect: z.string().max(200).optional(),
});

// GET /api/v2/auth/google/start?redirect=/settings/integrations
// Returns a 302 to Google's consent screen, carrying an opaque state token.
router.get('/start', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    assertConfigured();
    const parsed = startSchema.parse(req.query);
    // Only allow in-app paths to avoid open-redirects.
    const redirect = parsed.redirect && parsed.redirect.startsWith('/') ? parsed.redirect : DEFAULT_REDIRECT;

    const state = await createState(req.auth!.sub, redirect);
    const client = buildOAuthClient();
    const url = client.generateAuthUrl({
      access_type: 'offline', // needed for refresh_token
      prompt: 'consent', // force refresh_token even if user previously granted
      scope: GOOGLE_SCOPES,
      state,
      include_granted_scopes: true,
    });
    res.redirect(url);
  } catch (err) { next(err); }
});

// GET /api/v2/auth/google/callback?code=...&state=...
// Not behind requireAuth — Google redirects here without our cookies in some browsers.
// We reconstruct userId from the Redis state blob.
const callbackSchema = z.object({
  code: z.string().min(10).max(1024).optional(),
  state: z.string().min(8).max(128).optional(),
  error: z.string().max(200).optional(),
});

function renderCallbackHtml(status: 'ok' | 'error', message: string, redirect: string): string {
  const safeRedirect = redirect.startsWith('/') ? redirect : DEFAULT_REDIRECT;
  const icon = status === 'ok' ? '✓' : '✕';
  const color = status === 'ok' ? '#16a34a' : '#dc2626';
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>Google OAuth</title>
<style>
 body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:#0b0f17;color:#e5e7eb;
      display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
 .card{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:24px 32px;
       max-width:420px;text-align:center}
 .ic{font-size:32px;color:${color};margin-bottom:8px}
 a{color:#60a5fa;text-decoration:none}
</style></head><body><div class="card">
  <div class="ic">${icon}</div>
  <h1 style="margin:0 0 8px;font-size:18px">${status === 'ok' ? 'Połączono z Google' : 'Błąd połączenia'}</h1>
  <p style="margin:0 0 16px;color:#9ca3af">${message}</p>
  <p><a href="${safeRedirect}">Wróć do aplikacji →</a></p>
</div>
<script>
  try {
    if (window.opener) { window.opener.postMessage({ type:'google-oauth', status:'${status}' }, '*'); }
    setTimeout(() => { window.location.href = ${JSON.stringify(safeRedirect)}; }, 1500);
  } catch(e){}
</script>
</body></html>`;
}

router.get('/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    assertConfigured();
    const q = callbackSchema.parse(req.query);

    if (q.error) {
      logger.warn({ error: q.error }, '[google-oauth] user denied or error');
      res.status(400).send(renderCallbackHtml('error', `Google zwrócił błąd: ${q.error}`, DEFAULT_REDIRECT));
      return;
    }
    if (!q.code || !q.state) throw HttpError.badRequest('Missing code or state', 'invalid_callback');

    const pending = await consumeState(q.state);
    if (!pending) throw HttpError.badRequest('State expired or invalid', 'invalid_state');

    const client = buildOAuthClient();
    const { tokens } = await client.getToken(q.code);
    if (!tokens.access_token) throw HttpError.badRequest('No access_token returned', 'token_exchange_failed');

    // Fetch the authenticated email via OIDC userinfo so we can show
    // "Połączony: foo@gmail.com" — the id_token also contains it but this is simpler.
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userinfo = await oauth2.userinfo.get();
    const email = userinfo.data.email ?? 'unknown@google';

    const decoded: GoogleTokensDecoded = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : new Date(Date.now() + 55 * 60_000).toISOString(),
      scope: tokens.scope ?? GOOGLE_SCOPES.join(' '),
      email,
    };
    await saveTokensForUser(pending.userId, decoded);

    logger.info({ userId: pending.userId, email }, '[google-oauth] connected');
    res.status(200).send(renderCallbackHtml('ok', `Konto ${email} zostało połączone.`, pending.redirect));
  } catch (err) {
    const msg = err instanceof HttpError ? err.message : 'Błąd autoryzacji Google';
    logger.warn({ err }, '[google-oauth] callback failed');
    // Render HTML instead of JSON so the browser shows something useful.
    res.status(err instanceof HttpError ? err.status : 500)
      .send(renderCallbackHtml('error', msg, DEFAULT_REDIRECT));
    // Still pass to next for logging middleware when in dev.
    if (!config.isProduction) return next(err);
  }
});

// POST /api/v2/auth/google/disconnect — revoke + clear.
router.post('/disconnect', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Intentionally does not call assertConfigured — user should always be
    // able to clear stored tokens even if creds were later removed.
    await revokeAndClear(req.auth!.sub);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/v2/auth/google/status — small helper, independent from /users/me.
router.get('/status', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { loadTokensForUser } = await import('./google.service');
    const tokens = await loadTokensForUser(req.auth!.sub);
    res.json({
      configured: Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REDIRECT_URI),
      connected: Boolean(tokens),
      email: tokens?.email ?? null,
      scope: tokens?.scope ?? null,
      expiresAt: tokens?.expiresAt ?? null,
    });
  } catch (err) { next(err); }
});

export default router;
