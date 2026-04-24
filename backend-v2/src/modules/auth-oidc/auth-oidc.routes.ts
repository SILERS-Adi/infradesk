/**
 * OIDC Provider routes.
 *
 * Mount points:
 *   /.well-known/openid-configuration   (mounted in app.ts at root)
 *   /api/v2/oauth/authorize             (GET — starts auth code flow)
 *   /api/v2/oauth/token                 (POST — exchanges code for tokens)
 *   /api/v2/oauth/userinfo              (GET — Bearer access token → profile)
 *   /api/v2/oauth/jwks                  (GET — public keys)
 *
 * Auth model: V2 already has a cookie + JWT session for the frontend.
 * When OIDC client sends user to /authorize we require a valid V2 session
 * (cookie or Bearer). If none, we redirect to the frontend login page with
 * ?next=<original-url> so after login the user lands right back here.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
// jose imported dynamically inside /userinfo handler to keep the import graph
// free of top-level side effects that tsc-check would flag as unused.
import { prisma } from '../../lib/prisma';
import { verifyAccessToken } from '../../lib/jwt';
import { HttpError } from '../../utils/httpError';
import * as service from './auth-oidc.service';

// ───────── Discovery (mounted at / by app.ts) ─────────
export const discoveryRouter = Router();
discoveryRouter.get('/.well-known/openid-configuration', (_req: Request, res: Response) => {
  res.json(service.discoveryDocument());
});

// ───────── Main OAuth router (mounted at /api/v2/oauth) ─────────
const router = Router();

const authorizeQuery = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  scope: z.string().min(1),
  state: z.string().optional(),
  nonce: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
});

/**
 * Return the V2 user id for the current request, based on the same
 * access-token rules used by requireAuth (Bearer header or access_token cookie).
 * Returns null if no valid session.
 */
async function resolveSessionUserId(req: Request): Promise<string | null> {
  const header = req.header('authorization');
  let token: string | null = null;
  if (header && header.startsWith('Bearer ')) token = header.slice(7).trim();
  else if (typeof req.cookies?.access_token === 'string') token = req.cookies.access_token;
  if (!token) return null;
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, deletedAt: true, tokenVersion: true },
    });
    if (!user || !user.isActive || user.deletedAt) return null;
    if (user.tokenVersion !== payload.tokenVersion) return null;
    return user.id;
  } catch {
    return null;
  }
}

/**
 * GET /api/v2/oauth/authorize
 *
 * Validates client + redirect_uri, then:
 *   - if user has session → issue code + 302 back to redirect_uri?code=X&state=Y
 *   - else → 302 to frontend /login?next=<full original url>
 */
router.get('/authorize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = authorizeQuery.parse(req.query);

    const client = await service.findClientById(q.client_id);
    if (!client) throw HttpError.badRequest('unknown client', 'unauthorized_client');
    if (!client.redirectUris.includes(q.redirect_uri)) {
      throw HttpError.badRequest('redirect_uri not registered', 'invalid_request');
    }

    const scopes = q.scope.split(/\s+/).filter(Boolean);
    if (!scopes.includes('openid')) {
      throw HttpError.badRequest('scope must contain openid', 'invalid_scope');
    }

    const userId = await resolveSessionUserId(req);
    if (!userId) {
      // Build absolute URL back to this endpoint so post-login redirect lands here.
      const backPath = req.originalUrl; // e.g. /api/v2/oauth/authorize?response_type=...
      const loginUrl = `/login?next=${encodeURIComponent(backPath)}`;
      return res.redirect(302, loginUrl);
    }

    const code = await service.issueAuthCode({
      clientId: q.client_id,
      userId,
      redirectUri: q.redirect_uri,
      scope: q.scope,
    });

    const url = new URL(q.redirect_uri);
    url.searchParams.set('code', code);
    if (q.state) url.searchParams.set('state', q.state);
    return res.redirect(302, url.toString());
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/v2/oauth/token
 *
 * Exchange authorization_code for (id_token + access_token).
 * Accepts client_secret via:
 *   - application/x-www-form-urlencoded body (client_id, client_secret)
 *   - HTTP Basic Authorization header (client_secret_basic)
 */
router.post('/token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Merge basic auth creds into body if present
    let clientId = typeof req.body.client_id === 'string' ? req.body.client_id : '';
    let clientSecret = typeof req.body.client_secret === 'string' ? req.body.client_secret : '';
    const basic = req.header('authorization');
    if (basic && basic.toLowerCase().startsWith('basic ')) {
      try {
        const decoded = Buffer.from(basic.slice(6).trim(), 'base64').toString('utf-8');
        const idx = decoded.indexOf(':');
        if (idx >= 0) {
          clientId = clientId || decodeURIComponent(decoded.slice(0, idx));
          clientSecret = clientSecret || decodeURIComponent(decoded.slice(idx + 1));
        }
      } catch {
        // ignore malformed basic
      }
    }

    const bodySchema = z.object({
      grant_type: z.literal('authorization_code'),
      code: z.string().min(1),
      redirect_uri: z.string().url(),
    });
    const body = bodySchema.parse(req.body);

    if (!clientId || !clientSecret) {
      throw HttpError.unauthorized('client credentials required', 'invalid_client');
    }
    const ok = await service.verifyClientSecret(clientId, clientSecret);
    if (!ok) throw HttpError.unauthorized('invalid client_secret', 'invalid_client');

    const row = await service.consumeAuthCode(body.code, clientId, body.redirect_uri);

    const user = await prisma.user.findUnique({
      where: { id: row.userId },
      select: {
        id: true, email: true, emailVerified: true, firstName: true, lastName: true,
        isActive: true, deletedAt: true,
      },
    });
    if (!user || !user.isActive || user.deletedAt) {
      throw HttpError.badRequest('user not active', 'invalid_grant');
    }

    const idToken = await service.signIdToken({
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      clientId,
    });
    const accessToken = await service.signOidcAccessToken({
      userId: user.id,
      clientId,
      scope: row.scope,
    });

    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    return res.json({
      access_token: accessToken,
      id_token: idToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: row.scope,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/v2/oauth/userinfo
 * Bearer access_token → profile claims according to scope.
 */
router.get('/userinfo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = req.header('authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      throw HttpError.unauthorized('Bearer token required', 'invalid_token');
    }
    const token = header.slice(7).trim();

    // Verify our own JWT using our public JWK (local, no HTTP).
    const { jwtVerify: verify, importJWK } = await import('jose');
    const jwk = service.getPublicJwk();
    const key = await importJWK(jwk, 'RS256');
    const { payload } = await verify(token, key, {
      issuer: service.getIssuer(),
    });
    if (!payload.sub || typeof payload.sub !== 'string') {
      throw HttpError.unauthorized('invalid token', 'invalid_token');
    }
    const scope = typeof payload.scope === 'string' ? payload.scope : 'openid';
    const info = await service.getUserInfo(payload.sub, scope);
    res.set('Cache-Control', 'no-store');
    return res.json(info);
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/v2/oauth/jwks
 * Returns JSON Web Key Set with our single public key.
 */
router.get('/jwks', (_req: Request, res: Response) => {
  const jwk = service.getPublicJwk();
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ keys: [jwk] });
});

export default router;
