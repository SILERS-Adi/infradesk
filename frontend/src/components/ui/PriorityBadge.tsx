import { Badge } from './Badge';
import type { TicketPriority, DeviceCriticality } from '../../types';

const PRIORITY_MAP: Record<TicketPriority, { label: string; color: 'gray' | 'blue' | 'orange' | 'red' }> = {
  LOW: { label: 'Niski', color: 'gray' },
  MEDIUM: { label: 'Średni', color: 'blue' },
  HIGH: { label: 'Wysoki', color: 'orange' },
  CRITICAL: { label: 'Krytyczny', color: 'red' },
};

const CRITICALITY_MAP: Record<DeviceCriticality, { label: string; color: 'gray' | 'orange' | 'red' }> = {
  LOW: { label: 'Niska', color: 'gray' },
  MEDIUM: { label: 'Średnia', color: 'orange' },
  HIGH: { label: 'Wysoka', color: 'red' },
};

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const { label, color } = PRIORITY_MAP[priority] ?? { label: priority, color: 'gray' as const };
  return <Badge color={color}>{label}</Badge>;
}

export function CriticalityBadge({ criticality }: { criticality: DeviceCriticality }) {
  const { label, color } = CRITICALITY_MAP[criticality] ?? { label: criticality, color: 'gray' as const };
  return <Badge color={color}>{label}</Badge>;
}
