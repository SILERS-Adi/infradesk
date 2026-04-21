import request from 'supertest';
import type { Express } from 'express';
import { testDb } from './db';

export const TEST_PASSWORD = 'Silers!Test2026';

export interface RegisteredUser {
  userId: string;
  email: string;
  accessToken: string;
  workspaceId: string;
  refreshCookie: string;
}

export function cookiesFrom(res: request.Response): string[] {
  const raw = res.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw as string];
}

export function refreshCookieFrom(res: request.Response): string {
  return cookiesFrom(res).find((c) => c.startsWith('refresh_token='))!;
}

let userCounter = 0;

export async function registerWithWorkspace(app: Express, opts: { slug?: string; role?: 'OWNER' | 'ADMIN' | 'MEMBER' } = {}): Promise<RegisteredUser> {
  userCounter += 1;
  const suffix = `${Date.now().toString(36)}-${userCounter}`;
  const slug = opts.slug ?? `ws-${suffix}`;
  const email = `user-${suffix}@test.local`;
  const res = await request(app).post('/api/v2/auth/register').send({
    email, password: TEST_PASSWORD,
    firstName: 'Test', lastName: `User${userCounter}`,
    workspaceName: `WS ${suffix}`, workspaceSlug: slug,
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);

  const { user, accessToken, defaultWorkspaceId } = res.body as { user: { id: string }; accessToken: string; defaultWorkspaceId: string };
  return {
    userId: user.id,
    email,
    accessToken,
    workspaceId: defaultWorkspaceId,
    refreshCookie: refreshCookieFrom(res),
  };
}

export async function seedLocation(workspaceId: string, overrides: Partial<{ name: string; city: string }> = {}) {
  return testDb.location.create({
    data: {
      workspaceId,
      name: overrides.name ?? 'Testowa lokalizacja',
      type: 'OFFICE',
      addressLine1: 'ul. Testowa 1',
      postalCode: '00-001',
      city: overrides.city ?? 'Warszawa',
      country: 'PL',
    },
  });
}
