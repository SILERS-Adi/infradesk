/**
 * Iris Chat Controller — Faza 4 of Asystent Biznes 5.0
 *
 * POST /api/v2/iris/chat — agentic Iris chat with 8 tool calls scoped to the
 * caller's workspace. Auth via session cookie (requireAuth) or embed-token
 * Bearer (verifyIrisEmbedToken). The system prompt is dynamic per
 * workspace type (CLIENT vs MSP).
 *
 * Tools (all scoped to workspaceId):
 *  1. utworz_zgloszenie              — create a ticket
 *  2. sprawdz_status                 — check ticket status
 *  3. lista_moich_zgloszen           — list my tickets
 *  4. zglos_problem_z_urzadzeniem    — create ticket linked to a device
 *  5. popros_o_oddzwonienie          — request a callback (CrmActivity)
 *  6. dodaj_komentarz_do_zgloszenia  — append a public comment
 *  7. anuluj_zgloszenie              — cancel a ticket (if not terminal)
 *  8. ocen_zakonczone                — rate a closed/resolved ticket
 *
 * Cost log: LlmUsage row per LLM call (feature='iris_chat_tools').
 */
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { irisLimiter } from '../../middleware/rateLimit';
import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  Tool,
  ContentBlockParam,
  ToolUseBlock,
  TextBlock,
} from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { HttpError } from '../../utils/httpError';
import { verifyAccessToken } from '../../lib/jwt';
import { verifyIrisEmbedToken } from './iris-embed.controller';
import { assertTransition, type TicketStatus } from '../../utils/ticketStateMachine';
import { nextTicketNumber } from '../tickets/tickets.service';

// ─── LLM client + pricing ───────────────────────────────────────────────────
let anthropicClient: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!config.ANTHROPIC_API_KEY) {
    throw HttpError.badRequest('AI nie jest skonfigurowane (brak klucza Anthropic)', 'ai_not_configured');
  }
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  return anthropicClient;
}

const MODEL_PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
};
const USD_TO_PLN = 4.1;

function estimateCostPln(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICES_USD_PER_MTOK[model] ?? MODEL_PRICES_USD_PER_MTOK['claude-sonnet-4-6']!;
  const usd = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  return Number((usd * USD_TO_PLN).toFixed(4));
}

// ─── Auth: session cookie OR embed Bearer ───────────────────────────────────
interface IrisAuthContext {
  userId: string;
  workspaceId: string;
  email: string | null;
}

async function resolveIrisAuth(req: Request): Promise<IrisAuthContext | null> {
  const header = req.header('authorization');
  const bearer = header && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const cookieTok = (req.cookies?.access_token as string | undefined) ?? null;

  for (const tok of [bearer, cookieTok]) {
    if (!tok) continue;
    try {
      const payload = verifyAccessToken(tok);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, isActive: true, deletedAt: true, tokenVersion: true },
      });
      if (!user || !user.isActive || user.deletedAt) continue;
      if (user.tokenVersion !== payload.tokenVersion) continue;

      const headerWs = req.header('x-workspace-id')?.trim();
      let ws: string | null = null;
      if (headerWs) {
        const m = await prisma.membership.findFirst({
          where: { userId: user.id, workspaceId: headerWs, status: 'ACTIVE' },
          select: { workspaceId: true },
        });
        if (m) ws = m.workspaceId;
      }
      if (!ws && payload.workspaceId) {
        const m = await prisma.membership.findFirst({
          where: { userId: user.id, workspaceId: payload.workspaceId, status: 'ACTIVE' },
          select: { workspaceId: true },
        });
        if (m) ws = m.workspaceId;
      }
      if (!ws) {
        const m = await prisma.membership.findFirst({
          where: { userId: user.id, status: 'ACTIVE', isDefault: true },
          select: { workspaceId: true },
        });
        if (m) ws = m.workspaceId;
      }
      if (!ws) {
        const m = await prisma.membership.findFirst({
          where: { userId: user.id, status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          select: { workspaceId: true },
        });
        if (m) ws = m.workspaceId;
      }
      if (!ws) continue;
      return { userId: user.id, workspaceId: ws, email: user.email };
    } catch {
      // try next
    }
  }

  if (bearer) {
    const embed = verifyIrisEmbedToken(bearer);
    if (embed && embed.workspaceId) {
      return { userId: embed.userId, workspaceId: embed.workspaceId, email: embed.email };
    }
  }

  return null;
}

// ─── Tool scope context ─────────────────────────────────────────────────────
interface ToolContext {
  userId: string;
  userEmail: string | null;
  callerWorkspaceId: string;
  callerWorkspaceType: 'MSP' | 'CLIENT' | 'INTERNAL_IT';
  callerWorkspaceName: string;
  providerWorkspaceId: string;
  isClient: boolean;
}

async function buildToolContext(ctx: IrisAuthContext): Promise<ToolContext> {
  const ws = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { id: true, name: true, type: true },
  });
  if (!ws) throw HttpError.forbidden('Workspace not found', 'workspace_not_found');

  let providerWorkspaceId = ws.id;
  if (ws.type === 'CLIENT') {
    const rel = await prisma.workspaceRelation.findFirst({
      where: { clientWorkspaceId: ws.id, status: 'ACTIVE' },
      select: { providerWorkspaceId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (rel) providerWorkspaceId = rel.providerWorkspaceId;
  }

  return {
    userId: ctx.userId,
    userEmail: ctx.email,
    callerWorkspaceId: ws.id,
    callerWorkspaceType: ws.type as 'MSP' | 'CLIENT' | 'INTERNAL_IT',
    callerWorkspaceName: ws.name,
    providerWorkspaceId,
    isClient: ws.type === 'CLIENT',
  };
}

// ─── System prompt builder ──────────────────────────────────────────────────
function buildSystemPrompt(tc: ToolContext): string {
  const today = new Date().toISOString().slice(0, 10);
  if (tc.isClient) {
    return `Jesteś Iris — asystentem AI firmy ${tc.callerWorkspaceName}. Obsługuje IT poprzez Silers (infradesk.pl).
Twoje zadania: pomoc w zgłaszaniu problemów IT, sprawdzanie statusu zgłoszeń, komunikacja z zespołem serwisowym.
Używasz polskich nazw akcji. Jesteś konkretny, zwięzły, profesjonalny — nie używasz emoji w odpowiedziach.
Masz 8 narzędzi: utworz_zgloszenie, sprawdz_status, lista_moich_zgloszen, zglos_problem_z_urzadzeniem,
popros_o_oddzwonienie, dodaj_komentarz_do_zgloszenia, anuluj_zgloszenie, ocen_zakonczone.
Jeśli użytkownik opisuje problem — najpierw ustal priorytet (LOW/MEDIUM/HIGH/CRITICAL) i użyj narzędzia.
Dzisiejsza data: ${today}.`;
  }
  return `Jesteś Iris — asystent dla zespołu Silers (MSP). Pomagasz serwisantom obsługiwać klientów i zarządzać zgłoszeniami.
Masz dostęp do wszystkich ticketów, klientów, urządzeń w workspace ${tc.callerWorkspaceName}. Możesz tworzyć, edytować, zamykać.
Odpowiadasz po polsku, zwięźle i konkretnie. Nie używasz emoji.
Masz 8 narzędzi: utworz_zgloszenie, sprawdz_status, lista_moich_zgloszen, zglos_problem_z_urzadzeniem,
popros_o_oddzwonienie, dodaj_komentarz_do_zgloszenia, anuluj_zgloszenie, ocen_zakonczone.
Dzisiejsza data: ${today}.`;
}

// ─── Tool definitions (Anthropic JSON schema) ───────────────────────────────
const TOOLS: Tool[] = [
  {
    name: 'utworz_zgloszenie',
    description: 'Tworzy nowe zgłoszenie (ticket) serwisowe. Używaj gdy użytkownik zgłasza problem, żądanie lub incydent.',
    input_schema: {
      type: 'object',
      properties: {
        opis: { type: 'string', description: 'Szczegółowy opis problemu' },
        priorytet: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], description: 'Priorytet zgłoszenia' },
        tytul: { type: 'string', description: 'Krótki tytuł (opcjonalnie)' },
        nazwa_urzadzenia: { type: 'string', description: 'Nazwa urządzenia, jeśli dotyczy (opcjonalnie)' },
      },
      required: ['opis', 'priorytet'],
    },
  },
  {
    name: 'sprawdz_status',
    description: 'Sprawdza aktualny status jednego zgłoszenia po numerze (np. T-2026-0042).',
    input_schema: {
      type: 'object',
      properties: {
        numer_ticketu: { type: 'string', description: 'Numer ticketu, np. T-2026-0042' },
      },
      required: ['numer_ticketu'],
    },
  },
  {
    name: 'lista_moich_zgloszen',
    description: 'Zwraca listę zgłoszeń użytkownika/workspace, z opcjonalnym filtrem kategorii statusu.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maks. liczba wyników (domyślnie 10)' },
        status: { type: 'string', enum: ['nowe', 'w_toku', 'zamknięte'], description: 'Kategoria statusu' },
      },
    },
  },
  {
    name: 'zglos_problem_z_urzadzeniem',
    description: 'Tworzy zgłoszenie powiązane z konkretnym urządzeniem (wyszukiwanym po nazwie, fuzzy).',
    input_schema: {
      type: 'object',
      properties: {
        nazwa_urzadzenia: { type: 'string', description: 'Nazwa lub fragment nazwy urządzenia' },
        opis: { type: 'string', description: 'Opis problemu' },
        priorytet: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], description: 'Priorytet (domyślnie MEDIUM)' },
      },
      required: ['nazwa_urzadzenia', 'opis'],
    },
  },
  {
    name: 'popros_o_oddzwonienie',
    description: 'Rejestruje prośbę o oddzwonienie (aktywność CRM typu PHONE, zaplanowana ręcznie przez MSP).',
    input_schema: {
      type: 'object',
      properties: {
        temat: { type: 'string', description: 'Temat rozmowy' },
        numer_telefonu: { type: 'string', description: 'Opcjonalny numer telefonu' },
        preferowana_godzina: { type: 'string', description: 'Opcjonalnie, preferowana pora kontaktu' },
      },
      required: ['temat'],
    },
  },
  {
    name: 'dodaj_komentarz_do_zgloszenia',
    description: 'Dodaje publiczny komentarz do istniejącego ticketu.',
    input_schema: {
      type: 'object',
      properties: {
        numer_ticketu: { type: 'string' },
        tresc: { type: 'string', description: 'Treść komentarza' },
      },
      required: ['numer_ticketu', 'tresc'],
    },
  },
  {
    name: 'anuluj_zgloszenie',
    description: 'Anuluje zgłoszenie (zmienia status na CANCELLED). Nie działa dla ticketów już zamkniętych/rozwiązanych.',
    input_schema: {
      type: 'object',
      properties: {
        numer_ticketu: { type: 'string' },
        powod: { type: 'string', description: 'Powód anulowania' },
      },
      required: ['numer_ticketu', 'powod'],
    },
  },
  {
    name: 'ocen_zakonczone',
    description: 'Ocenia zamknięte/rozwiązane zgłoszenie w skali 1-5 z opcjonalnym komentarzem.',
    input_schema: {
      type: 'object',
      properties: {
        numer_ticketu: { type: 'string' },
        ocena: { type: 'integer', minimum: 1, maximum: 5 },
        komentarz: { type: 'string' },
      },
      required: ['numer_ticketu', 'ocena'],
    },
  },
];

// ─── Tool result type ───────────────────────────────────────────────────────
type ToolResult = Record<string, unknown>;

async function findScopedTicket(tc: ToolContext, ticketNumber: string) {
  const where: Record<string, unknown> = {
    ticketNumber,
    workspaceId: tc.providerWorkspaceId,
    deletedAt: null,
  };
  if (tc.isClient) where.clientWorkspaceId = tc.callerWorkspaceId;
  return prisma.ticket.findFirst({
    where,
    select: {
      id: true,
      ticketNumber: true,
      status: true,
      title: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      assignedTo: { select: { firstName: true, lastName: true, email: true } },
      clientWorkspaceId: true,
    },
  });
}

function statusCategory(status: TicketStatus): 'nowe' | 'w_toku' | 'zamknięte' {
  if (status === 'NEW' || status === 'OPEN') return 'nowe';
  if (status === 'CLOSED' || status === 'RESOLVED' || status === 'CANCELLED') return 'zamknięte';
  return 'w_toku';
}
function categoryToStatuses(cat: 'nowe' | 'w_toku' | 'zamknięte'): TicketStatus[] {
  if (cat === 'nowe') return ['NEW', 'OPEN'];
  if (cat === 'zamknięte') return ['RESOLVED', 'CLOSED', 'CANCELLED'];
  return ['ASSIGNED', 'IN_PROGRESS', 'WAITING'];
}

// ─── Tool handlers ──────────────────────────────────────────────────────────
async function handleUtworzZgloszenie(tc: ToolContext, rawInput: unknown): Promise<ToolResult> {
  const schema = z.object({
    opis: z.string().min(1).max(4000),
    priorytet: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    tytul: z.string().min(1).max(200).optional(),
    nazwa_urzadzenia: z.string().min(1).max(200).optional(),
  });
  const input = schema.parse(rawInput);

  let deviceId: string | null = null;
  let deviceName: string | null = null;
  if (input.nazwa_urzadzenia) {
    const dev = await prisma.device.findFirst({
      where: {
        workspaceId: tc.isClient ? tc.callerWorkspaceId : tc.providerWorkspaceId,
        deletedAt: null,
        OR: [
          { name: { contains: input.nazwa_urzadzenia, mode: 'insensitive' } },
          { hostname: { contains: input.nazwa_urzadzenia, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (dev) {
      deviceId = dev.id;
      deviceName = dev.name;
    }
  }

  const title = input.tytul ?? input.opis.slice(0, 80);
  const ticketNumber = await nextTicketNumber(tc.providerWorkspaceId);
  const ticket = await prisma.ticket.create({
    data: {
      workspaceId: tc.providerWorkspaceId,
      clientWorkspaceId: tc.isClient ? tc.callerWorkspaceId : null,
      ticketNumber,
      title,
      description: input.opis,
      status: 'OPEN',
      priority: input.priorytet,
      type: 'INCIDENT',
      source: 'AI_CHAT',
      deviceId,
      createdByUserId: tc.userId,
      hasService: true,
      events: { create: { userId: tc.userId, eventType: 'created', toValue: 'OPEN' } },
    },
    select: { id: true, ticketNumber: true },
  });

  return {
    ok: true,
    ticketNumber: ticket.ticketNumber,
    id: ticket.id,
    url: `/tickets/${ticket.id}`,
    deviceId,
    deviceName,
  };
}

async function handleSprawdzStatus(tc: ToolContext, rawInput: unknown): Promise<ToolResult> {
  const input = z.object({ numer_ticketu: z.string().min(1).max(64) }).parse(rawInput);
  const t = await findScopedTicket(tc, input.numer_ticketu);
  if (!t) return { error: 'not_found', message: `Nie znaleziono ticketu ${input.numer_ticketu}` };
  return {
    ok: true,
    ticketNumber: t.ticketNumber,
    status: t.status,
    title: t.title,
    priority: t.priority,
    createdAt: t.createdAt.toISOString(),
    lastUpdate: t.updatedAt.toISOString(),
    assignedTo: t.assignedTo
      ? [t.assignedTo.firstName, t.assignedTo.lastName].filter(Boolean).join(' ') || t.assignedTo.email
      : null,
    url: `/tickets/${t.id}`,
  };
}

async function handleListaMoichZgloszen(tc: ToolContext, rawInput: unknown): Promise<ToolResult> {
  const input = z.object({
    limit: z.number().int().min(1).max(50).optional(),
    status: z.enum(['nowe', 'w_toku', 'zamknięte']).optional(),
  }).parse(rawInput ?? {});
  const limit = input.limit ?? 10;

  const where: Record<string, unknown> = {
    workspaceId: tc.providerWorkspaceId,
    deletedAt: null,
  };
  if (tc.isClient) where.clientWorkspaceId = tc.callerWorkspaceId;
  if (input.status) where.status = { in: categoryToStatuses(input.status) };

  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      priority: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return {
    ok: true,
    tickets: tickets.map((t) => ({
      number: t.ticketNumber,
      title: t.title,
      status: t.status,
      category: statusCategory(t.status as TicketStatus),
      priority: t.priority,
      createdAt: t.createdAt.toISOString(),
      url: `/tickets/${t.id}`,
    })),
  };
}

async function handleZglosProblemZUrzadzeniem(tc: ToolContext, rawInput: unknown): Promise<ToolResult> {
  const input = z.object({
    nazwa_urzadzenia: z.string().min(1).max(200),
    opis: z.string().min(1).max(4000),
    priorytet: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  }).parse(rawInput);

  const deviceScopeWs = tc.isClient ? tc.callerWorkspaceId : tc.providerWorkspaceId;
  const matches = await prisma.device.findMany({
    where: {
      workspaceId: deviceScopeWs,
      deletedAt: null,
      OR: [
        { name: { contains: input.nazwa_urzadzenia, mode: 'insensitive' } },
        { hostname: { contains: input.nazwa_urzadzenia, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, hostname: true },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });
  if (matches.length === 0) {
    return {
      error: 'device_not_found',
      message: `Nie znaleziono urządzenia pasującego do "${input.nazwa_urzadzenia}"`,
      suggestions: [],
    };
  }
  const device = matches[0]!;

  const title = `${device.name}: ${input.opis.slice(0, 60)}`;
  const ticketNumber = await nextTicketNumber(tc.providerWorkspaceId);
  const ticket = await prisma.ticket.create({
    data: {
      workspaceId: tc.providerWorkspaceId,
      clientWorkspaceId: tc.isClient ? tc.callerWorkspaceId : null,
      ticketNumber,
      title,
      description: input.opis,
      status: 'OPEN',
      priority: input.priorytet ?? 'MEDIUM',
      type: 'INCIDENT',
      source: 'AI_CHAT',
      deviceId: device.id,
      createdByUserId: tc.userId,
      hasService: true,
      events: { create: { userId: tc.userId, eventType: 'created', toValue: 'OPEN' } },
    },
    select: { id: true, ticketNumber: true },
  });

  return {
    ok: true,
    ticketNumber: ticket.ticketNumber,
    deviceId: device.id,
    deviceName: device.name,
    url: `/tickets/${ticket.id}`,
    altCandidates: matches.slice(1).map((m) => ({ id: m.id, name: m.name })),
  };
}

async function handleProsoOOddzwonienie(tc: ToolContext, rawInput: unknown): Promise<ToolResult> {
  const input = z.object({
    temat: z.string().min(1).max(200),
    numer_telefonu: z.string().max(40).optional(),
    preferowana_godzina: z.string().max(200).optional(),
  }).parse(rawInput);

  const notes = [
    `Prośba o oddzwonienie: ${input.temat}`,
    input.numer_telefonu ? `Tel: ${input.numer_telefonu}` : null,
    input.preferowana_godzina ? `Preferowana godzina: ${input.preferowana_godzina}` : null,
    `Zgłoszone przez: ${tc.userEmail ?? tc.userId} (workspace: ${tc.callerWorkspaceName})`,
  ].filter(Boolean).join('\n');

  const activity = await prisma.crmActivity.create({
    data: {
      workspaceId: tc.providerWorkspaceId,
      clientWorkspaceId: tc.isClient ? tc.callerWorkspaceId : null,
      createdByUserId: tc.userId,
      type: 'PHONE',
      title: `Oddzwonienie: ${input.temat}`,
      notes,
      scheduledAt: null,
      followUpRequired: true,
    },
    select: { id: true },
  });

  return {
    ok: true,
    activityId: activity.id,
    message: 'Prośba zarejestrowana. Zespół Silers oddzwoni wkrótce.',
  };
}

async function handleDodajKomentarz(tc: ToolContext, rawInput: unknown): Promise<ToolResult> {
  const input = z.object({
    numer_ticketu: z.string().min(1),
    tresc: z.string().min(1).max(4000),
  }).parse(rawInput);

  const t = await findScopedTicket(tc, input.numer_ticketu);
  if (!t) return { error: 'not_found', message: `Nie znaleziono ticketu ${input.numer_ticketu}` };

  const c = await prisma.ticketComment.create({
    data: {
      ticketId: t.id,
      userId: tc.userId,
      comment: input.tresc,
      isInternal: false,
    },
    select: { id: true },
  });
  await prisma.ticketEvent.create({
    data: { ticketId: t.id, userId: tc.userId, eventType: 'commented', metadata: { source: 'iris' } },
  });
  return { ok: true, commentId: c.id, ticketNumber: t.ticketNumber };
}

async function handleAnulujZgloszenie(tc: ToolContext, rawInput: unknown): Promise<ToolResult> {
  const input = z.object({
    numer_ticketu: z.string().min(1),
    powod: z.string().min(1).max(1000),
  }).parse(rawInput);

  const t = await findScopedTicket(tc, input.numer_ticketu);
  if (!t) return { error: 'not_found', message: `Nie znaleziono ticketu ${input.numer_ticketu}` };
  if (t.status === 'CLOSED' || t.status === 'RESOLVED' || t.status === 'CANCELLED') {
    return { error: 'already_terminal', message: `Zgłoszenie ${t.ticketNumber} jest już w stanie ${t.status} — nie można anulować.` };
  }
  try {
    assertTransition(t.status as TicketStatus, 'CANCELLED');
  } catch {
    return { error: 'illegal_transition', message: `Przejście ${t.status} -> CANCELLED jest niedozwolone.` };
  }

  await prisma.$transaction([
    prisma.ticket.update({
      where: { id: t.id },
      data: { status: 'CANCELLED', resolutionSummary: input.powod, closedAt: new Date() },
    }),
    prisma.ticketEvent.create({
      data: {
        ticketId: t.id,
        userId: tc.userId,
        eventType: 'status_changed',
        fromValue: t.status,
        toValue: 'CANCELLED',
        metadata: { reason: input.powod, source: 'iris' },
      },
    }),
  ]);
  return { ok: true, ticketNumber: t.ticketNumber };
}

async function handleOcenZakonczone(tc: ToolContext, rawInput: unknown): Promise<ToolResult> {
  const input = z.object({
    numer_ticketu: z.string().min(1),
    ocena: z.number().int().min(1).max(5),
    komentarz: z.string().max(2000).optional(),
  }).parse(rawInput);

  const t = await findScopedTicket(tc, input.numer_ticketu);
  if (!t) return { error: 'not_found', message: `Nie znaleziono ticketu ${input.numer_ticketu}` };
  if (t.status !== 'CLOSED' && t.status !== 'RESOLVED') {
    return { error: 'not_closed', message: `Zgłoszenie ${t.ticketNumber} nie jest jeszcze zamknięte (status: ${t.status}).` };
  }
  await prisma.ticket.update({
    where: { id: t.id },
    data: {
      rating: input.ocena,
      ratingComment: input.komentarz ?? null,
      ratedAt: new Date(),
    },
  });
  await prisma.ticketEvent.create({
    data: {
      ticketId: t.id,
      userId: tc.userId,
      eventType: 'rated',
      toValue: String(input.ocena),
      metadata: { comment: input.komentarz ?? null, source: 'iris' },
    },
  });
  return { ok: true, ticketNumber: t.ticketNumber };
}

async function dispatchTool(name: string, input: unknown, tc: ToolContext): Promise<ToolResult> {
  try {
    switch (name) {
      case 'utworz_zgloszenie': return await handleUtworzZgloszenie(tc, input);
      case 'sprawdz_status': return await handleSprawdzStatus(tc, input);
      case 'lista_moich_zgloszen': return await handleListaMoichZgloszen(tc, input);
      case 'zglos_problem_z_urzadzeniem': return await handleZglosProblemZUrzadzeniem(tc, input);
      case 'popros_o_oddzwonienie': return await handleProsoOOddzwonienie(tc, input);
      case 'dodaj_komentarz_do_zgloszenia': return await handleDodajKomentarz(tc, input);
      case 'anuluj_zgloszenie': return await handleAnulujZgloszenie(tc, input);
      case 'ocen_zakonczone': return await handleOcenZakonczone(tc, input);
      default:
        return { error: 'unknown_tool', message: `Nieznane narzędzie: ${name}` };
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { error: 'invalid_input', message: 'Nieprawidłowe argumenty', details: err.errors };
    }
    logger.warn({ err, tool: name }, '[iris-chat] tool handler threw');
    const message = err instanceof Error ? err.message : 'Błąd wewnętrzny';
    return { error: 'handler_error', message };
  }
}

// ─── Endpoint ───────────────────────────────────────────────────────────────
const chatBodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(20_000),
  })).min(1).max(40),
  model: z.enum(['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']).optional(),
});

const MAX_ITERATIONS = 5;

async function chatHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = await resolveIrisAuth(req);
    if (!auth) throw HttpError.unauthorized('Brak uwierzytelnienia');
    const body = chatBodySchema.parse(req.body);
    const model = body.model ?? 'claude-sonnet-4-6';

    const tc = await buildToolContext(auth);
    const system = buildSystemPrompt(tc);

    const convo: MessageParam[] = body.messages.map((m) => ({ role: m.role, content: m.content }));
    const toolCallsLog: Array<{ tool: string; input: unknown; result: ToolResult }> = [];
    let totalIn = 0;
    let totalOut = 0;
    let finalText = '';
    let lastStopReason: string | null = null;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const response = await anthropic().messages.create({
        model,
        max_tokens: 2048,
        system,
        tools: TOOLS,
        messages: convo,
      });
      totalIn += response.usage.input_tokens;
      totalOut += response.usage.output_tokens;
      lastStopReason = response.stop_reason;

      const assistantText = response.content
        .filter((b): b is TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');

      convo.push({ role: 'assistant', content: response.content as ContentBlockParam[] });

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        finalText = assistantText;
        break;
      }

      const toolResults: ContentBlockParam[] = [];
      for (const use of toolUses) {
        const result = await dispatchTool(use.name, use.input, tc);
        toolCallsLog.push({ tool: use.name, input: use.input, result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(result),
          is_error: 'error' in result,
        });
      }
      convo.push({ role: 'user', content: toolResults });
    }

    const costPln = estimateCostPln(model, totalIn, totalOut);

    try {
      await prisma.llmUsage.create({
        data: {
          workspaceId: tc.callerWorkspaceId,
          userId: tc.userId,
          model,
          feature: 'iris_chat_tools',
          inputTokens: totalIn,
          outputTokens: totalOut,
          costPln,
        },
      });
    } catch (err) {
      logger.warn({ err }, '[iris-chat] failed to record LlmUsage');
    }

    res.json({
      message: { role: 'assistant', content: finalText },
      toolCalls: toolCallsLog,
      stopReason: lastStopReason,
      usage: {
        inputTokens: totalIn,
        outputTokens: totalOut,
        costPln,
        model,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(HttpError.badRequest('Nieprawidłowy payload', 'invalid_body', err.errors));
      return;
    }
    if (err instanceof Error && err.message.includes('ANTHROPIC_API_KEY')) {
      next(HttpError.badRequest('AI nie jest skonfigurowane (brak klucza Anthropic)', 'ai_not_configured'));
      return;
    }
    next(err);
  }
}

export function irisChatRouter(): Router {
  const r = Router();
  // No requireAuth middleware — chatHandler does mixed auth (cookie OR embed token).
  r.post('/chat', irisLimiter, chatHandler);
  return r;
}
