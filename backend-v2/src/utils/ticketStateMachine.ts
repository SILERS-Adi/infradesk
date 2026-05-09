// Ticket state machine for InfraDesk v2.
// Allowed transitions:
//   NEW → OPEN | CANCELLED
//   OPEN → ASSIGNED | WAITING | CANCELLED
//   ASSIGNED → IN_PROGRESS | WAITING | OPEN | CANCELLED
//   IN_PROGRESS → WAITING | RESOLVED | CANCELLED
//   WAITING → IN_PROGRESS | RESOLVED | CANCELLED
//   RESOLVED → CLOSED | OPEN (reopen)
//   CLOSED → OPEN (reopen)
//   CANCELLED → OPEN (klient się rozmyślił)

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
  CANCELLED: ['OPEN'], // F2.5: re-open gdy klient się rozmyślił
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
