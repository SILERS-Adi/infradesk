// ============================================================================
// InfraDesk Invoicing Module — Utility functions
// ============================================================================

import type { DatePreset } from "./types";

// ── Number formatting ──

/** Format number as Polish currency (e.g. 1 234,56) */
export function fmtPLN(n: number | null | undefined): string {
  return (n || 0).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format integer with Polish locale (e.g. 1 234) */
export function fmtInt(n: number | null | undefined): string {
  return (n || 0).toLocaleString("pl-PL");
}

// ── Date helpers ──

/** Return today as YYYY-MM-DD string */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Return a date N days ago as YYYY-MM-DD string */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Return first day of current month as YYYY-MM-DD string */
export function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Return first day of current year as YYYY-MM-DD string */
export function yearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

/** Return [start, end] of previous month as YYYY-MM-DD strings */
export function prevMonthRange(): [string, string] {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  return [start, end];
}

/** Resolve a DatePreset to a [from, to] date range */
export function getDateRange(preset: DatePreset): [string, string] {
  switch (preset) {
    case "today":      return [todayStr(), todayStr()];
    case "yesterday":  return [daysAgo(1), daysAgo(1)];
    case "7d":         return [daysAgo(6), todayStr()];
    case "month":      return [monthStart(), todayStr()];
    case "prev_month": return prevMonthRange();
    case "year":       return [yearStart(), todayStr()];
    default:           return [monthStart(), todayStr()];
  }
}

// ── File download helper ──

/** Trigger a browser download from a Blob response */
export function downloadBlob(data: Blob, filename: string): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── CSV parsing helpers (for import preview) ──

/** Auto-detect CSV separator from header line */
export function detectCsvSeparator(headerLine: string): string {
  if (headerLine.includes(";")) return ";";
  if (headerLine.includes("\t")) return "\t";
  return ",";
}
