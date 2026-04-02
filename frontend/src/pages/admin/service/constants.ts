import type { BadgeColor } from './types';

export const INSPECTION_STATUS_MAP: Record<string, { label: string; color: BadgeColor }> = {
  SCHEDULED: { label: 'Zaplanowany', color: 'yellow' },
  IN_PROGRESS: { label: 'W trakcie', color: 'blue' },
  COMPLETED: { label: 'Zakończony', color: 'green' },
  CANCELLED: { label: 'Anulowany', color: 'gray' },
};

export const INSPECTION_RESULT_MAP: Record<string, { label: string; color: BadgeColor }> = {
  POSITIVE: { label: 'Pozytywny', color: 'green' },
  NEGATIVE: { label: 'Negatywny', color: 'red' },
  CONDITIONAL: { label: 'Warunkowy', color: 'orange' },
};

export const INSPECTION_TYPE_MAP: Record<string, string> = {
  PERIODIC: 'Okresowy',
  TECHNICAL: 'Techniczny',
  GAS_INSTALLATION: 'Instalacja gazowa',
  ADR: 'ADR',
  TAXI: 'Taksówka',
  OTHER: 'Inny',
};

export const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Wszystkie statusy' },
  { value: 'SCHEDULED', label: 'Zaplanowane' },
  { value: 'IN_PROGRESS', label: 'W trakcie' },
  { value: 'COMPLETED', label: 'Zakończone' },
  { value: 'CANCELLED', label: 'Anulowane' },
];

export const TYPE_OPTIONS = [
  { value: 'PERIODIC', label: 'Okresowy' },
  { value: 'TECHNICAL', label: 'Techniczny' },
  { value: 'GAS_INSTALLATION', label: 'Instalacja gazowa' },
  { value: 'ADR', label: 'ADR' },
  { value: 'TAXI', label: 'Taksówka' },
  { value: 'OTHER', label: 'Inny' },
];

export const RESULT_OPTIONS = [
  { value: '', label: 'Brak wyniku' },
  { value: 'POSITIVE', label: 'Pozytywny' },
  { value: 'NEGATIVE', label: 'Negatywny' },
  { value: 'CONDITIONAL', label: 'Warunkowy' },
];
