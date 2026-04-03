// ============================================================================
// IDS 1.0 — Packaging Module Utils (PakOps Full)
// ============================================================================

export function fmtWeight(g: number): string {
  if (g >= 1000) return `${(g / 1000).toFixed(1)} kg`;
  return `${g} g`;
}

export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

export function fmtTime(iso: string): string {
  return iso.slice(11, 16);
}

export function fmtDateTime(iso: string): string {
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

export function fmtMoney(n: number | string): string {
  return Number(n).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPercent(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}
