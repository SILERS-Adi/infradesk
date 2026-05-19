// Product-logic mapping: InfraDesk status codes → Silers DS StatusKind + Polish label.
// To NIE jest część design system — to feature wrapper (patrz MIGRATION_PLAYBOOK §3.4).
import type { StatusKind } from '@silers/design-system/primitives';

type Entity = 'ticket' | 'task' | 'delegation' | 'order';

const TICKET: Record<string, { status: StatusKind; label: string }> = {
  NEW:         { status: 'neutral', label: 'Nowe' },
  OPEN:        { status: 'info',    label: 'Otwarte' },
  ASSIGNED:    { status: 'info',    label: 'Przypisane' },
  IN_PROGRESS: { status: 'warning', label: 'W toku' },
  WAITING:     { status: 'warning', label: 'Oczekujące' },
  RESOLVED:    { status: 'success', label: 'Rozwiązane' },
  CLOSED:      { status: 'success', label: 'Zakończone' },
  CANCELLED:   { status: 'danger',  label: 'Anulowane' },
};

const TASK: Record<string, { status: StatusKind; label: string }> = {
  NEW:         { status: 'neutral', label: 'Nowe' },
  IN_PROGRESS: { status: 'warning', label: 'W toku' },
  DONE:        { status: 'success', label: 'Zrobione' },
  CANCELLED:   { status: 'danger',  label: 'Anulowane' },
};

const DELEGATION: Record<string, { status: StatusKind; label: string }> = {
  PLANNED:     { status: 'neutral', label: 'Zaplanowana' },
  IN_PROGRESS: { status: 'warning', label: 'W trakcie' },
  DONE:        { status: 'success', label: 'Zakończona' },
  CANCELLED:   { status: 'danger',  label: 'Anulowana' },
};

const ORDER: Record<string, { status: StatusKind; label: string }> = {
  DRAFT:      { status: 'neutral', label: 'Szkic' },
  QUOTE_SENT: { status: 'info',    label: 'Wycena' },
  APPROVED:   { status: 'warning', label: 'Zatwierdzone' },
  ORDERED:    { status: 'warning', label: 'Zamówione' },
  IN_TRANSIT: { status: 'warning', label: 'W drodze' },
  DELIVERED:  { status: 'success', label: 'Dostarczone' },
  INVOICED:   { status: 'success', label: 'Rozliczone' },
  CANCELLED:  { status: 'danger',  label: 'Anulowane' },
};

const MAP: Record<Entity, Record<string, { status: StatusKind; label: string }>> = {
  ticket: TICKET,
  task: TASK,
  delegation: DELEGATION,
  order: ORDER,
};

export function mapStatus(entity: Entity, value: string): { status: StatusKind; label: string } {
  return MAP[entity]?.[value] ?? { status: 'neutral', label: value };
}

const PRIORITY: Record<string, { status: StatusKind; label: string }> = {
  LOW:      { status: 'neutral', label: 'Niski' },
  MEDIUM:   { status: 'info',    label: 'Średni' },
  HIGH:     { status: 'warning', label: 'Wysoki' },
  CRITICAL: { status: 'danger',  label: 'Krytyczny' },
};

export function mapPriority(value: string): { status: StatusKind; label: string } {
  return PRIORITY[value] ?? { status: 'neutral', label: value };
}
