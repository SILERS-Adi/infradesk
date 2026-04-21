import { Client } from 'pg';
import { buildApp } from '../../src/app';
import { resetDatabase, disconnect } from '../helpers/db';
import { registerWithWorkspace } from '../helpers/factories';

const app = buildApp();

function appRoleUrl(): string {
  const base = process.env.DATABASE_URL!;
  // Replace the user portion (infradesk_v2) with the limited role.
  // We assume the migration has created infradesk_v2_app with password 'change-me-in-production'.
  return base
    .replace(/:\/\/[^@]+@/, '://infradesk_v2_app:change-me-in-production@');
}

describe('RLS — defense in depth (limited role)', () => {
  beforeEach(async () => { await resetDatabase(); });
  afterAll(async () => { await disconnect(); });

  it('limited role cannot SELECT Ticket across workspaces', async () => {
    const a = await registerWithWorkspace(app);
    const b = await registerWithWorkspace(app);
    const ticketA = await (await import('supertest')).default(app)
      .post('/api/v2/tickets')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ title: 'Secret A', description: 'body', source: 'MANUAL' });
    expect(ticketA.status).toBe(201);

    const client = new Client({ connectionString: appRoleUrl() });
    await client.connect();
    try {
      // Without app.current_workspace set, policies default-deny.
      const noCtx = await client.query(`SELECT COUNT(*)::int AS n FROM "Ticket"`);
      expect(noCtx.rows[0].n).toBe(0);

      // Set ws A → sees 1 ticket.
      await client.query(`SELECT set_config('app.current_workspace', $1, false)`, [a.workspaceId]);
      await client.query(`SELECT set_config('app.current_user', $1, false)`, [a.userId]);
      await client.query(`SELECT set_config('app.is_super_admin', '0', false)`);
      const inA = await client.query(`SELECT COUNT(*)::int AS n FROM "Ticket"`);
      expect(inA.rows[0].n).toBe(1);

      // Set ws B → sees 0 tickets (ticket belongs to ws A).
      await client.query(`SELECT set_config('app.current_workspace', $1, false)`, [b.workspaceId]);
      const inB = await client.query(`SELECT COUNT(*)::int AS n FROM "Ticket"`);
      expect(inB.rows[0].n).toBe(0);

      // Super-admin bypass.
      await client.query(`SELECT set_config('app.is_super_admin', '1', false)`);
      const superA = await client.query(`SELECT COUNT(*)::int AS n FROM "Ticket"`);
      expect(superA.rows[0].n).toBe(1);
    } finally {
      await client.end();
    }
  });

  it('limited role cannot INSERT into foreign workspace', async () => {
    const a = await registerWithWorkspace(app);
    const b = await registerWithWorkspace(app);

    const client = new Client({ connectionString: appRoleUrl() });
    await client.connect();
    try {
      await client.query(`SELECT set_config('app.current_workspace', $1, false)`, [a.workspaceId]);
      await client.query(`SELECT set_config('app.current_user', $1, false)`, [a.userId]);
      await client.query(`SELECT set_config('app.is_super_admin', '0', false)`);

      // Insert into A — allowed.
      const ok = await client.query(
        `INSERT INTO "Location" (id, "workspaceId", name, type, "addressLine1", "postalCode", city, country, "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, 'OK', 'OFFICE', 'x', '00-000', 'x', 'PL', now(), now()) RETURNING id`,
        [a.workspaceId],
      );
      expect(ok.rows).toHaveLength(1);

      // Insert into B (while context is A) — RLS blocks via WITH CHECK.
      await expect(
        client.query(
          `INSERT INTO "Location" (id, "workspaceId", name, type, "addressLine1", "postalCode", city, country, "createdAt", "updatedAt") VALUES (gen_random_uuid(), $1, 'SNEAK', 'OFFICE', 'x', '00-000', 'x', 'PL', now(), now())`,
          [b.workspaceId],
        ),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await client.end();
    }
  });
});
