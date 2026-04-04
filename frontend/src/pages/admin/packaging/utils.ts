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

/** Get status label and color from ORDER_STATUS constants */
export function getStatusInfo(status: string): { label: string; color: string } {
  const ORDER_STATUS: Record<string, { label: string; color: string }> = {
    NEW: { label: 'Nowe', color: 'blue' },
    PAID: { label: 'Opłacone', color: 'green' },
    PICKING: { label: 'Zbieranie', color: 'yellow' },
    PICKED: { label: 'Zebrane', color: 'indigo' },
    PACKING: { label: 'Pakowanie', color: 'orange' },
    PACKED: { label: 'Spakowane', color: 'purple' },
    SHIPPED: { label: 'Wysłane', color: 'blue' },
    DELIVERED: { label: 'Dostarczone', color: 'green' },
    CANCELLED: { label: 'Anulowane', color: 'red' },
    RETURNED: { label: 'Zwrot', color: 'red' },
  };
  return ORDER_STATUS[status] || { label: status, color: 'gray' };
}

/** Format deadline as relative badge text */
export function deadlineText(iso?: string): { text: string; color: string } | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  const hours = diff / 3600000;
  if (hours < 0) return { text: 'OPÓŹNIONE', color: 'red' };
  if (hours < 3) return { text: `${Math.ceil(hours)}h`, color: 'orange' };
  if (hours < 24) return { text: `${Math.ceil(hours)}h`, color: 'yellow' };
  return { text: `${Math.ceil(hours / 24)}d`, color: 'gray' };
}
