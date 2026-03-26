import { type ReactNode } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  onRowClick?: (row: T) => void;
  keyExtractor?: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}

export function DataTable<T extends object>({
  columns, data, loading, onRowClick, keyExtractor, emptyTitle, emptyDescription, emptyAction,
}: DataTableProps<T>) {
  if (loading) return <LoadingSpinner />;
  if (!data.length) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;

  return (
    <div className="overflow-x-auto rounded-[14px]" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <table className="min-w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {columns.map(col => (
              <th key={col.key} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.02)' }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={keyExtractor ? keyExtractor(row) : idx}
              onClick={() => onRowClick?.(row)}
              className={`transition-colors duration-150 ${onRowClick ? 'cursor-pointer' : ''}`}
              style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
              onMouseEnter={(e) => { if (onRowClick) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              {columns.map(col => (
                <td key={col.key} className={`px-4 py-3 text-[13px] ${col.className ?? ''}`} style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {col.render ? col.render(row) : ((row as Record<string, unknown>)[col.key] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
