/**
 * Skeleton shimmer component for loading states.
 * Replaces spinning loaders with content-shaped placeholders.
 */

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 8, style, className }: SkeletonProps) {
  return (
    <div
      className={`skeleton-shimmer ${className || ''}`}
      style={{
        width,
        height,
        borderRadius,
        background: 'var(--skeleton-bg, rgba(255,255,255,0.04))',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
        animation: 'skeleton-shimmer 1.5s infinite',
      }} />
    </div>
  );
}

/** Skeleton for a KPI card */
export function SkeletonCard() {
  return (
    <div style={{ padding: 20, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <Skeleton width={80} height={12} style={{ marginBottom: 12 }} />
      <Skeleton width={120} height={28} style={{ marginBottom: 8 }} />
      <Skeleton width={60} height={12} />
    </div>
  );
}

/** Skeleton for a table row */
export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} width={i === 0 ? 60 : '100%'} height={14} />
      ))}
    </div>
  );
}

/** Skeleton for a list page (header + table) */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--border)' }}>
        <Skeleton width={200} height={32} borderRadius={10} />
        <Skeleton width={100} height={32} borderRadius={10} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </div>
  );
}

/** Skeleton for dashboard */
export function SkeletonDashboard() {
  return (
    <div style={{ padding: 16 }}>
      <Skeleton width={300} height={24} style={{ marginBottom: 24 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonTable rows={5} />
    </div>
  );
}
