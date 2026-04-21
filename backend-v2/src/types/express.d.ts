import type { AccessTokenPayload } from '../lib/jwt';

declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
      workspaceId?: string;
      membershipId?: string;
      requestId?: string;
    }
  }
}

export {};
