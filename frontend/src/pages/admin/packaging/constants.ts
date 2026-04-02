// ============================================================================
// IDS 1.0 — Packaging Module Constants
// ============================================================================

import type { BadgeColor } from './types';

export const STATUS_MAP: Record<string, { label: string; color: BadgeColor }> = {
  pending:   { label: 'Oczekuje',    color: 'yellow' },
  packing:   { label: 'Pakowanie',   color: 'blue' },
  packed:    { label: 'Spakowana',   color: 'indigo' },
  shipped:   { label: 'Wysłana',     color: 'green' },
  delivered: { label: 'Dostarczono', color: 'green' },
  error:     { label: 'Błąd',        color: 'red' },
  cancelled: { label: 'Anulowana',   color: 'gray' },
};

export const COURIER_MAP: Record<string, { label: string; color: BadgeColor }> = {
  inpost:  { label: 'InPost',        color: 'yellow' },
  dpd:     { label: 'DPD',           color: 'red' },
  ups:     { label: 'UPS',           color: 'orange' },
  fedex:   { label: 'FedEx',         color: 'purple' },
  dhl:     { label: 'DHL',           color: 'yellow' },
  poczta:  { label: 'Poczta Polska', color: 'blue' },
  odbior:  { label: 'Odbiór osobisty', color: 'gray' },
};

export const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Wszystkie statusy' },
  { value: 'pending', label: 'Oczekujące' },
  { value: 'packing', label: 'W pakowaniu' },
  { value: 'packed', label: 'Spakowane' },
  { value: 'shipped', label: 'Wysłane' },
  { value: 'error', label: 'Błędy' },
];

export const COURIER_FILTER_OPTIONS = [
  { value: '', label: 'Wszyscy kurierzy' },
  { value: 'inpost', label: 'InPost' },
  { value: 'dpd', label: 'DPD' },
  { value: 'ups', label: 'UPS' },
  { value: 'fedex', label: 'FedEx' },
  { value: 'dhl', label: 'DHL' },
  { value: 'poczta', label: 'Poczta Polska' },
  { value: 'odbior', label: 'Odbiór osobisty' },
];

export const COURIER_OPTIONS = [
  { value: 'inpost', label: 'InPost' },
  { value: 'dpd', label: 'DPD' },
  { value: 'ups', label: 'UPS' },
  { value: 'fedex', label: 'FedEx' },
  { value: 'dhl', label: 'DHL' },
  { value: 'poczta', label: 'Poczta Polska' },
  { value: 'odbior', label: 'Odbiór osobisty' },
];
