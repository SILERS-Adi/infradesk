// @ts-nocheck
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ordersApi } from '../../../api/orders';
import { PageHeader } from '../../../components/ui/PageHeader';
import { formatDate, getErrorMessage } from '../../../utils/helpers';
import { ErrorState } from '../../../components/ui/ErrorState';
import type { Order, OrderStatus } from '../../../types';
import { Package, Settings2, Eye, EyeOff, GripVertical, X } from 'lucide-react';

const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Nowe',
  PENDING_APPROVAL: 'Oczekuje na akceptację',
  IN_PROGRESS: 'W realizacji',
  INSTALLED: 'Zamontowane',
  CANCELLED: 'Anulowane',
};
const STATUS_COLORS: Record<OrderStatus, { bg: string; color: string }> = {
  NEW:              { bg: 'rgba(59,130,246,0.12)',  color: '#60A5FA' },
  PENDING_APPROVAL: { bg: 'rgba(234,179,8,0.12)',   color: '#FACC15' },
  IN_PROGRESS:      { bg: 'rgba(249,115,22,0.12)',  color: '#FB923C' },
  INSTALLED:        { bg: 'rgba(34,197,94,0.12)',   color: '#4ADE80' },
  CANCELLED:        { bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' },
};
const STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  NEW: 'PENDING_APPROVAL',
  PENDING_APPROVAL: 'IN_PROGRESS',
  IN_PROGRESS: 'INSTALLED',
};

/* ── Column definitions ──────────────────────────────────────────── */
interface ColDef {
  key: string;
  label: string;
  group: string;
  defaultVisible: boolean;
  render: (o: Order) => React.ReactNode;
  width?: string;
}

const ALL_COLUMNS: ColDef[] = [
  // Podstawowe
  { key: 'number', label: 'Nr', group: 'Podstawowe', defaultVisible: true,
    render: o => <span className="font-mono text-sm font-bold text-violet-400">{o.orderNumber}</span>,
    width: 'min-w-[100px]' },
  { key: 'status', label: 'Status', group: 'Podstawowe', defaultVisible: true,
    render: o => (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
        style={{ background: STATUS_COLORS[o.status].bg, color: STATUS_COLORS[o.status].color }}>
        {STATUS_LABELS[o.status]}
      </span>
    ) },
  { key: 'client', label: 'Lokalizacja', group: 'Podstawowe', defaultVisible: true,
    render: o => <span style={{ color: 'var(--t)' }}>{o.location?.name || '—'}</span> },

  // Szczegoly
  { key: 'items', label: 'Pozycje', group: 'Szczegóły', defaultVisible: true,
    render: o => {
      if (!o.items || o.items.length === 0) return <span style={{ color: 'var(--tm)' }}>—</span>;
      if (o.items.length <= 3) {
        return <span className="text-xs" style={{ color: 'var(--tm)' }}>{o.items.map(i => i.name).join(', ')}</span>;
      }
      return <span className="text-xs" style={{ color: 'var(--tm)' }}>{o.items.length} pozycji</span>;
    } },
  { key: 'notes', label: 'Notatki', group: 'Szczegóły', defaultVisible: false,
    render: o => o.notes
      ? <span className="text-xs truncate max-w-[180px] block" style={{ color: 'var(--tm)' }}>{o.notes}</span>
      : <span style={{ color: 'var(--td)' }}>—</span> },

  // Finanse
  { key: 'total', label: 'Kwota', group: 'Finanse', defaultVisible: true,
    render: o => {
      const sum = (o.items || []).reduce((acc, i) => acc + (i.quantity || 0) * (i.price || 0), 0);
      return sum > 0
        ? <span className="font-medium" style={{ color: 'var(--t)' }}>{sum.toFixed(2)} zł</span>
        : <span style={{ color: 'var(--td)' }}>—</span>;
    } },

  // Czas
  { key: 'date', label: 'Data', group: 'Czas', defaultVisible: true,
    render: o => <span className="text-xs" style={{ color: 'var(--tm)' }}>{formatDate(o.createdAt)}</span> },
  { key: 'createdBy', label: 'Utworzył', group: 'Czas', defaultVisible: false,
    render: o => o.createdBy
      ? <span className="text-xs" style={{ color: 'var(--tm)' }}>{o.createdBy.firstName} {o.createdBy.lastName}</span>
      : <span style={{ color: 'var(--td)' }}>—</span> },
];

/* ── Storage for column config ───────────────────────────────────── */
const STORAGE_KEY = 'infradesk_order_columns';

function loadColumns(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);
}

function saveColumns(keys: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

/* ════════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════════ */
export function OrdersPage() {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<OrderStatus | ''>('');
  const [showColumnEditor, setShowColumnEditor] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(loadColumns);

  useEffect(() => { saveColumns(visibleKeys); }, [visibleKeys]);

  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['orders-all', filterStatus],
    queryFn: () => ordersApi.getAll(filterStatus ? { status: filterStatus } : undefined),
    refetchInterval: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => ordersApi.changeStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders-all'] }); toast.success('Status zaktualizowany'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const activeStatuses: OrderStatus[] = ['NEW', 'PENDING_APPROVAL', 'IN_PROGRESS', 'INSTALLED', 'CANCELLED'];

  const visibleCols = visibleKeys.map(k => ALL_COLUMNS.find(c => c.key === k)).filter(Boolean) as ColDef[];
  const groups = [...new Set(ALL_COLUMNS.map(c => c.group))];

  return (
    <div>
      <PageHeader
        title="Zamówienia"
        subtitle={`${orders.length} pozycji`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setShowColumnEditor(v => !v)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all duration-200 active:scale-[0.97]"
              style={{
                color: showColumnEditor ? '#A78BFA' : 'var(--ts)',
                background: showColumnEditor ? 'rgba(139,92,246,0.12)' : 'var(--hover-bg)',
                border: showColumnEditor ? '1px solid rgba(139,92,246,0.25)' : '1px solid var(--border)',
              }}>
              <Settings2 className="h-4 w-4" /> Kolumny
            </button>
          </div>
        }
      />

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 rounded-lg p-1 w-fit" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <button
          onClick={() => setFilterStatus('')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${!filterStatus ? 'bg-violet-600 text-white' : 'hover:bg-white/[0.03]'}`}
          style={filterStatus ? { color: 'var(--ts)' } : undefined}
        >
          Wszystkie
        </button>
        {activeStatuses.map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s === filterStatus ? '' : s)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filterStatus === s ? 'bg-violet-600 text-white' : 'hover:bg-white/[0.03]'}`}
            style={filterStatus !== s ? { color: 'var(--ts)' } : undefined}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" /></div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : orders.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--tm)' }}><Package className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>Brak zamówień</p></div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
                    {visibleCols.map(col => (
                      <th key={col.key} className={`text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider ${col.width || ''}`}
                        style={{ color: 'var(--tm)' }}>{col.label}</th>
                    ))}
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-right"
                      style={{ color: 'var(--tm)' }}>Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order: Order) => (
                    <tr key={order.id}
                      className="transition-colors duration-150"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      {visibleCols.map(col => (
                        <td key={col.key} className="px-5 py-3.5">{col.render(order)}</td>
                      ))}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          {STATUS_NEXT[order.status] && (
                            <button
                              onClick={() => statusMutation.mutate({ id: order.id, status: STATUS_NEXT[order.status]! })}
                              disabled={statusMutation.isPending}
                              className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 font-medium whitespace-nowrap"
                            >
                              → {STATUS_LABELS[STATUS_NEXT[order.status]!]}
                            </button>
                          )}
                          {order.status !== 'CANCELLED' && order.status !== 'INSTALLED' && (
                            <button
                              onClick={() => statusMutation.mutate({ id: order.id, status: 'CANCELLED' })}
                              disabled={statusMutation.isPending}
                              className="text-xs px-3 py-1.5 rounded-lg hover:text-red-400 hover:bg-red-500/10 font-medium transition-colors"
                              style={{ color: 'var(--tm)' }}
                            >
                              Anuluj
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {orders.map((order: Order) => (
              <div key={order.id} className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-sm font-bold text-violet-400">{order.orderNumber}</span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: STATUS_COLORS[order.status].bg, color: STATUS_COLORS[order.status].color }}
                      >
                        {STATUS_LABELS[order.status]}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--tm)' }}>{order.location?.name || '—'}</span>
                    </div>
                    <div className="space-y-1">
                      {order.items.map(item => (
                        <div key={item.id} className="flex items-center gap-3 text-sm">
                          <span className="font-medium" style={{ color: 'var(--t)' }}>{item.name}</span>
                          <span style={{ color: 'var(--tm)' }}>x{item.quantity}</span>
                          {item.price && <span style={{ color: 'var(--tm)' }}>{item.price.toFixed(2)} zl</span>}
                        </div>
                      ))}
                    </div>
                    {order.notes && <p className="text-xs mt-2" style={{ color: 'var(--tm)' }}>{order.notes}</p>}
                    <p className="text-xs mt-2" style={{ color: 'var(--tm)' }}>{formatDate(order.createdAt)} · {order.createdBy?.firstName} {order.createdBy?.lastName}</p>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {STATUS_NEXT[order.status] && (
                      <button
                        onClick={() => statusMutation.mutate({ id: order.id, status: STATUS_NEXT[order.status]! })}
                        disabled={statusMutation.isPending}
                        className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 font-medium whitespace-nowrap"
                      >
                        → {STATUS_LABELS[STATUS_NEXT[order.status]!]}
                      </button>
                    )}
                    {order.status !== 'CANCELLED' && order.status !== 'INSTALLED' && (
                      <button
                        onClick={() => statusMutation.mutate({ id: order.id, status: 'CANCELLED' })}
                        disabled={statusMutation.isPending}
                        className="text-xs px-3 py-1.5 rounded-lg hover:text-red-400 hover:bg-red-500/10 font-medium transition-colors"
                        style={{ color: 'var(--tm)' }}
                      >
                        Anuluj
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Column Editor Panel */}
      {showColumnEditor && (
        <ColumnEditorPanel
          visibleKeys={visibleKeys}
          setVisibleKeys={setVisibleKeys}
          groups={groups}
          onClose={() => setShowColumnEditor(false)}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Column Editor — drag & drop reorder + toggle visibility
   ════════════════════════════════════════════════════════════════════ */
function ColumnEditorPanel({ visibleKeys, setVisibleKeys, groups, onClose }: {
  visibleKeys: string[];
  setVisibleKeys: React.Dispatch<React.SetStateAction<string[]>>;
  groups: string[];
  onClose: () => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const toggleColumn = (key: string) => {
    setVisibleKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const onDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };

  const onDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setOverIdx(idx);
  };

  const onDrop = (toIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const fromIdx = dragIdx;
    setDragIdx(null);
    setOverIdx(null);
    if (fromIdx === null || fromIdx === toIdx) return;
    setVisibleKeys(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  const orderedVisible = visibleKeys.map(k => ALL_COLUMNS.find(c => c.key === k)).filter(Boolean) as ColDef[];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 top-[50%]" style={{ marginLeft: 'var(--sidebar-width, 220px)' }}>
      <div className="mx-4 mb-4 h-full rounded-t-2xl overflow-hidden flex flex-col" style={{
        background: 'var(--bg2)',
        border: '2px solid var(--accent)',
        backdropFilter: 'blur(24px)',
        boxShadow: '0 -12px 60px rgba(0,0,0,0.35), 0 0 30px var(--accent-g)',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-semibold text-white/80">Edycja kolumn</span>
            <span className="text-xs text-white/30">({visibleKeys.length} widocznych)</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Horizontal drag strip — live column order */}
        <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto" style={{ borderTop: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
          <span className="text-[9px] font-bold uppercase tracking-wider text-white/20 flex-shrink-0 mr-1">Kolejność:</span>
          <GripVertical className="h-3 w-3 text-white/15 flex-shrink-0" />
          {orderedVisible.map((col, idx) => (
            <div
              key={col.key}
              draggable
              onDragStart={onDragStart(idx)}
              onDragOver={onDragOver(idx)}
              onDrop={onDrop(idx)}
              onDragEnd={onDragEnd}
              className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[11px] font-medium cursor-grab active:cursor-grabbing select-none flex-shrink-0 transition-all"
              style={{
                background: overIdx === idx ? 'rgba(139,92,246,0.25)' : dragIdx === idx ? 'rgba(139,92,246,0.1)' : 'var(--hover-bg)',
                border: overIdx === idx ? '1px solid rgba(139,92,246,0.5)' : '1px solid var(--border)',
                color: overIdx === idx ? '#C4B5FD' : 'var(--ts)',
                opacity: dragIdx === idx ? 0.35 : 1,
                transform: overIdx === idx ? 'scale(1.08)' : 'scale(1)',
              }}>
              <GripVertical className="h-3 w-3 text-white/25" />
              {col.label}
            </div>
          ))}
          <span className="text-[9px] text-white/15 flex-shrink-0 ml-2">← przeciągnij aby zmienić →</span>
        </div>

        <div className="flex gap-0 flex-1 overflow-hidden" style={{ borderTop: '1px solid var(--border)' }}>
          {/* Toggle columns by group */}
          <div className="flex-1 p-4 overflow-y-auto">
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/20 mb-3">Włącz / wyłącz kolumny</p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {groups.map(group => (
                <div key={group}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/25 mb-1.5">{group}</p>
                  <div className="space-y-0.5">
                    {ALL_COLUMNS.filter(c => c.group === group).map(col => {
                      const visible = visibleKeys.includes(col.key);
                      return (
                        <button key={col.key} onClick={() => toggleColumn(col.key)}
                          className="flex items-center gap-2 w-full py-1.5 px-2 rounded-lg text-xs font-medium transition-all hover:bg-white/[0.03]"
                          style={{
                            background: visible ? 'rgba(139,92,246,0.1)' : 'transparent',
                            color: visible ? '#A78BFA' : 'var(--tm)',
                          }}>
                          {visible ? <Eye className="h-3 w-3 flex-shrink-0" /> : <EyeOff className="h-3 w-3 flex-shrink-0" />}
                          {col.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
