import { Badge } from './Badge';

const TICKET_STATUS: Record<string, { label: string; variant: 'neutral' | 'accent' | 'warning' | 'success' | 'danger' | 'info' }> = {
  NEW:         { label: 'Nowe',        variant: 'neutral' },
  OPEN:        { label: 'Otwarte',     variant: 'accent' },
  ASSIGNED:    { label: 'Przypisane',  variant: 'accent' },
  IN_PROGRESS: { label: 'W toku',      variant: 'warning' },
  WAITING:     { label: 'Oczekujące',  variant: 'warning' },
  RESOLVED:    { label: 'Rozwiązane',  variant: 'success' },
  CLOSED:      { label: 'Zakończone',  variant: 'success' },
  CANCELLED:   { label: 'Anulowane',   variant: 'danger' },
};

const TASK_STATUS: Record<string, { label: string; variant: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  NEW:         { label: 'Nowe',       variant: 'neutral' },
  IN_PROGRESS: { label: 'W toku',     variant: 'warning' },
  DONE:        { label: 'Zrobione',   variant: 'success' },
  CANCELLED:   { label: 'Anulowane',  variant: 'danger' },
};

const DELEGATION_STATUS: Record<string, { label: string; variant: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  PLANNED:     { label: 'Zaplanowana', variant: 'neutral' },
  IN_PROGRESS: { label: 'W trakcie',   variant: 'warning' },
  DONE:        { label: 'Zakończona',  variant: 'success' },
  CANCELLED:   { label: 'Anulowana',   variant: 'danger' },
};

const ORDER_STATUS: Record<string, { label: string; variant: 'neutral' | 'accent' | 'warning' | 'success' | 'danger' }> = {
  DRAFT:      { label: 'Szkic',        variant: 'neutral' },
  QUOTE_SENT: { label: 'Wycena',       variant: 'accent' },
  APPROVED:   { label: 'Zatwierdzone', variant: 'warning' },
  ORDERED:    { label: 'Zamówione',    variant: 'warning' },
  IN_TRANSIT: { label: 'W drodze',     variant: 'warning' },
  DELIVERED:  { label: 'Dostarczone',  variant: 'success' },
  INVOICED:   { label: 'Rozliczone',   variant: 'success' },
  CANCELLED:  { label: 'Anulowane',    variant: 'danger' },
};

const MAP: Record<string, typeof TICKET_STATUS> = {
  ticket: TICKET_STATUS,
  task: TASK_STATUS,
  delegation: DELEGATION_STATUS,
  order: ORDER_STATUS,
};

export type StatusEntity = 'ticket' | 'task' | 'delegation' | 'order';

export function StatusPill({ entity = 'ticket', value }: { entity?: StatusEntity; value: string }) {
  const cfg = MAP[entity]?.[value] ?? { label: value, variant: 'neutral' as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
