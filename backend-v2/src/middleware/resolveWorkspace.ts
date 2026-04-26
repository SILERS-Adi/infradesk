import type { NextFunction, Request, Response } from 'express';
import { prismaBg as prisma } from "../lib/prisma-bg";

/**
 * Resolves the workspace from the incoming request Host header.
 *
 *   dworosmolice.infradesk.pl → workspace with slug="dworosmolice"
 *   silers.infradesk.pl       → workspace with slug="silers" (MSP)
 *   v2.infradesk.pl           → no workspace (global login page)
 *   admin.infradesk.pl        → reserved for SuperAdmin panel (no workspace)
 *   localhost / *.local       → no workspace (dev/test)
 *
 * Attaches `req.resolvedWorkspace` as optional hint. Does NOT enforce
 * membership — that's `requireWorkspace` job. This middleware is a hint
 * for login redirects and UI branding.
 */

const RESERVED_SUBDOMAINS = new Set(['v2', 'admin', 'www', 'api', 'app', 'mail']);

interface ResolvedWorkspaceHint {
  slug: string;
  workspaceId: string;
  name: string;
  type: 'MSP' | 'CLIENT' | 'INTERNAL_IT';
  brandingLogoUrl: string | null;
  brandingPrimaryColor: string | null;
}

declare global {
  namespace Express {
    interface Request {
      resolvedWorkspace?: ResolvedWorkspaceHint;
      hostSubdomain?: string;
    }
  }
}

function extractSubdomain(host: string): string | null {
  // Strip port.
  const plainHost = host.split(':')[0]!.toLowerCase();

  // Dev helpers.
  if (plainHost === 'localhost' || plainHost.endsWith('.local')) return null;

  const parts = plainHost.split('.');
  // Need at least subdomain.domain.tld (3 parts). Raw domain gets null.
  if (parts.length < 3) return null;

  const sub = parts[0]!;
  if (RESERVED_SUBDOMAINS.has(sub)) return null;
  if (!/^[a-z0-9-]{3,40}$/.test(sub)) return null;
  return sub;
}

export async function resolveWorkspaceFromHost(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const host = req.header('host') ?? '';
  const sub = extractSubdomain(host);
  req.hostSubdomain = sub ?? undefined;

  if (!sub) return next();

  try {
    const ws = await prisma.workspace.findUnique({
      where: { slug: sub },
      select: {
        id: true, slug: true, name: true, type: true, logoUrl: true, primaryColor: true, isActive: true,
      },
    });
    if (ws && ws.isActive) {
      req.resolvedWorkspace = {
        slug: ws.slug,
        workspaceId: ws.id,
        name: ws.name,
        type: ws.type,
        brandingLogoUrl: ws.logoUrl,
        brandingPrimaryColor: ws.primaryColor,
      };
    }
    next();
  } catch (err) {
    next(err);
  }
}
