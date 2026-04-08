import { Badge } from './Badge';
import type { TicketStatus, DeviceStatus } from '../../types';

const TICKET_STATUS_MAP: Record<string, { label: string; color: 'blue' | 'yellow' | 'orange' | 'green' | 'gray' | 'red' }> = {
  NEW:                { label: 'Nowe',           color: 'blue' },
  PENDING:            { label: 'Oczekujące',     color: 'blue' },
  ASSIGNED:           { label: 'Przydzielone',   color: 'yellow' },
  IN_PROGRESS:        { label: 'W trakcie',      color: 'orange' },
  WAITING_FOR_CLIENT: { label: 'Oczekuje klient', color: 'yellow' },
  RESOLVED:           { label: 'Rozwiązane',     color: 'green' },
  CLOSED:             { label: 'Zamknięte',      color: 'green' },
  COMPLETED:          { label: 'Zakończone',     color: 'green' },
  CANCELLED:          { label: 'Anulowane',      color: 'gray' },
};

const DEVICE_STATUS_MAP: Record<DeviceStatus, { label: string; color: 'green' | 'gray' | 'red' | 'orange' | 'blue' }> = {
  ACTIVE: { label: 'Aktywne', color: 'green' },
  INACTIVE: { label: 'Nieaktywne', color: 'gray' },
  BROKEN: { label: 'Zepsute', color: 'red' },
  RETIRED: { label: 'Wycofane', color: 'gray' },
  IN_SERVICE: { label: 'W serwisie', color: 'orange' },
};

type ClientStatus = 'ACTIVE' | 'INACTIVE';

const CLIENT_STATUS_MAP: Record<ClientStatus, { label: string; color: 'green' | 'gray' }> = {
  ACTIVE: { label: 'Aktywny', color: 'green' },
  INACTIVE: { label: 'Nieaktywny', color: 'gray' },
};

export function TicketStatusBadge({ status }: { status: TicketStatus | string }) {
  const { label, color } = TICKET_STATUS_MAP[status] ?? { label: status, color: 'gray' as const };
  return <Badge color={color}>{label}</Badge>;
}

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  const { label, color } = DEVICE_STATUS_MAP[status] ?? { label: status, color: 'gray' as const };
  return <Badge color={color}>{label}</Badge>;
}

export function ClientStatusBadge({ status }: { status: ClientStatus | string }) {
  const { label, color } = (CLIENT_STATUS_MAP as Record<string, any>)[status] ?? { label: status, color: 'gray' as const };
  return <Badge color={color}>{label}</Badge>;
}
