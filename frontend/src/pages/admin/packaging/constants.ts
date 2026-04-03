// ============================================================================
// IDS 1.0 — Packaging Module Constants (PakOps Full)
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

export const ORDER_STATUS: Record<string, { label: string; color: BadgeColor }> = {
  NEW:       { label: 'Nowe',        color: 'blue' },
  PAID:      { label: 'Opłacone',    color: 'green' },
  PICKING:   { label: 'Zbieranie',   color: 'yellow' },
  PICKED:    { label: 'Zebrane',     color: 'indigo' },
  PACKING:   { label: 'Pakowanie',   color: 'orange' },
  PACKED:    { label: 'Spakowane',   color: 'purple' },
  SHIPPED:   { label: 'Wysłane',     color: 'blue' },
  DELIVERED: { label: 'Dostarczone', color: 'green' },
  CANCELLED: { label: 'Anulowane',   color: 'red' },
  RETURNED:  { label: 'Zwrot',       color: 'red' },
};

export const ORDER_STATUS_TABS = [
  { value: '', label: 'Wszystkie' },
  { value: 'NEW', label: 'Nowe' },
  { value: 'PAID', label: 'Opłacone' },
  { value: 'PICKING', label: 'Zbieranie' },
  { value: 'PACKING', label: 'Pakowanie' },
  { value: 'PACKED', label: 'Spakowane' },
  { value: 'SHIPPED', label: 'Wysłane' },
  { value: 'DELIVERED', label: 'Dostarczone' },
  { value: 'CANCELLED', label: 'Anulowane' },
];

export const BATCH_STATUS: Record<string, { label: string; color: BadgeColor }> = {
  OPEN:       { label: 'Otwarty',     color: 'blue' },
  IN_PROGRESS:{ label: 'W realizacji',color: 'yellow' },
  COMPLETED:  { label: 'Zakończony',  color: 'green' },
  CANCELLED:  { label: 'Anulowany',   color: 'gray' },
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

export const WAVE_STATUS: Record<string, { label: string; color: BadgeColor }> = {
  ON_TRACK:  { label: 'Na czas',  color: 'green' },
  LATE:      { label: 'Opóźniona',color: 'red' },
  COMPLETED: { label: 'Gotowa',   color: 'indigo' },
  PENDING:   { label: 'Oczekuje', color: 'yellow' },
};
