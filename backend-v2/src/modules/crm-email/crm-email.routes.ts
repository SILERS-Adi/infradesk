import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireWorkspace } from '../../middleware/requireWorkspace';
import { requireAccess, loadMembershipContext } from '../../middleware/requireAccess';
import { HttpError } from '../../utils/httpError';
import { MODULES } from '../../utils/canAccess';
import { encrypt } from '../../lib/crypto';
import { EmailAccountType } from '@prisma/client';

const router = Router();
router.use(requireAuth, requireWorkspace);

// ─────────────────────────────────────────────────────────────────────────────
// MAILBOXES (UserEmailAccount)
// ─────────────────────────────────────────────────────────────────────────────

const createAccountSchema = z.object({
  email: z.string().email(),
  displayName: z.string().max(120).optional(),
  type: z.enum(['PERSONAL', 'SHARED', 'MSP_MAIN']).default('PERSONAL'),
  provider: z.enum(['IMAP', 'GMAIL', 'OUTLOOK']).default('IMAP'),
  imapHost: z.string().max(200).optional(),
  imapPort: z.coerce.number().int().positive().max(65535).optional(),
  imapUsername: z.string().max(200).optional(),
  imapPassword: z.string().max(500).optional(),
  imapUseTls: z.boolean().default(true),
  smtpHost: z.string().max(200).optional(),
  smtpPort: z.coerce.number().int().positive().max(65535).optional(),
  smtpUsername: z.string().max(200).optional(),
  smtpPassword: z.string().max(500).optional(),
});

function publicAccount(a: Record<string, unknown>) {
  const {
    imapPasswordEnc, imapPasswordIv, imapPasswordAuthTag,
    smtpPasswordEnc, smtpPasswordIv, smtpPasswordAuthTag,
    ...safe
  } = a as Record<string, unknown>;
  void imapPasswordEnc; void imapPasswordIv; void imapPasswordAuthTag;
  void smtpPasswordEnc; void smtpPasswordIv; void smtpPasswordAuthTag;
  return { ...safe, hasImapPassword: !!imapPasswordEnc, hasSmtpPassword: !!smtpPasswordEnc };
}

// GET /crm/mailboxes — moje skrzynki (+ SHARED/MSP_MAIN dla admina/ownera)
router.get('/mailboxes', requireAccess(MODULES.CLIENTS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.sub;
    const ctx = await loadMembershipContext(req.membershipId!, req.auth!.isSuperAdmin ?? false);
    const canSeeShared = ctx.role === 'OWNER' || ctx.role === 'ADMIN';

    const where: Record<string, unknown> = {
      workspaceId: req.workspaceId!,
      isActive: true,
      OR: [
        { userId },
        ...(canSeeShared ? [{ type: { in: [EmailAccountType.SHARED, EmailAccountType.MSP_MAIN] } }] : []),
      ],
    };

    const accounts = await prisma.userEmailAccount.findMany({
      where,
      orderBy: [{ type: 'asc' }, { email: 'asc' }],
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { messages: true } },
      },
    });
    res.json({ accounts: accounts.map(publicAccount) });
  } catch (err) { next(err); }
});

router.post('/mailboxes', requireAccess(MODULES.CLIENTS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createAccountSchema.parse(req.body);
    const userId = req.auth!.sub;

    // Tylko OWNER/ADMIN może tworzyć SHARED/MSP_MAIN
    if (input.type !== 'PERSONAL') {
      const ctx = await loadMembershipContext(req.membershipId!, req.auth!.isSuperAdmin ?? false);
      if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') {
        throw HttpError.forbidden('Tylko admin/owner może utworzyć skrzynkę SHARED/MSP_MAIN');
      }
    }

    const data: Record<string, unknown> = {
      workspaceId: req.workspaceId!,
      userId,
      email: input.email,
      displayName: input.displayName ?? null,
      type: input.type,
      provider: input.provider,
      imapHost: input.imapHost ?? null,
      imapPort: input.imapPort ?? null,
      imapUsername: input.imapUsername ?? null,
      imapUseTls: input.imapUseTls,
      smtpHost: input.smtpHost ?? null,
      smtpPort: input.smtpPort ?? null,
      smtpUsername: input.smtpUsername ?? null,
    };
    if (input.imapPassword) {
      const enc = encrypt(input.imapPassword);
      data.imapPasswordEnc = enc.ciphertext;
      data.imapPasswordIv = enc.iv;
      data.imapPasswordAuthTag = enc.authTag;
    }
    if (input.smtpPassword) {
      const enc = encrypt(input.smtpPassword);
      data.smtpPasswordEnc = enc.ciphertext;
      data.smtpPasswordIv = enc.iv;
      data.smtpPasswordAuthTag = enc.authTag;
    }

    const account = await prisma.userEmailAccount.create({ data: data as never });
    res.status(201).json({ account: publicAccount(account as never) });
  } catch (err) { next(err); }
});

router.patch('/mailboxes/:id', requireAccess(MODULES.CLIENTS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.userEmailAccount.findFirst({
      where: { id, workspaceId: req.workspaceId! },
      select: { id: true, userId: true, type: true },
    });
    if (!existing) throw HttpError.notFound();
    if (existing.userId !== req.auth!.sub && existing.type === 'PERSONAL') {
      throw HttpError.forbidden('Nie możesz edytować czyjejś osobistej skrzynki');
    }

    const input = createAccountSchema.partial().parse(req.body);
    const data: Record<string, unknown> = { ...input, imapPassword: undefined, smtpPassword: undefined };
    delete data.imapPassword; delete data.smtpPassword;
    if (input.imapPassword) {
      const enc = encrypt(input.imapPassword);
      data.imapPasswordEnc = enc.ciphertext;
      data.imapPasswordIv = enc.iv;
      data.imapPasswordAuthTag = enc.authTag;
    }
    if (input.smtpPassword) {
      const enc = encrypt(input.smtpPassword);
      data.smtpPasswordEnc = enc.ciphertext;
      data.smtpPasswordIv = enc.iv;
      data.smtpPasswordAuthTag = enc.authTag;
    }
    const updated = await prisma.userEmailAccount.update({ where: { id }, data });
    res.json({ account: publicAccount(updated as never) });
  } catch (err) { next(err); }
});

router.delete('/mailboxes/:id', requireAccess(MODULES.CLIENTS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.userEmailAccount.findFirst({
      where: { id, workspaceId: req.workspaceId! },
      select: { id: true, userId: true, type: true },
    });
    if (!existing) throw HttpError.notFound();
    if (existing.userId !== req.auth!.sub && existing.type === 'PERSONAL') {
      throw HttpError.forbidden('Nie możesz usunąć czyjejś osobistej skrzynki');
    }
    await prisma.userEmailAccount.update({ where: { id }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL MESSAGES (Phase 1: manually added; Phase 2: IMAP sync)
// ─────────────────────────────────────────────────────────────────────────────

const createMessageSchema = z.object({
  accountId: z.string().uuid(),
  direction: z.enum(['INBOUND', 'OUTBOUND']).default('INBOUND'),
  folder: z.enum(['INBOX', 'SENT', 'ARCHIVE', 'SPAM', 'DRAFT']).default('INBOX'),
  fromAddress: z.string().email(),
  fromName: z.string().max(120).optional(),
  toAddresses: z.array(z.string().email()).min(1),
  ccAddresses: z.array(z.string().email()).optional(),
  subject: z.string().max(500).optional(),
  bodyText: z.string().max(50_000).optional(),
  receivedAt: z.string().datetime().optional(),
  linkedTicketId: z.string().uuid().optional().nullable(),
});

router.post('/messages', requireAccess(MODULES.CLIENTS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createMessageSchema.parse(req.body);
    const account = await prisma.userEmailAccount.findFirst({
      where: { id: input.accountId, workspaceId: req.workspaceId! },
      select: { id: true, userId: true, type: true },
    });
    if (!account) throw HttpError.badRequest('Nieznana skrzynka', 'unknown_account');

    // tylko właściciel lub admin dla SHARED może dodawać
    if (account.type === 'PERSONAL' && account.userId !== req.auth!.sub) {
      throw HttpError.forbidden('Nie możesz dodać wiadomości do czyjejś osobistej skrzynki');
    }

    if (input.linkedTicketId) {
      const t = await prisma.ticket.findFirst({
        where: { id: input.linkedTicketId, workspaceId: req.workspaceId! },
        select: { id: true },
      });
      if (!t) throw HttpError.badRequest('Nieznany ticket', 'unknown_ticket');
    }

    const msg = await prisma.emailMessage.create({
      data: {
        workspaceId: req.workspaceId!,
        accountId: account.id,
        direction: input.direction,
        folder: input.folder,
        fromAddress: input.fromAddress,
        fromName: input.fromName ?? null,
        toAddresses: input.toAddresses,
        ccAddresses: input.ccAddresses ?? [],
        subject: input.subject ?? null,
        bodyText: input.bodyText ?? null,
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
        linkedTicketId: input.linkedTicketId ?? null,
        addedManually: true,
        addedByUserId: req.auth!.sub,
      },
    });
    res.status(201).json({ message: msg });
  } catch (err) { next(err); }
});

router.get('/messages', requireAccess(MODULES.CLIENTS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      accountId: z.string().uuid().optional(),
      folder: z.enum(['INBOX', 'SENT', 'ARCHIVE', 'SPAM', 'DRAFT']).optional(),
      ticketId: z.string().uuid().optional(),
      unread: z.enum(['true', 'false']).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);

    const userId = req.auth!.sub;
    const ctx = await loadMembershipContext(req.membershipId!, req.auth!.isSuperAdmin ?? false);
    const canSeeShared = ctx.role === 'OWNER' || ctx.role === 'ADMIN';

    // Limit widoczności: user widzi tylko wiadomości ze swoich skrzynek (+SHARED/MSP_MAIN dla adminów)
    const allowedAccounts = await prisma.userEmailAccount.findMany({
      where: {
        workspaceId: req.workspaceId!,
        isActive: true,
        OR: [
          { userId },
          ...(canSeeShared ? [{ type: { in: [EmailAccountType.SHARED, EmailAccountType.MSP_MAIN] } }] : []),
        ],
      },
      select: { id: true },
    });
    const allowedIds = allowedAccounts.map((a) => a.id);

    const where: Record<string, unknown> = {
      workspaceId: req.workspaceId!,
      accountId: q.accountId ? q.accountId : { in: allowedIds },
    };
    // ochrona: jeśli user podał accountId którego nie ma na allowed — zwróć puste
    if (q.accountId && !allowedIds.includes(q.accountId)) {
      res.json({ messages: [] });
      return;
    }
    if (q.folder) where.folder = q.folder;
    if (q.ticketId) where.linkedTicketId = q.ticketId;
    if (q.unread === 'true') where.isRead = false;

    const messages = await prisma.emailMessage.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: q.limit,
      include: {
        account: { select: { id: true, email: true, type: true } },
        linkedTicket: { select: { id: true, ticketNumber: true, title: true, status: true } },
      },
    });
    res.json({ messages });
  } catch (err) { next(err); }
});

router.post('/messages/:id/link-ticket', requireAccess(MODULES.CLIENTS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = z.object({ ticketId: z.string().uuid().nullable() }).parse(req.body);
    const existing = await prisma.emailMessage.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    if (input.ticketId) {
      const t = await prisma.ticket.findFirst({
        where: { id: input.ticketId, workspaceId: req.workspaceId! },
        select: { id: true },
      });
      if (!t) throw HttpError.badRequest('Nieznany ticket', 'unknown_ticket');
    }
    const msg = await prisma.emailMessage.update({
      where: { id: existing.id },
      data: { linkedTicketId: input.ticketId },
    });
    res.json({ message: msg });
  } catch (err) { next(err); }
});

router.post('/messages/:id/toggle-read', requireAccess(MODULES.CLIENTS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.emailMessage.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true, isRead: true },
    });
    if (!existing) throw HttpError.notFound();
    const msg = await prisma.emailMessage.update({
      where: { id: existing.id },
      data: { isRead: !existing.isRead },
    });
    res.json({ message: msg });
  } catch (err) { next(err); }
});

router.delete('/messages/:id', requireAccess(MODULES.CLIENTS, 'edit'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.emailMessage.findFirst({
      where: { id: String(req.params.id), workspaceId: req.workspaceId! },
      select: { id: true },
    });
    if (!existing) throw HttpError.notFound();
    await prisma.emailMessage.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// CRM ACTIVITIES (tylko moje) — widok "Aktywności" i "Follow-upy"
// ─────────────────────────────────────────────────────────────────────────────

router.get('/activities', requireAccess(MODULES.CLIENTS, 'view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = z.object({
      type: z.string().optional(),
      onlyMine: z.enum(['true', 'false']).optional(),
      followUp: z.enum(['true', 'false']).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    }).parse(req.query);

    const where: Record<string, unknown> = { workspaceId: req.workspaceId! };
    if (q.type) where.type = { in: q.type.split(',') };
    if (q.onlyMine === 'true') {
      where.OR = [
        { createdByUserId: req.auth!.sub },
        { assignedToUserId: req.auth!.sub },
      ];
    }
    if (q.followUp === 'true') where.followUpRequired = true;

    const items = await prisma.crmActivity.findMany({
      where,
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      take: q.limit,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        linkedTicket: { select: { id: true, ticketNumber: true, title: true } },
      },
    });
    res.json({ items });
  } catch (err) { next(err); }
});

export default router;
