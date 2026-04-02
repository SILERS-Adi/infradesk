// ============================================================================
// IDS 1.0 — Packaging Module Utils
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
