/**
 * Iris embed controller — issues short-lived JWT tokens for the
 * /iris-embed SPA page so that the Asystent desktop webview can
 * open Iris without sharing the main session cookie.
 *
 * DEPLOY LOCATION: /home/adrian/infradesk/backend-v2/src/modules/iris/iris-embed.controller.ts
 * ROUTE MOUNT:     /api/v2/iris/embed-token  (GET, requires existing auth)
 *
 * Wire into backend-v2 app.module.ts (or equivalent router file) alongside
 * the other /api/v2/* controllers. The existing auth middleware must run
 * BEFORE this route -- we require a logged-in user context.
 */
import { Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';

const EMBED_JWT_SECRET =
  process.env.IRIS_EMBED_JWT_SECRET ||
  process.env.JWT_SECRET ||
  'dev-embed-secret-change-in-prod';

const EMBED_TTL_SECONDS = 15 * 60; // 15 min

interface AuthedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    workspaceId?: string;
    role?: string;
  };
}

export function issueIrisEmbedToken(req: AuthedRequest, res: Response): void {
  const u = req.user;
  if (!u || !u.id) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  const payload = {
    sub: u.id,
    email: u.email || null,
    workspaceId: u.workspaceId || null,
    role: u.role || null,
    scope: 'iris-embed',
    iat: Math.floor(Date.now() / 1000),
  };
  const token = jwt.sign(payload, EMBED_JWT_SECRET, {
    expiresIn: EMBED_TTL_SECONDS,
  });
  res.json({ token, expiresIn: EMBED_TTL_SECONDS });
}

/**
 * Verify an embed token. Called by the chat/send endpoint so that
 * /iris-embed can forward messages with just the query-param token
 * (no session cookie needed when running inside the Asystent webview).
 */
export function verifyIrisEmbedToken(token: string): {
  userId: string;
  workspaceId: string | null;
  email: string | null;
} | null {
  try {
    const decoded = jwt.verify(token, EMBED_JWT_SECRET) as {
      sub: string;
      email: string | null;
      workspaceId: string | null;
      scope: string;
    };
    if (decoded.scope !== 'iris-embed') return null;
    return {
      userId: decoded.sub,
      workspaceId: decoded.workspaceId || null,
      email: decoded.email || null,
    };
  } catch {
    return null;
  }
}

export function irisEmbedRouter(authMiddleware: any): Router {
  const r = Router();
  r.get('/embed-token', authMiddleware, issueIrisEmbedToken);
  return r;
}
