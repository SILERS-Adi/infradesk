import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  /** Current page (1-indexed) */
  page: number;
  /** Total number of items */
  total: number;
  /** Items per page (default: 50) */
  perPage?: number;
  /** Called when page changes */
  onPageChange: (page: number) => void;
}

export function Pagination({ page, total, perPage = 50, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  if (totalPages <= 1) return null;

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 14px',
    borderRadius: 'var(--rs)',
    border: '1px solid var(--border)',
    background: disabled ? 'transparent' : 'var(--hover-bg)',
    color: disabled ? 'var(--td)' : 'var(--ts)',
    fontSize: 12,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'var(--trf)',
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '14px 16px',
        borderTop: '1px solid var(--border)',
      }}
    >
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        style={btnStyle(page <= 1)}
        type="button"
      >
        <ChevronLeft size={14} />
        Poprzednia
      </button>
      <span
        style={{
          fontSize: 12,
          color: 'var(--tm)',
          padding: '0 8px',
          whiteSpace: 'nowrap',
        }}
      >
        Strona <strong style={{ color: 'var(--t)', fontWeight: 600 }}>{page}</strong> z{' '}
        <strong style={{ color: 'var(--t)', fontWeight: 600 }}>{totalPages}</strong>
      </span>
      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        style={btnStyle(page >= totalPages)}
        type="button"
      >
        Następna
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
