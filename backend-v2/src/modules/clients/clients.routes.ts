import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { sendClientInviteEmail } from '../../lib/mailer';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';
import { enforceCountLimit, countActiveMspClients } from '../../utils/planLimits';
import { hashPassword, validatePasswordStrength } from '../../lib/password';
import { randomToken } from '../../lib/crypto';
import { config } from '../../config';

const router = Router();
router.use(requireAuth, requireWorkspace);

// GET /clients/lookup/ceidg?nip=X — fetch company data from Biznes.gov.pl hurtownia
router.get('/lookup/ceidg', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const nipRaw = String(req.query.nip ?? '').replace(/[^0-9]/g, '');
    if (nipRaw.length !== 10) throw HttpError.badRequest('NIP musi mieć 10 cyfr');
    if (!config.CEIDG_API_TOKEN) throw HttpError.internal('Brak tokenu CEIDG w konfiguracji (.env)');
    const url = `https://dane.biznes.gov.pl/api/ceidg/v3/firmy?nip=${nipRaw}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${config.CEIDG_API_TOKEN}`, Accept: 'application/json' } });
    if (r.status === 204) { res.json({ found: false }); return; }
    if (!r.ok) {
      const body = await r.text();
      throw HttpError.internal(`CEIDG API ${r.status}: ${body.slice(0, 200)}`);
    }
    const data = await r.json() as { firmy?: Array<Record<string, unknown>> };
    const firma = data.firmy?.[0];
    if (!firma) { res.json({ found: false }); return; }
    const adres = (firma.adresDzialalnosci ?? {}) as Record<string, string>;
    const wlasciciel = (firma.wlasciciel ?? {}) as Record<string, string>;
    res.json({
      found: true,
      data: {
        name: (firma.nazwa as string) ?? '',
        taxId: (firma.nip as string) ?? nipRaw,
        regon: (firma.regon as string) ?? null,
        status: (firma.status as string) ?? null,
        addressLine1: [adres.ulica, adres.budynek].filter(Boolean).join(' ') || null,
        postalCode: adres.kod ?? null,
        city: adres.miasto ?? null,
        ownerFirstName: wlasciciel.imie ?? '',
        ownerLastName: wlasciciel.nazwisko ?? '',
        startDate: (firma.dataRozpoczecia as string) ?? null,
      },
    });
  } catch (err) { next(err); }
});

/**
 * Clients module — for MSP workspaces to manage their client companies.
 * A "client" = another Workspace of type=CLIENT linked via WorkspaceRelation
 * with providerWorkspaceId=<current MSP ws>.
 *
 * Not applicable for CLIENT or INTERNAL_IT workspaces.
 */

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

// GET /clients — list WorkspaceRelation for current MSP workspace
router.get('/', requireAccess(MODULES.CLIENTS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const relations = await prisma.workspaceRelation.findMany({
      where: { providerWorkspaceId: req.workspaceId! },
      include: {
        client: {
          select: {
            id: true, slug: true, name: true, taxId: true, regon: true,
            logoUrl: true, primaryColor: true, plan: true,
            city: true, postalCode: true, email: true, phone: true, website: true,
            isActive: true, createdAt: true,
            _count: { select: { locations: true, devices: true, tickets: true, memberships: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Attach risk scores (latest per client).
    const clientIds = relations.map((r) => r.clientWorkspaceId);
    const riskScores = clientIds.length > 0 ? await prisma.$queryRaw<Array<{ clientWorkspaceId: string; score: number; trend7d: number; computedAt: Date }>>`
      SELECT DISTINCT ON ("clientWorkspaceId") "clientWorkspaceId", score, "trend7d", "computedAt"
      FROM "ClientRiskScore"
      WHERE "workspaceId" = ${req.workspaceId!} AND "clientWorkspaceId" = ANY(${clientIds})
      ORDER BY "clientWorkspaceId", "computedAt" DESC
    ` : [];
    const byClient = new Map(riskScores.map((r) => [r.clientWorkspaceId, r]));

    res.json({
      clients: relations.map((r) => ({
        relationId: r.id,
        status: r.status,
        billingType: r.billingType,
        billingPeriod: r.billingPeriod,
        hourlyRateNet: r.hourlyRateNet,
        monthlyNet: r.monthlyNet,
        monthlyHours: r.monthlyHours,
        canViewDevices: r.canViewDevices,
        canViewUsers: r.canViewUsers,
        canViewLocations: r.canViewLocations,
        canReceiveTickets: r.canReceiveTickets,
        canCreateTicketsOnBehalf: r.canCreateTicketsOnBehalf,
        canAccessAlerts: r.canAccessAlerts,
        canAccessCredentials: r.canAccessCredentials,
        client: r.client,
        risk: byClient.get(r.clientWorkspaceId) ?? null,
      })),
    });
  } catch (err) { next(err); }
});

const createClientSchema = z.object({
  // Company (new client workspace)
  name: z.string().min(2).max(120).trim(),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/).optional(),
  taxId: z.string().max(20).optional(),
  regon: z.string().max(20).optional(),
  addressLine1: z.string().max(200).optional(),
  postalCode: z.string().max(20).optional(),
  city: z.string().max(80).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  website: z.string().url().optional(),

  // Primary contact — OwnerKlient who will receive the invite
  ownerEmail: z.string().email(),
  ownerFirstName: z.string().min(1).max(100),
  ownerLastName: z.string().min(1).max(100),
  ownerPhone: z.string().max(40).optional(),

  // Relation / billing
  billingType: z.enum(['HOURLY', 'SUBSCRIPTION', 'HYBRID']).default('HOURLY'),
  hourlyRateNet: z.number().nonnegative().optional(),
  monthlyNet: z.number().nonnegative().optional(),
  monthlyHours: z.number().int().positive().optional(),
});

router.post('/', requireAccess(MODULES.CLIENTS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createClientSchema.parse(req.body);
    const slug = input.slug ?? slugify(input.name);

    // Slug availability
    const existing = await prisma.workspace.findUnique({ where: { slug }, select: { id: true } });
    if (existing) throw HttpError.conflict('Subdomena zajęta — wybierz inny slug', 'slug_taken');

    // Provider workspace must be MSP
    const provider = await prisma.workspace.findUnique({
      where: { id: req.workspaceId! },
      select: { type: true },
    });
    if (provider?.type !== 'MSP') throw HttpError.forbidden('Tylko MSP może dodawać klientów');

    const used = await countActiveMspClients(req.workspaceId!);
    await enforceCountLimit(req.workspaceId!, 'mspClients', used);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create client workspace
      const clientWs = await tx.workspace.create({
        data: {
          slug,
          name: input.name,
          type: 'CLIENT',
          plan: 'START',
          taxId: input.taxId,
          regon: input.regon,
          addressLine1: input.addressLine1,
          postalCode: input.postalCode,
          city: input.city,
          email: input.email,
          phone: input.phone,
          website: input.website,
        },
      });

      // 2. Create OwnerKlient user (or reuse existing by email)
      let ownerUser = await tx.user.findUnique({ where: { email: input.ownerEmail.toLowerCase() } });
      const tempPassword = randomToken(16); // user will reset via invite link
      if (!ownerUser) {
        const pw = validatePasswordStrength(`T${tempPassword}A1@`);
        ownerUser = await tx.user.create({
          data: {
            email: input.ownerEmail.toLowerCase(),
            firstName: input.ownerFirstName,
            lastName: input.ownerLastName,
            phone: input.ownerPhone,
            passwordHash: await hashPassword(pw.ok ? `T${tempPassword}A1@` : 'Temp!Pass2026'),
            isActive: true,
            emailVerified: false,
          },
        });
      }

      // 3. OwnerKlient membership in the new client workspace
      await tx.membership.create({
        data: {
          userId: ownerUser.id,
          workspaceId: clientWs.id,
          role: 'OWNER',
          scope: 'FULL',
          status: 'INVITED',
          isDefault: true,
          invitedAt: new Date(),
          invitedByUserId: req.auth!.sub,
        },
      });

      // 4. WorkspaceRelation (MSP ↔ new client)
      const relation = await tx.workspaceRelation.create({
        data: {
          providerWorkspaceId: req.workspaceId!,
          clientWorkspaceId: clientWs.id,
          status: 'ACTIVE',
          billingType: input.billingType,
          hourlyRateNet: input.hourlyRateNet !== undefined ? new Prisma.Decimal(input.hourlyRateNet.toFixed(2)) : null,
          monthlyNet: input.monthlyNet !== undefined ? new Prisma.Decimal(input.monthlyNet.toFixed(2)) : null,
          monthlyHours: input.monthlyHours,
        },
      });

      // 5. Create password reset token for the invite email
      const resetToken = randomToken(24);
      const { hashToken } = await import('../../lib/crypto');
      await tx.passwordResetToken.create({
        data: {
          userId: ownerUser.id,
          tokenHash: hashToken(resetToken),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      return { clientWs, ownerUser, relation, resetToken };
    });

    // Send invite email (best-effort).
    try {
      // Resolve inviter name
      const inviter = await prisma.user.findUnique({
        where: { id: req.auth!.sub },
        select: { firstName: true, lastName: true },
      });
      const inviterName = [inviter?.firstName, inviter?.lastName].filter(Boolean).join(' ') || null;
      void sendClientInviteEmail(
        result.ownerUser.email,
        result.resetToken,
        result.clientWs.name,
        inviterName,
      );
    } catch (err) {
      void err; // do not fail if email send fails
    }

    res.status(201).json({
      client: result.clientWs,
      owner: {
        email: result.ownerUser.email,
        firstName: result.ownerUser.firstName,
        lastName: result.ownerUser.lastName,
      },
      relation: result.relation,
      inviteUrl: `https://${result.clientWs.slug}.infradesk.pl/login?invite=${result.resetToken}`,
    });
  } catch (err) { next(err); }
});

// GET /clients/:id — detail with full stats
router.get('/:id', requireAccess(MODULES.CLIENTS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const relation = await prisma.workspaceRelation.findFirst({
      where: {
        providerWorkspaceId: req.workspaceId!,
        clientWorkspaceId: String(req.params.id),
      },
      include: {
        client: {
          select: {
            id: true, slug: true, name: true, taxId: true, regon: true, logoUrl: true,
            primaryColor: true, plan: true, email: true, phone: true, website: true,
            addressLine1: true, addressLine2: true, postalCode: true, city: true, country: true,
            isActive: true, createdAt: true,
            _count: { select: { locations: true, devices: true, tickets: true, memberships: true } },
          },
        },
      },
    });
    if (!relation) throw HttpError.notFound('Klient nie znaleziony');

    // Latest risk score
    const risk = await prisma.clientRiskScore.findFirst({
      where: { workspaceId: req.workspaceId!, clientWorkspaceId: relation.clientWorkspaceId },
      orderBy: { computedAt: 'desc' },
    });

    // Recent tickets, sessions, locations, devices
    const [recentTickets, locations, devices, contacts] = await Promise.all([
      prisma.ticket.findMany({
        where: { workspaceId: relation.clientWorkspaceId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, ticketNumber: true, title: true, status: true, priority: true, createdAt: true,
        },
      }),
      prisma.location.findMany({
        where: { workspaceId: relation.clientWorkspaceId, deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, city: true, type: true },
      }),
      prisma.device.findMany({
        where: { workspaceId: relation.clientWorkspaceId, deletedAt: null },
        orderBy: { name: 'asc' },
        take: 20,
        select: { id: true, name: true, category: true, status: true, criticality: true, hostname: true },
      }),
      prisma.contact.findMany({
        where: { workspaceId: req.workspaceId!, clientWorkspaceId: relation.clientWorkspaceId },
        orderBy: { isMainContact: 'desc' },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, position: true, isMainContact: true },
      }),
    ]);

    res.json({ relation, risk, recentTickets, locations, devices, contacts });
  } catch (err) { next(err); }
});

const updateRelationSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'TERMINATED']).optional(),
  billingType: z.enum(['HOURLY', 'SUBSCRIPTION', 'HYBRID']).optional(),
  billingPeriod: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
  hourlyRateNet: z.number().nonnegative().optional().nullable(),
  overageRateNet: z.number().nonnegative().optional().nullable(),
  monthlyNet: z.number().nonnegative().optional().nullable(),
  monthlyHours: z.number().int().positive().optional().nullable(),
  billingIncrementMin: z.number().int().positive().optional(),
  canViewDevices: z.boolean().optional(),
  canViewUsers: z.boolean().optional(),
  canViewLocations: z.boolean().optional(),
  canReceiveTickets: z.boolean().optional(),
  canCreateTicketsOnBehalf: z.boolean().optional(),
  canAccessAlerts: z.boolean().optional(),
  canAccessCredentials: z.boolean().optional(),
  company: z.object({
    name: z.string().min(2).max(120).optional(),
    taxId: z.string().max(20).optional().nullable(),
    city: z.string().max(80).optional().nullable(),
    email: z.string().email().max(120).optional().nullable().or(z.literal('')),
    phone: z.string().max(40).optional().nullable(),
    website: z.string().max(200).optional().nullable().or(z.literal('')),
    addressLine1: z.string().max(200).optional().nullable(),
    postalCode: z.string().max(20).optional().nullable(),
  }).optional(),
});

router.patch('/:id', requireAccess(MODULES.CLIENTS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = updateRelationSchema.parse(req.body);
    const relation = await prisma.workspaceRelation.findFirst({
      where: {
        providerWorkspaceId: req.workspaceId!,
        clientWorkspaceId: String(req.params.id),
      },
      select: { id: true, clientWorkspaceId: true },
    });
    if (!relation) throw HttpError.notFound();
    const { company, ...relationInput } = input;
    const data: Record<string, unknown> = { ...relationInput };
    if (relationInput.hourlyRateNet !== undefined) data.hourlyRateNet = relationInput.hourlyRateNet === null ? null : new Prisma.Decimal(relationInput.hourlyRateNet.toFixed(2));
    if (relationInput.overageRateNet !== undefined) data.overageRateNet = relationInput.overageRateNet === null ? null : new Prisma.Decimal(relationInput.overageRateNet.toFixed(2));
    if (relationInput.monthlyNet !== undefined) data.monthlyNet = relationInput.monthlyNet === null ? null : new Prisma.Decimal(relationInput.monthlyNet.toFixed(2));
    const updated = await prisma.workspaceRelation.update({ where: { id: relation.id }, data });
    if (company && Object.keys(company).length > 0) {
      const companyData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(company)) {
        if (v !== undefined) companyData[k] = v === '' ? null : v;
      }
      await prisma.workspace.update({ where: { id: relation.clientWorkspaceId }, data: companyData });
    }
    res.json({ relation: updated });
  } catch (err) { next(err); }
});

export default router;
