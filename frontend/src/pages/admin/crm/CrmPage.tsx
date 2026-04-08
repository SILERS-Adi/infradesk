import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Phone, Mail, Calendar, FileText, Plus,
  AlertCircle, Trash2, CheckCircle2, Clock,
  Settings2, Eye, EyeOff, GripVertical, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { crmApi } from '../../../api/crm';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { UnifiedTicketWizard } from '../../../components/wizard/UnifiedTicketWizard';
import { getErrorMessage } from '../../../utils/helpers';
import { ErrorState } from '../../../components/ui/ErrorState';
import type { CrmActivity, CrmActivityType, QuoteStatus } from '../../../types';

export const CRM_TYPE_CONFIG: Record<CrmActivityType, {
  label: string; icon: React.ReactNode; color: string; bg: string;
}> = {
  PHONE:   { label: 'Telefon',   icon: <Phone className="h-4 w-4" />,    color: '#4ADE80',  bg: 'rgba(34,197,94,0.12)' },
  EMAIL:   { label: 'E-mail',    icon: <Mail className="h-4 w-4" />,     color: '#60A5FA',  bg: 'rgba(59,130,246,0.12)' },
  MEETING: { label: 'Spotkanie', icon: <Calendar className="h-4 w-4" />, color: '#A78BFA',  bg: 'rgba(139,92,246,0.12)' },
  QUOTE:   { label: 'Oferta',    icon: <FileText className="h-4 w-4" />, color: '#FB923C',  bg: 'rgba(249,115,22,0.12)' },
};

export const QUOTE_STATUS_CONFIG: Record<QuoteStatus, { label: string; bg: string; color: string }> = {
  NEW:         { label: 'Nowe',                 bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)' },
  PREPARING:   { label: 'Wycena w toku',        bg: 'rgba(234,179,8,0.12)',   color: '#FACC15' },
  SENT:        { label: 'Wycena wysłana',       bg: 'rgba(59,130,246,0.12)',  color: '#60A5FA' },
  ACCEPTED:    { label: 'Zaakceptowana',        bg: 'rgba(34,197,94,0.12)',   color: '#4ADE80' },
  REJECTED:    { label: 'Odrzucona',            bg: 'rgba(239,68,68,0.12)',   color: '#F87171' },
  IN_PROGRESS: { label: 'W realizacji',         bg: 'rgba(139,92,246,0.12)',  color: '#A78BFA' },
  COMPLETED:   { label: 'Zakończone',           bg: 'rgba(16,185,129,0.12)',  color: '#34D399' },
};

type FilterType = CrmActivityType | 'ALL';

/* ── Helper: get summary text ──────────────────────────────────────── */
function getSummary(a: CrmActivity): string {
  if (a.type === 'PHONE') return a.notes || '';
  if (a.type === 'EMAIL') return a.subject || '';
  if (a.type === 'MEETING') return a.title || a.meetingPlace || a.notes || '';
  return a.quoteDescription || '';
}

/* ── All possible columns ──────────────────────────────────────────── */
interface ColDef {
  key: string;
  label: string;
  group: string;
  defaultVisible: boolean;
  render: (a: CrmActivity) => React.ReactNode;
  width?: string;
}

const ALL_COLUMNS: ColDef[] = [
  // Podstawowe
  {
    key: 'type', label: 'Typ', group: 'Podstawowe', defaultVisible: true,
    render: (a) => {
      const cfg = CRM_TYPE_CONFIG[a.type];
      return (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: cfg.bg, border: '1px solid var(--border)' }}>
            <span style={{ color: cfg.color }}>{cfg.icon}</span>
          </div>
          <span className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
        </div>
      );
    },
    width: 'min-w-[130px]',
  },
  {
    key: 'client', label: 'Kontakt', group: 'Podstawowe', defaultVisible: true,
    render: (a) => <span className="text-xs" style={{ color: 'var(--ts)' }}>{(a as any).contactName || '—'}</span>,
    width: 'min-w-[160px]',
  },
  {
    key: 'summary', label: 'Opis', group: 'Podstawowe', defaultVisible: true,
    render: (a) => {
      const text = getSummary(a);
      return text
        ? <span className="text-sm line-clamp-1" style={{ color: 'var(--ts)' }}>{text}</span>
        : <span style={{ color: 'var(--td)' }}>—</span>;
    },
    width: 'min-w-[200px]',
  },

  // Status
  {
    key: 'followUp', label: 'Follow-up', group: 'Status', defaultVisible: true,
    render: (a) => a.followUpRequired ? (
      <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
        <AlertCircle className="h-3 w-3" /> Tak
      </span>
    ) : (
      <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--td)' }}>
        <CheckCircle2 className="h-3 w-3" /> Nie
      </span>
    ),
  },
  {
    key: 'quoteStatus', label: 'Status oferty', group: 'Status', defaultVisible: false,
    render: (a) => {
      if (a.type !== 'QUOTE' || !a.quoteStatus) return <span style={{ color: 'var(--td)' }}>—</span>;
      const qs = QUOTE_STATUS_CONFIG[a.quoteStatus];
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: qs.bg, color: qs.color }}>
          {qs.label}
        </span>
      );
    },
  },

  // Finanse
  {
    key: 'quoteValue', label: 'Wartość', group: 'Finanse', defaultVisible: false,
    render: (a) => {
      if (a.type !== 'QUOTE' || a.quoteValue == null) return <span style={{ color: 'var(--td)' }}>—</span>;
      const val = typeof a.quoteValue === 'string' ? parseFloat(a.quoteValue) : a.quoteValue;
      return <span className="text-xs font-medium" style={{ color: 'var(--ts)' }}>{val.toLocaleString('pl-PL')} zł</span>;
    },
  },

  // Czas
  {
    key: 'date', label: 'Data', group: 'Czas', defaultVisible: true,
    render: (a) => {
      const d = new Date(a.occurredAt);
      const dateStr = d.toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
      return (
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--tm)' }}>
          <Clock className="h-3 w-3" />{dateStr} {timeStr}
        </span>
      );
    },
    width: 'min-w-[160px]',
  },
  {
    key: 'createdBy', label: 'Utworzył', group: 'Czas', defaultVisible: true,
    render: (a) => a.createdBy
      ? <span className="text-xs" style={{ color: 'var(--tm)' }}>{a.createdBy.firstName} {a.createdBy.lastName}</span>
      : <span style={{ color: 'var(--td)' }}>—</span>,
  },
];

/* ── Storage for column config ─────────────────────────────────────── */
const STORAGE_KEY = 'infradesk_crm_columns';

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
export function CrmPage() {
  const [showWizard, setShowWizard] = useState(false);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showColumnEditor, setShowColumnEditor] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(loadColumns);
  const qc = useQueryClient();

  useEffect(() => { saveColumns(visibleKeys); }, [visibleKeys]);

  const { data: activities = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['crm', filter],
    queryFn: () => crmApi.getAll(filter !== 'ALL' ? { type: filter } : {}),
  });

  const deleteMutation = useMutation({
    mutationFn: () => crmApi.delete(deleteId!),
    onSuccess: () => { toast.success('Usunięto'); qc.invalidateQueries({ queryKey: ['crm'] }); setDeleteId(null); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const visibleCols = visibleKeys.map(k => ALL_COLUMNS.find(c => c.key === k)).filter(Boolean) as ColDef[];
  const groups = [...new Set(ALL_COLUMNS.map(c => c.group))];

  return (
    <div>
      <PageHeader
        title="CRM"
        subtitle="Historia kontaktów i zapytania ofertowe"
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
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowWizard(true)}>
              Nowe zgłoszenie
            </Button>
          </div>
        }
      />

      {/* Filtry */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {(['ALL', 'PHONE', 'EMAIL', 'MEETING', 'QUOTE'] as FilterType[]).map(f => {
          const cfg = f !== 'ALL' ? CRM_TYPE_CONFIG[f] : null;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors"
              style={filter === f
                ? (cfg
                  ? { color: cfg.color, background: cfg.bg, borderColor: 'transparent' }
                  : { background: 'rgba(255,255,255,0.1)', color: '#fff', borderColor: 'transparent' })
                : { background: 'var(--bg-card)', color: 'var(--tm)', borderColor: 'var(--border)' }
              }
            >
              {cfg?.icon}
              {f === 'ALL' ? 'Wszystkie' : cfg?.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--tm)' }}>Ładowanie...</div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : activities.length === 0 ? (
        <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--tm)' }}>Brak wpisów CRM</div>
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
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map(a => (
                    <tr key={a.id}
                      className="transition-colors duration-150"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      {visibleCols.map(col => (
                        <td key={col.key} className="px-5 py-3.5">{col.render(a)}</td>
                      ))}
                      <td className="px-4 py-3.5 text-right">
                        <button onClick={() => setDeleteId(a.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                          style={{ color: 'var(--td)' }}>
                          <Trash2 className="h-4 w-4 hover:text-red-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {activities.map(a => {
              const cfg = CRM_TYPE_CONFIG[a.type];
              const summary = getSummary(a);
              const d = new Date(a.occurredAt);
              const dateStr = d.toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' });
              return (
                <div key={a.id} className="rounded-2xl p-4"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: cfg.bg, border: '1px solid var(--border)' }}>
                      <span style={{ color: cfg.color }}>{cfg.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {(a as any).contactName && (
                          <span className="text-xs font-semibold" style={{ color: 'var(--ts)' }}>{(a as any).contactName}</span>
                        )}
                        <span className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                        {a.followUpRequired && (
                          <span className="flex items-center gap-0.5 text-xs text-amber-400 font-medium">
                            <AlertCircle className="h-3 w-3" /> Do działania
                          </span>
                        )}
                      </div>
                      {summary && <p className="text-sm mt-0.5 line-clamp-2" style={{ color: 'var(--ts)' }}>{summary}</p>}
                      <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'var(--tm)' }}>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{dateStr}</span>
                        {a.createdBy && <span>{a.createdBy.firstName} {a.createdBy.lastName}</span>}
                      </div>
                    </div>
                    <button onClick={() => setDeleteId(a.id)} className="hover:text-red-400 transition-colors flex-shrink-0 mt-1" style={{ color: 'var(--td)' }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Column Editor Panel */}
      {showColumnEditor && (
        <CrmColumnEditorPanel
          visibleKeys={visibleKeys}
          setVisibleKeys={setVisibleKeys}
          groups={groups}
          onClose={() => setShowColumnEditor(false)}
        />
      )}

      {/* Unified Wizard */}
      <UnifiedTicketWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onSuccess={() => { qc.invalidateQueries({ queryKey: ['crm'] }); }}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate()}
        title="Usuń wpis"
        message="Czy na pewno chcesz usunąć ten wpis CRM?"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Column Editor — drag & drop reorder + toggle visibility
   ════════════════════════════════════════════════════════════════════ */
function CrmColumnEditorPanel({ visibleKeys, setVisibleKeys, groups, onClose }: {
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
