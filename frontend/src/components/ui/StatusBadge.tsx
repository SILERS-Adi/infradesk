import { Badge } from './Badge';
import type { TicketStatus, DeviceStatus, ClientStatus } from '../../types';

const TICKET_STATUS_MAP: Record<TicketStatus, { label: string; color: 'blue' | 'yellow' | 'orange' | 'green' | 'gray' | 'red' }> = {
  PENDING:   { label: 'Oczekujące',  color: 'blue' },
  ASSIGNED:  { label: 'Przydzielone', color: 'yellow' },
  COMPLETED: { label: 'Zakończone',  color: 'green' },
  CANCELLED: { label: 'Anulowane',   color: 'gray' },
};

const DEVICE_STATUS_MAP: Record<DeviceStatus, { label: string; color: 'green' | 'gray' | 'red' | 'orange' | 'blue' }> = {
  ACTIVE: { label: 'Aktywne', color: 'green' },
  INACTIVE: { label: 'Nieaktywne', color: 'gray' },
  BROKEN: { label: 'Zepsute', color: 'red' },
  RETIRED: { label: 'Wycofane', color: 'gray' },
  IN_SERVICE: { label: 'W serwisie', color: 'orange' },
};

const CLIENT_STATUS_MAP: Record<ClientStatus, { label: string; color: 'green' | 'gray' }> = {
  ACTIVE: { label: 'Aktywny', color: 'green' },
  INACTIVE: { label: 'Nieaktywny', color: 'gray' },
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const { label, color } = TICKET_STATUS_MAP[status] ?? { label: status, color: 'gray' as const };
  return <Badge color={color}>{label}</Badge>;
}

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  const { label, color } = DEVICE_STATUS_MAP[status] ?? { label: status, color: 'gray' as const };
  return <Badge color={color}>{label}</Badge>;
}

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const { label, color } = CLIENT_STATUS_MAP[status] ?? { label: status, color: 'gray' as const };
  return <Badge color={color}>{label}</Badge>;
}
