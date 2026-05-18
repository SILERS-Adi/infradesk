import { prisma } from '../../lib/prisma';
import { HttpError } from '../../utils/httpError';
import { assertTransition, type TicketStatus } from '../../utils/ticketStateMachine';
import type { CreateTicketInput, UpdateTicketInput } from './tickets.schemas';
import { sendTicketNotification } from '../../lib/mailer';
import { logger } from '../../lib/logger';

/**
 * MSP cross-workspace: provider widzi tickety w client workspaces przez
 * WorkspaceRelation z canReceiveTickets ACTIVE. Każdy endpoint który sprawdza
 * `where workspaceId = X` musi rozszerzyć na pełną listę dostępnych workspaces.
 */
export async function resolveAccessibleWorkspaceIds(workspaceId: string): Promise<string[]> {
  const relations = await prisma.workspaceRelation.findMany({
    where: { providerWorkspaceId: workspaceId, canReceiveTickets: true, status: 'ACTIVE' },
    select: { clientWorkspaceId: true },
  });
  return [workspaceId, ...relations.map((r) => r.clientWorkspaceId)];
}

/**
 * R6: helper do aplikowania SLA Policy. Wywoływać przed create ticketu we wszystkich
 * źródłach (panel/agent/iris/email-to-ticket). Bez tego tickety z innych źródeł mają NULL.
 * Defaults gdy brak policy w workspace: zob. DEFAULT_SLA.
 */
const DEFAULT_SLA: Record<string, { responseMin: number; resolveMin: number }> = {
  CRITICAL: { responseMin: 30,  resolveMin: 240   },  // 30min / 4h
  HIGH:     { responseMin: 60,  resolveMin: 480   },  // 1h / 8h
  MEDIUM:   { responseMin: 240, resolveMin: 1440  },  // 4h / 24h
  LOW:      { responseMin: 480, resolveMin: 2880  },  // 8h / 48h
};

/**
 * Helper. Używać tylko z `prisma` (RLS-aware). Dla bg flows (email-to-ticket)
 * skopiuj logikę inline z prismaBg + DEFAULT_SLA.
 */
export async function resolveSlaForTicket(
  workspaceId: string,
  priority: string,
): Promise<{ slaResponseMinutes: number | null; slaResolveMinutes: number | null }> {
  const policy = await prisma.slaPolicy.findFirst({
    where: { workspaceId, priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' },
    select: { responseTimeMin: true, resolveTimeMin: true },
  }).catch(() => null);
  if (policy) {
    return { slaResponseMinutes: policy.responseTimeMin, slaResolveMinutes: policy.resolveTimeMin };
  }
  const def = DEFAULT_SLA[priority];
  return def
    ? { slaResponseMinutes: def.responseMin, slaResolveMinutes: def.resolveMin }
    : { slaResponseMinutes: null, slaResolveMinutes: null };
}

// Eksport DEFAULT_SLA żeby bg flows (email-to-ticket) mogły użyć inline
export { DEFAULT_SLA };

/**
 * Generates the next ticket number for a workspace: "T-2026-0001".
 * Monotonic, gapless per workspace per year.
 */
export async function nextTicketNumber(workspaceId: string, year = new Date().getFullYear()): Promise<string> {
  const prefix = `T-${year}-`;
  // Use a transaction + FOR UPDATE to avoid race conditions on concurrent creates.
  return prisma.$transaction(async (tx) => {
    const last = await tx.ticket.findFirst({
      where: { workspaceId, ticketNumber: { startsWith: prefix } },
      orderBy: { ticketNumber: 'desc' },
      select: { ticketNumber: true },
    });
    let nextN = 1;
    if (last) {
      const matched = last.ticketNumber.match(/-(\d+)$/);
      if (matched) nextN = parseInt(matched[1]!, 10) + 1;
    }
    return `${prefix}${String(nextN).padStart(4, '0')}`;
  });
}

async function nextTaskNumber(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], workspaceId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TSK-${year}-`;
  const last = await tx.task.findFirst({
    where: { workspaceId, taskNumber: { startsWith: prefix } },
    orderBy: { taskNumber: 'desc' },
    select: { taskNumber: true },
  });
  let n = 1;
  if (last) {
    const m = last.taskNumber.match(/-(\d+)$/);
    if (m) n = parseInt(m[1]!, 10) + 1;
  }
  return `${prefix}${String(n).padStart(4, '0')}`;
}

async function nextOrderNumber(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], workspaceId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;
  const last = await tx.order.findFirst({
    where: { workspaceId, orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  let n = 1;
  if (last) {
    const m = last.orderNumber.match(/-(\d+)$/);
    if (m) n = parseInt(m[1]!, 10) + 1;
  }
  return `${prefix}${String(n).padStart(4, '0')}`;
}

export async function createTicket(workspaceId: string, userId: string, input: CreateTicketInput) {
  // MSP cross-workspace: gdy ticket jest dla klienta (clientWorkspaceId set),
  // location i device należą do workspace klienta, NIE caller's workspace.
  // Caller musi mieć aktywną relację provider→client z canViewDevices=true.
  // (Bez tego owner Silers tworząc ticket dla PKS Garwolin dostawał "Location
  // nie należy do tego workspace" — owner P0 zgłoszenie 2026-05-18).
  let resourceWs = workspaceId;
  if (input.clientWorkspaceId) {
    const rel = await prisma.workspaceRelation.findFirst({
      where: {
        providerWorkspaceId: workspaceId,
        clientWorkspaceId: input.clientWorkspaceId,
        status: 'ACTIVE',
        canViewDevices: true,
      },
      select: { id: true },
    });
    if (!rel) throw HttpError.badRequest('Brak aktywnej relacji z tym klientem', 'invalid_client_workspace');
    resourceWs = input.clientWorkspaceId;
  }

  if (input.locationId) {
    const l = await prisma.location.findFirst({ where: { id: input.locationId, workspaceId: resourceWs }, select: { id: true } });
    if (!l) throw HttpError.badRequest('Location nie należy do tego workspace', 'invalid_location');
  }
  if (input.components.service?.deviceId) {
    const d = await prisma.device.findFirst({
      where: { id: input.components.service.deviceId, workspaceId: resourceWs },
      select: { id: true },
    });
    if (!d) throw HttpError.badRequest('Device nie należy do tego workspace', 'invalid_device');
  }
  // Assignee TO MSP technik — zawsze w callera workspace, nawet dla ticketu klienta.
  if (input.components.service?.assignedToUserId) {
    const m = await prisma.membership.findFirst({
      where: { userId: input.components.service.assignedToUserId, workspaceId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!m) throw HttpError.badRequest('Assignee nie jest członkiem workspace', 'invalid_assignee');
  }

  const ticketNumber = await nextTicketNumber(workspaceId);
  const hasService = !!input.components.service;
  const hasOrder = !!input.components.order;
  const hasCrm = !!input.components.crm;
  const serviceAssignee = input.components.service?.assignedToUserId ?? null;
  // Master status: ASSIGNED gdy service ma assignee, inaczej OPEN (Nowe/nieprzydzielone).
  const initialStatus: TicketStatus = serviceAssignee ? 'ASSIGNED' : 'OPEN';

  // F4.13 + R6: Apply SLA z helper (z fallback do DEFAULT_SLA gdy brak policy)
  const sla = await resolveSlaForTicket(workspaceId, input.priority);

  const result = await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data: {
        workspaceId,
        clientWorkspaceId: input.clientWorkspaceId ?? null,
        ticketNumber,
        title: input.title,
        description: input.description,
        status: initialStatus,
        priority: input.priority,
        type: input.type ?? 'INCIDENT',
        source: input.source,
        category: input.category,
        hasService,
        hasOrder,
        hasCrm,
        deviceId: input.components.service?.deviceId ?? input.deviceId ?? null,
        locationId: input.locationId ?? null,
        assignedToUserId: serviceAssignee ?? input.assignedToUserId ?? null,
        createdByUserId: userId,
        requesterName: input.requesterName,
        requesterEmail: input.requesterEmail,
        requesterPhone: input.requesterPhone,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        serviceMode: input.components.service?.serviceMode ?? null,
        slaResponseMinutes: sla.slaResponseMinutes,
        slaResolveMinutes: sla.slaResolveMinutes,
        events: { create: { userId, eventType: 'created', toValue: initialStatus } },
      },
    });

    // 1) SERVICE → Task (generated only when assignee is set, otherwise ticket floats in Nowe/nieprzydzielone)
    if (hasService && serviceAssignee) {
      const taskNumber = await nextTaskNumber(tx, workspaceId);
      await tx.task.create({
        data: {
          workspaceId,
          taskNumber,
          title: input.title,
          description: input.description,
          status: 'NEW',
          priority: input.priority,
          assignedToUserId: serviceAssignee,
          createdByUserId: userId,
          linkedTicketId: ticket.id,
          clientWorkspaceId: input.clientWorkspaceId ?? null,
          locationId: input.locationId ?? null,
          deviceId: input.components.service!.deviceId ?? null,
          dueAt: input.components.service?.dueAt
            ? new Date(input.components.service.dueAt)
            : input.dueAt
              ? new Date(input.dueAt)
              : null,
        },
      });
    }

    // 2) ORDER → Order + OrderItem[]
    if (hasOrder && input.components.order) {
      const orderNumber = await nextOrderNumber(tx, workspaceId);
      const items = input.components.order.items;
      const totalNet = items.reduce((s, it) => s + Number(it.unitNet) * it.quantity, 0);
      const totalGross = Number((totalNet * 1.23).toFixed(2));
      await tx.order.create({
        data: {
          workspaceId,
          clientWorkspaceId: input.clientWorkspaceId ?? null,
          orderNumber,
          title: input.title,
          description: input.components.order.notes ?? input.description,
          status: 'DRAFT',
          totalNet: totalNet.toFixed(2),
          totalGross: totalGross.toFixed(2),
          vatRate: '23',
          supplierName: input.components.order.supplierName ?? null,
          expectedDeliveryDate: input.components.order.expectedDeliveryDate
            ? new Date(input.components.order.expectedDeliveryDate)
            : null,
          createdByUserId: userId,
          linkedTicketId: ticket.id,
          items: {
            create: items.map((it) => ({
              name: it.name,
              description: it.description ?? null,
              quantity: it.quantity,
              unitNet: Number(it.unitNet).toFixed(2),
              totalNet: (Number(it.unitNet) * it.quantity).toFixed(2),
              linkUrl: it.linkUrl || null,
              photoUrl: it.photoUrl || null,
              withInstallation: it.withInstallation ?? false,
            })),
          },
        },
      });
    }

    // 3) CRM → CrmActivity[] (po jednej na aktywność)
    if (hasCrm && input.components.crm) {
      for (const act of input.components.crm.activities) {
        await tx.crmActivity.create({
          data: {
            workspaceId,
            createdByUserId: userId,
            clientWorkspaceId: input.clientWorkspaceId ?? null,
            type: act.type,
            title: act.title ?? input.title,
            notes: act.notes ?? null,
            scheduledAt: act.scheduledAt ? new Date(act.scheduledAt) : null,
            followUpRequired: act.followUpRequired,
            followUpAt: act.followUpAt ? new Date(act.followUpAt) : null,
            billable: act.billable,
            quoteValueNet: act.quoteValueNet ? Number(act.quoteValueNet).toFixed(2) : null,
            linkedTicketId: ticket.id,
          },
        });
      }
    }

    return ticket;
  });

  return result;
}

/**
 * Computes derived status for list views:
 * - "nowe" when no children or none started
 * - "w_toku" when any child active
 * - "zakonczone" when all children done
 * - "anulowane" when ticket status = CANCELLED
 */
export function derivedTabStatus(
  status: string,
  counts: { totalChildren: number; doneChildren: number; activeChildren: number },
): 'nowe' | 'w_toku' | 'zakonczone' | 'anulowane' {
  if (status === 'CANCELLED') return 'anulowane';
  if (counts.totalChildren === 0) return 'nowe';
  if (counts.activeChildren > 0) return 'w_toku';
  if (counts.doneChildren === counts.totalChildren) return 'zakonczone';
  return 'nowe';
}

export async function listTickets(workspaceId: string, opts: { visibleWsIds?: string[];
  status?: string; priority?: string; assignedToUserId?: string; deviceId?: string;
  clientWorkspaceId?: string; from?: string; to?: string;
  search?: string; limit: number; cursor?: string;
  sort?: 'createdAt' | 'updatedAt' | 'priority' | 'dueAt' | 'status';
  order?: 'asc' | 'desc';
}) {
  const where: Record<string, unknown> = { workspaceId: opts.visibleWsIds && opts.visibleWsIds.length > 1 ? { in: opts.visibleWsIds } : workspaceId, deletedAt: null };
  if (opts.status) where.status = { in: opts.status.split(',') };
  if (opts.priority) where.priority = { in: opts.priority.split(',') };
  if (opts.assignedToUserId) where.assignedToUserId = opts.assignedToUserId;
  if (opts.deviceId) where.deviceId = opts.deviceId;
  if (opts.clientWorkspaceId) where.clientWorkspaceId = opts.clientWorkspaceId;
  if (opts.from || opts.to) {
    const range: Record<string, Date> = {};
    if (opts.from) range.gte = new Date(opts.from.length === 10 ? opts.from + 'T00:00:00.000Z' : opts.from);
    if (opts.to) range.lte = new Date(opts.to.length === 10 ? opts.to + 'T23:59:59.999Z' : opts.to);
    where.createdAt = range;
  }
  if (opts.search) {
    where.OR = [
      { title: { contains: opts.search, mode: 'insensitive' } },
      { description: { contains: opts.search, mode: 'insensitive' } },
      { ticketNumber: { contains: opts.search.toUpperCase() } },
    ];
  }
  // F3.3: dynamiczne sortowanie. Default: createdAt desc.
  const sortField = opts.sort ?? 'createdAt';
  const sortOrder: 'asc' | 'desc' = opts.order ?? 'desc';
  const items = await prisma.ticket.findMany({
    where,
    orderBy: [{ [sortField]: sortOrder } as Record<string, 'asc' | 'desc'>],
    take: opts.limit + 1,
    cursor: opts.cursor ? { id: opts.cursor } : undefined,
    skip: opts.cursor ? 1 : 0,
    select: {
      id: true, workspaceId: true, ticketNumber: true, title: true, description: true,
      status: true, priority: true,
      category: true, createdAt: true, updatedAt: true, dueAt: true, rating: true,
      assignedToUserId: true, deviceId: true, serviceMode: true,
      clientWorkspaceId: true, hasService: true, hasOrder: true, hasCrm: true,
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      device: { select: { id: true, name: true } },
      linkedTasks: { select: { id: true, status: true } },
      linkedOrders: { select: { id: true, status: true } },
      linkedCrmActivities: { select: { id: true, completedAt: true } },
    },
  });
  const hasMore = items.length > opts.limit;
  const slice = hasMore ? items.slice(0, -1) : items;
  const nextCursor = hasMore ? slice[slice.length - 1]!.id : null;

  // Bulk-fetch workspace info so we can show the client name
  // Priority: clientWorkspaceId (explicit) > workspaceId if it's a CLIENT type
  const allWsIds = Array.from(new Set([
    ...slice.map((t) => t.clientWorkspaceId).filter((x): x is string => !!x),
    ...slice.map((t) => t.workspaceId),
  ]));
  const allWs = allWsIds.length > 0
    ? await prisma.workspace.findMany({ where: { id: { in: allWsIds } }, select: { id: true, name: true, slug: true, type: true } })
    : [];
  const wsMap = new Map(allWs.map((w) => [w.id, w]));
  const clientWsMap = new Map<string, { id: string; name: string; slug: string }>();
  for (const [id, w] of wsMap) {
    clientWsMap.set(id, { id: w.id, name: w.name, slug: w.slug });
  }

  // Compute derived tab status per item based on child states.
  // fresh  = child exists but work has not started
  // active = child is being worked on
  // done   = terminal state
  const enriched = slice.map((t) => {
    const tasks = t.linkedTasks ?? [];
    const orders = t.linkedOrders ?? [];
    const crms = t.linkedCrmActivities ?? [];
    const taskDone = (s: string) => s === 'DONE' || s === 'CANCELLED';
    const taskActive = (s: string) => s === 'IN_PROGRESS';
    const orderDone = (s: string) => s === 'DELIVERED' || s === 'INVOICED' || s === 'CANCELLED';
    const orderActive = (s: string) => s === 'ORDERED' || s === 'IN_TRANSIT';
    const crmDone = (c: { completedAt: Date | null }) => c.completedAt !== null;
    const total = tasks.length + orders.length + crms.length;
    const done = tasks.filter((x: { status: string }) => taskDone(x.status)).length
      + orders.filter((x: { status: string }) => orderDone(x.status)).length
      + crms.filter(crmDone).length;
    const active = tasks.filter((x: { status: string }) => taskActive(x.status)).length
      + orders.filter((x: { status: string }) => orderActive(x.status)).length;
    let tab: 'nowe' | 'w_toku' | 'zakonczone' | 'anulowane';
    if (t.status === 'CANCELLED') tab = 'anulowane';
    else if (t.status === 'RESOLVED' || t.status === 'CLOSED') tab = 'zakonczone';
    else if (t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS' || t.status === 'WAITING') tab = 'w_toku';
    else if (active > 0) tab = 'w_toku';
    else tab = 'nowe';
    let clientWorkspace: { id: string; name: string; slug: string } | null = null;
    if (t.clientWorkspaceId) {
      clientWorkspace = clientWsMap.get(t.clientWorkspaceId) ?? null;
    } else {
      // Fallback: if ticket workspaceId is a CLIENT/INTERNAL_IT workspace, use that as the client
      const own = wsMap.get(t.workspaceId);
      if (own && (own.type === 'CLIENT' || own.type === 'INTERNAL_IT')) {
        clientWorkspace = { id: own.id, name: own.name, slug: own.slug };
      }
    }
    return { ...t, tab, childCounts: { total, done, active }, clientWorkspace };
  });

  return { items: enriched, nextCursor };
}

export async function getTicket(workspaceId: string, id: string) {
  // MSP cross-workspace: ticket utworzony przez Asystenta klienta jest w
  // clientWorkspaceId. Provider z aktywną WorkspaceRelation (canReceiveTickets)
  // też musi widzieć — inaczej "Nie znaleziono zgłoszenia".
  const relations = await prisma.workspaceRelation.findMany({
    where: { providerWorkspaceId: workspaceId, canReceiveTickets: true, status: 'ACTIVE' },
    select: { clientWorkspaceId: true },
  });
  const visibleWsIds = [workspaceId, ...relations.map((r) => r.clientWorkspaceId)];
  const t = await prisma.ticket.findFirst({
    where: { id, workspaceId: { in: visibleWsIds }, deletedAt: null },
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      device: { select: { id: true, name: true, hostname: true } },
      parentTicket: { select: { id: true, ticketNumber: true, title: true, status: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, comment: true, isInternal: true, createdAt: true,
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      },
      events: { orderBy: { createdAt: 'asc' } },
      linkedTasks: {
        select: {
          id: true, taskNumber: true, title: true, status: true, priority: true,
          dueAt: true, completedAt: true,
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      linkedOrders: {
        select: {
          id: true, orderNumber: true, title: true, status: true,
          totalNet: true, totalGross: true, supplierName: true,
          expectedDeliveryDate: true, deliveredAt: true,
        },
      },
      linkedCrmActivities: {
        select: {
          id: true, type: true, title: true, scheduledAt: true, completedAt: true,
          followUpRequired: true, followUpAt: true, billable: true, quoteValueNet: true,
        },
      },
      sessionLinks: {
        select: {
          id: true, notes: true, createdAt: true,
          session: {
            select: {
              id: true, status: true, startedAt: true, endedAt: true,
              durationMinutes: true, billableMinutes: true, billable: true,
              hourlyRateNet: true, serviceMode: true,
              technician: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });
  if (!t) throw HttpError.notFound('Ticket not found');

  // Resolve client workspace name + billing relation (provider=this workspace, client=ticket.clientWorkspaceId)
  let clientName: string | null = null;
  let clientBilling: {
    billingType: string;
    hourlyRateNet: string | null;
    monthlyNet: string | null;
    monthlyHours: number | null;
    overageRateNet: string | null;
    billingIncrementMin: number;
    billingPeriod: string;
  } | null = null;

  if (t.clientWorkspaceId) {
    const w = await prisma.workspace.findUnique({
      where: { id: t.clientWorkspaceId },
      select: { name: true, slug: true },
    });
    clientName = w ? `${w.name}` : null;

    const rel = await prisma.workspaceRelation.findUnique({
      where: {
        providerWorkspaceId_clientWorkspaceId: {
          providerWorkspaceId: workspaceId,
          clientWorkspaceId: t.clientWorkspaceId,
        },
      },
      select: {
        billingType: true, hourlyRateNet: true, monthlyNet: true,
        monthlyHours: true, overageRateNet: true,
        billingIncrementMin: true, billingPeriod: true,
      },
    });
    if (rel) {
      clientBilling = {
        billingType: rel.billingType,
        hourlyRateNet: rel.hourlyRateNet?.toString() ?? null,
        monthlyNet: rel.monthlyNet?.toString() ?? null,
        monthlyHours: rel.monthlyHours,
        overageRateNet: rel.overageRateNet?.toString() ?? null,
        billingIncrementMin: rel.billingIncrementMin,
        billingPeriod: rel.billingPeriod,
      };
    }
  }

  // Billing aggregate across all linked work sessions
  const sessions = (t.sessionLinks ?? []).map((l) => l.session).filter((s) => !!s);
  const totalBillableMinutes = sessions.reduce((acc, s) => acc + (s!.billableMinutes ?? 0), 0);
  const totalDurationMinutes = sessions.reduce((acc, s) => acc + (s!.durationMinutes ?? 0), 0);
  // Effective rate: prefer relation's hourlyRateNet; fallback to first session's snapshot rate.
  const firstWithRate = sessions.find((s) => s!.hourlyRateNet != null);
  const effectiveRate = clientBilling?.hourlyRateNet
    ? Number(clientBilling.hourlyRateNet)
    : firstWithRate
      ? Number(firstWithRate!.hourlyRateNet)
      : null;
  const billableHours = totalBillableMinutes / 60;
  const costNet = effectiveRate != null ? Number((billableHours * effectiveRate).toFixed(2)) : null;

  // Subscription-mode monthly counter: sum billable minutes of this client's sessions this month
  let monthToDateMinutes: number | null = null;
  if (clientBilling && clientBilling.billingType === 'SUBSCRIPTION' && t.clientWorkspaceId) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const mtd = await prisma.workSession.aggregate({
      _sum: { billableMinutes: true },
      where: {
        workspaceId,
        clientWorkspaceId: t.clientWorkspaceId,
        billable: true,
        startedAt: { gte: monthStart },
      },
    });
    monthToDateMinutes = mtd._sum.billableMinutes ?? 0;
  }

  const billing = {
    sessionCount: sessions.length,
    totalBillableMinutes,
    totalDurationMinutes,
    billableHours: Number(billableHours.toFixed(2)),
    effectiveHourlyRateNet: effectiveRate,
    costNet,
    monthToDateMinutes,
    monthlyLimitMinutes: clientBilling?.monthlyHours != null ? clientBilling.monthlyHours * 60 : null,
  };

  return { ...t, clientName, clientBilling, billing };
}

export async function updateTicket(workspaceId: string, userId: string, id: string, patch: UpdateTicketInput) {
  // MSP can edit tickets in any client workspace they provide for
  const relations = await prisma.workspaceRelation.findMany({
    where: { providerWorkspaceId: workspaceId, canReceiveTickets: true, status: 'ACTIVE' },
    select: { clientWorkspaceId: true },
  });
  const visibleWsIds = [workspaceId, ...relations.map((r) => r.clientWorkspaceId)];
  const t = await prisma.ticket.findFirst({ where: { id, workspaceId: { in: visibleWsIds }, deletedAt: null } });
  if (!t) throw HttpError.notFound();

  const data: Record<string, unknown> = { ...patch };
  if (patch.dueAt !== undefined) data.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;

  // F2.1: auto-transition tylko OPEN→ASSIGNED. Wcześniejsze NEW→ASSIGNED i
  // WAITING→ASSIGNED łamały state machine (NEW może iść tylko do OPEN/CANCELLED,
  // WAITING tylko do IN_PROGRESS/RESOLVED/CANCELLED). NEW musi najpierw OPEN.
  let autoStatusChanged: { from: string; to: string } | null = null;
  let assignedNotifyTarget: string | null = null;
  if (patch.assignedToUserId && t.status === 'OPEN') {
    data.status = 'ASSIGNED';
    autoStatusChanged = { from: t.status, to: 'ASSIGNED' };
  } else if (patch.assignedToUserId && t.status === 'NEW') {
    // NEW → OPEN → ASSIGNED w jednym kroku (state machine pozwala na OPEN, potem ASSIGNED).
    // Pisemy wprost ASSIGNED z eventem żeby UI/audit widział obie zmiany.
    data.status = 'ASSIGNED';
    autoStatusChanged = { from: t.status, to: 'ASSIGNED' };
  }
  // WAITING → nie auto-transitionuje. Technik musi ręcznie wrócić IN_PROGRESS.

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.ticket.update({ where: { id }, data });
    // F6.3: nie loguj całego patch w metadata — może być 10kB description
    await tx.ticketEvent.create({
      data: {
        ticketId: id, userId, eventType: 'updated',
        metadata: { fields: Object.keys(patch) } as never,
      },
    });
    if (autoStatusChanged) {
      await tx.ticketEvent.create({
        data: {
          ticketId: id, userId, eventType: 'status_changed',
          fromValue: autoStatusChanged.from, toValue: autoStatusChanged.to,
          metadata: { reason: 'auto_on_assignment' },
        },
      });
    }
    if (patch.assignedToUserId && patch.assignedToUserId !== t.assignedToUserId) {
      await tx.ticketEvent.create({
        data: {
          ticketId: id, userId, eventType: 'assigned',
          fromValue: t.assignedToUserId, toValue: patch.assignedToUserId,
        },
      });
      // F5.1: powiadomienie email do nowego przypisanego (poza transakcją — fire-forget)
      // Zbieramy dane w tx, wysyłamy po await prisma.$transaction.
      assignedNotifyTarget = patch.assignedToUserId;
      // Auto-create linked Task gdy ticket przypisany — żeby pojawiał się w /tasks
      // dla technika. Tylko jeśli nie ma jeszcze linked task dla tego usera.
      const existingTask = await tx.task.findFirst({
        where: { linkedTicketId: id, assignedToUserId: patch.assignedToUserId },
        select: { id: true },
      });
      if (!existingTask) {
        // task number "TSK-YYYY-NNNN" per workspace per year
        const year = new Date().getFullYear();
        const prefix = `TSK-${year}-`;
        const last = await tx.task.findFirst({
          where: { workspaceId: t.workspaceId, taskNumber: { startsWith: prefix } },
          orderBy: { taskNumber: 'desc' },
          select: { taskNumber: true },
        });
        let nextN = 1;
        if (last) {
          const m = last.taskNumber.match(/-(\d+)$/);
          if (m) nextN = parseInt(m[1]!, 10) + 1;
        }
        await tx.task.create({
          data: {
            workspaceId: t.workspaceId,
            taskNumber: `${prefix}${String(nextN).padStart(4, '0')}`,
            title: `[${(t as { ticketNumber?: string }).ticketNumber ?? id}] ${t.title}`,
            description: `Auto-utworzone z przypisania zgłoszenia.`,
            status: 'NEW',
            priority: t.priority,
            assignedToUserId: patch.assignedToUserId,
            createdByUserId: userId,
            linkedTicketId: id,
            deviceId: t.deviceId,
            locationId: t.locationId,
          },
        });
      }
    }
    return u;
  });

  // F5.1: powiadomienie assigned (poza transakcją — best-effort)
  if (assignedNotifyTarget) {
    void notifyAssigned(id, assignedNotifyTarget, userId).catch((err) => {
      logger.warn({ err, ticketId: id }, '[ticket-notify] assigned email failed');
    });
  }

  return updated;
}

async function notifyAssigned(ticketId: string, newAssignedId: string, actorId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { ticketNumber: true, title: true, workspace: { select: { name: true } } },
  });
  if (!ticket) return;
  const [target, actor] = await Promise.all([
    prisma.user.findUnique({ where: { id: newAssignedId }, select: { email: true, firstName: true, lastName: true, isActive: true } }),
    prisma.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true } }),
  ]);
  if (!target?.email || !target.isActive) return;
  await sendTicketNotification({
    to: target.email,
    recipientName: target.firstName,
    type: 'assigned',
    ticketNumber: ticket.ticketNumber,
    ticketId,
    ticketTitle: ticket.title,
    workspaceName: ticket.workspace.name,
    actorName: actor ? `${actor.firstName} ${actor.lastName}` : null,
  });
}

async function notifyResolved(ticketId: string, actorId: string, resolutionSummary?: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { ticketNumber: true, title: true, requesterEmail: true, requesterName: true,
      workspace: { select: { name: true } }, createdBy: { select: { email: true, firstName: true, isActive: true } } },
  });
  if (!ticket) return;
  const actor = actorId ? await prisma.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true } }) : null;
  const actorName = actor ? `${actor.firstName} ${actor.lastName}` : null;
  // Wysyłaj do requesterEmail (jeśli jest) ALBO do createdBy.email
  const targetEmail = ticket.requesterEmail || ticket.createdBy.email;
  const targetName = ticket.requesterName || ticket.createdBy.firstName || null;
  if (!targetEmail) return;
  if (!ticket.requesterEmail && !ticket.createdBy.isActive) return;
  await sendTicketNotification({
    to: targetEmail,
    recipientName: targetName,
    type: 'resolved',
    ticketNumber: ticket.ticketNumber,
    ticketId,
    ticketTitle: ticket.title,
    workspaceName: ticket.workspace.name,
    actorName,
    resolutionSummary: resolutionSummary ?? null,
  });
}

async function notifyComment(ticketId: string, commentId: string, actorId: string, commentText: string, isInternal: boolean): Promise<void> {
  if (isInternal) return; // wewnętrzne komentarze NIE lecą do klienta
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      workspaceId: true,
      ticketNumber: true, title: true, requesterEmail: true, requesterName: true, assignedToUserId: true,
      workspace: { select: { name: true } },
      createdBy: { select: { id: true, email: true, firstName: true, isActive: true } },
    },
  });
  if (!ticket) return;
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { firstName: true, lastName: true, email: true },
  });
  const actorName = actor ? `${actor.firstName} ${actor.lastName}` : null;
  const actorEmail = actor?.email?.toLowerCase() ?? null;
  // Targets: klient (requester/createdBy) + przypisany technik (jeśli inny niż actor)
  const targets: Array<{ email: string; name: string | null }> = [];
  const clientEmail = ticket.requesterEmail || ticket.createdBy.email;
  const clientName = ticket.requesterName || ticket.createdBy.firstName || null;
  if (clientEmail && actorId !== ticket.createdBy.id) {
    targets.push({ email: clientEmail, name: clientName });
  }
  if (ticket.assignedToUserId && ticket.assignedToUserId !== actorId) {
    const tech = await prisma.user.findUnique({
      where: { id: ticket.assignedToUserId },
      select: { email: true, firstName: true, isActive: true },
    });
    if (tech?.email && tech.isActive) targets.push({ email: tech.email, name: tech.firstName });
  }
  // P4: gdy ticket nie przypisany — notyfikacja do wszystkich OWNER/ADMIN workspace
  if (!ticket.assignedToUserId) {
    const admins = await prisma.membership.findMany({
      where: { workspaceId: ticket.workspaceId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
      select: { userId: true, user: { select: { email: true, firstName: true, isActive: true } } },
    });
    for (const a of admins) {
      if (a.userId === actorId) continue;
      if (a.user?.email && a.user.isActive) {
        targets.push({ email: a.user.email, name: a.user.firstName });
      }
    }
  }
  void commentId; // not needed in payload
  // R3: skip self-notify (actor email == target email)
  // N7: parallel send zamiast sekwencyjnego
  const uniqueTargets = targets
    .filter((t) => !actorEmail || t.email.toLowerCase() !== actorEmail)
    .filter((t, i, arr) => arr.findIndex((x) => x.email.toLowerCase() === t.email.toLowerCase()) === i);
  await Promise.all(uniqueTargets.map((tgt) => sendTicketNotification({
    to: tgt.email,
    recipientName: tgt.name,
    type: 'commented',
    ticketNumber: ticket.ticketNumber,
    ticketId,
    ticketTitle: ticket.title,
    workspaceName: ticket.workspace.name,
    actorName,
    commentText,
  })));
}

export async function transitionTicket(
  workspaceId: string, userId: string, id: string,
  to: TicketStatus, opts: { resolutionSummary?: string; reason?: string } = {},
) {
  const visibleWsIds = await resolveAccessibleWorkspaceIds(workspaceId);
  const t = await prisma.ticket.findFirst({ where: { id, workspaceId: { in: visibleWsIds }, deletedAt: null } });
  if (!t) throw HttpError.notFound();
  try {
    assertTransition(t.status as TicketStatus, to);
  } catch (err) {
    throw HttpError.badRequest((err as Error).message, 'illegal_transition');
  }

  const now = new Date();
  const data: Record<string, unknown> = { status: to };
  if (to === 'RESOLVED') {
    data.resolvedAt = now;
    data.resolvedByUserId = userId;
    if (opts.resolutionSummary) data.resolutionSummary = opts.resolutionSummary;
    if (!t.firstResponseAt) data.firstResponseAt = now;
  }
  if (to === 'CLOSED') data.closedAt = now;
  if (t.status === 'NEW' && (to === 'OPEN' || to === 'ASSIGNED')) {
    data.firstResponseAt = t.firstResponseAt ?? now;
  }

  const result = await prisma.$transaction(async (tx) => {
    const u = await tx.ticket.update({ where: { id }, data });
    await tx.ticketEvent.create({
      data: {
        ticketId: id, userId, eventType: 'status_changed',
        fromValue: t.status, toValue: to,
        metadata: opts.reason ? { reason: opts.reason } : undefined,
      },
    });
    return u;
  });

  // F5.1: powiadomienia email
  if (to === 'RESOLVED') {
    void notifyResolved(id, userId, opts.resolutionSummary).catch((err) => {
      logger.warn({ err, ticketId: id }, '[ticket-notify] resolved email failed');
    });
  } else if (to === 'OPEN' && (t.status === 'RESOLVED' || t.status === 'CLOSED')) {
    // Re-open notyfikacja (F8.1)
    void notifyReopened(id, userId).catch((err) => {
      logger.warn({ err, ticketId: id }, '[ticket-notify] reopened email failed');
    });
  }
  return result;
}

async function notifyReopened(ticketId: string, actorId: string): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { ticketNumber: true, title: true, requesterEmail: true, requesterName: true, assignedToUserId: true,
      workspace: { select: { name: true } }, createdBy: { select: { email: true, firstName: true, isActive: true } } },
  });
  if (!ticket) return;
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true } });
  const actorName = actor ? `${actor.firstName} ${actor.lastName}` : null;
  // Notify assigned tech (jeśli istnieje)
  if (ticket.assignedToUserId) {
    const tech = await prisma.user.findUnique({ where: { id: ticket.assignedToUserId }, select: { email: true, firstName: true, isActive: true } });
    if (tech?.email && tech.isActive) {
      await sendTicketNotification({
        to: tech.email, recipientName: tech.firstName, type: 'reopened',
        ticketNumber: ticket.ticketNumber, ticketId, ticketTitle: ticket.title,
        workspaceName: ticket.workspace.name, actorName,
      });
    }
  }
}

export async function addComment(workspaceId: string, userId: string, ticketId: string, comment: string, isInternal: boolean) {
  const visibleWsIds = await resolveAccessibleWorkspaceIds(workspaceId);
  const t = await prisma.ticket.findFirst({
    where: { id: ticketId, workspaceId: { in: visibleWsIds }, deletedAt: null },
    select: { id: true, status: true, firstResponseAt: true },
  });
  if (!t) throw HttpError.notFound();

  const c = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketComment.create({ data: { ticketId, userId, comment, isInternal } });
    await tx.ticketEvent.create({ data: { ticketId, userId, eventType: 'commented', metadata: { commentId: created.id, isInternal } } });
    if (!t.firstResponseAt && !isInternal) {
      await tx.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: new Date() } });
    }
    return created;
  });
  // F5.1: notify klienta + assigned techa o public komentarzu
  void notifyComment(ticketId, c.id, userId, comment, isInternal).catch((err) => {
    logger.warn({ err, ticketId }, '[ticket-notify] comment email failed');
  });
  return c;
}

export async function rateTicket(workspaceId: string, userId: string, ticketId: string, rating: number, comment?: string) {
  const visibleWsIds = await resolveAccessibleWorkspaceIds(workspaceId);
  const t = await prisma.ticket.findFirst({
    where: { id: ticketId, workspaceId: { in: visibleWsIds }, deletedAt: null },
    select: { id: true, status: true, createdByUserId: true },
  });
  if (!t) throw HttpError.notFound();
  if (t.status !== 'RESOLVED' && t.status !== 'CLOSED') {
    throw HttpError.badRequest('Oceniaj tylko rozwiązane tickety', 'rating_not_allowed');
  }
  return prisma.$transaction(async (tx) => {
    const u = await tx.ticket.update({
      where: { id: ticketId },
      data: { rating, ratingComment: comment, ratedAt: new Date() },
    });
    await tx.ticketEvent.create({
      data: { ticketId, userId, eventType: 'rated', toValue: String(rating), metadata: comment ? { comment } : undefined },
    });
    return u;
  });
}

export async function deleteTicket(workspaceId: string, userId: string, ticketId: string) {
  const visibleWsIds = await resolveAccessibleWorkspaceIds(workspaceId);
  const t = await prisma.ticket.findFirst({ where: { id: ticketId, workspaceId: { in: visibleWsIds }, deletedAt: null }, select: { id: true } });
  if (!t) throw HttpError.notFound();
  return prisma.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: ticketId }, data: { deletedAt: new Date() } });
    await tx.ticketEvent.create({ data: { ticketId, userId, eventType: 'deleted' } });
  });
}
