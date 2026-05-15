// Ticket state machine for InfraDesk v2.
// Allowed transitions (zwykłą maszyną stanów):
//   NEW → OPEN | CANCELLED
//   OPEN → ASSIGNED | WAITING | CANCELLED
//   ASSIGNED → IN_PROGRESS | WAITING | OPEN | CANCELLED
//   IN_PROGRESS → WAITING | RESOLVED | CANCELLED
//   WAITING → IN_PROGRESS | RESOLVED | CANCELLED
//   RESOLVED → CLOSED | OPEN (reopen)
//   CLOSED → OPEN (reopen)
//   CANCELLED → ∅ (terminalny)
//
// CANCELLED → OPEN: NIE jest zwykłą transycją. Cofnięcie anulowania wymaga
// jawnego endpointu `POST /tickets/:id/reopen-cancelled` z permission checkiem
// OWNER/ADMIN + zapisem w ActivityLog. To decyzja architekt. — anulowanie
// musi mieć siłę "intencjonalnego zamknięcia rozdziału", nie być chwilowym
// odhaczeniem w UI które ktoś bezmyślnie cofa kliknięciem.

export type TicketStatus =
  | 'NEW'
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'RESOLVED'
  | 'CLOSED'
  | 'CANCELLED';

const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['OPEN', 'CANCELLED'],
  OPEN: ['ASSIGNED', 'WAITING', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'WAITING', 'OPEN', 'CANCELLED'],
  IN_PROGRESS: ['WAITING', 'RESOLVED', 'CANCELLED'],
  WAITING: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
  CANCELLED: [], // D6: terminalny. Restore tylko przez explicit reopen-cancelled endpoint.
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TicketStatus, to: TicketStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal ticket transition: ${from} → ${to}`);
  }
}

export function allowedNextStates(from: TicketStatus): TicketStatus[] {
  return [...(TRANSITIONS[from] ?? [])];
}

// CLOSED nadal terminalny semantycznie (statystyki) ale można re-open.
// CANCELLED też (klient anulował) ale można re-open.
export const TERMINAL_STATES: TicketStatus[] = ['CLOSED', 'CANCELLED'];
export function isTerminal(status: TicketStatus): boolean {
  return TERMINAL_STATES.includes(status);
}
