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
    <div className="page-card" style={{ overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--td)',
                background: 'var(--hover-bg)',
              }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={keyExtractor ? keyExtractor(row) : idx}
              onClick={() => onRowClick?.(row)}
              style={{ borderBottom: '1px solid var(--border)', cursor: onRowClick ? 'pointer' : 'default', transition: 'background .15s' }}
              onMouseEnter={(e) => { if (onRowClick) e.currentTarget.style.background = 'var(--hover-bg)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              {columns.map(col => (
                <td key={col.key} className={col.className} style={{ padding: '10px 14px', fontSize: 12, color: 'var(--ts)' }}>
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
