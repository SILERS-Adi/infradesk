import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MapPin, Settings2, Eye, EyeOff, X, GripVertical, ChevronRight, Pencil, Trash2, ExternalLink, HelpCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { locationsApi } from '../../../api/locations';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { SearchInput } from '../../../components/ui/SearchInput';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { ScopedAccessBanner } from '../../../components/ui/ScopedAccessBanner';
import { LocationForm } from '../../../components/forms/LocationForm';
import { useDebounce } from '../../../hooks/useDebounce';
import { getErrorMessage } from '../../../utils/helpers';
import type { Location } from '../../../types';

/* ── Column definitions ─────────────────────────────────── */
interface ColDef {
  key: string;
  label: string;
  group: string;
  defaultVisible: boolean;
  render: (r: Location) => React.ReactNode;
  width?: string;
}

const ALL_COLUMNS: ColDef[] = [
  { key: 'name', label: 'Nazwa', group: 'Podstawowe', defaultVisible: true,
    render: r => <span className="font-medium" style={{ color: 'var(--t)' }}>{r.name}</span>, width: 'min-w-[180px]' },
  { key: 'client', label: 'Klient', group: 'Podstawowe', defaultVisible: true,
    render: r => <span style={{ color: 'var(--ts)' }}>{r.client?.name ?? '—'}</span> },
  { key: 'type', label: 'Typ', group: 'Podstawowe', defaultVisible: true,
    render: r => <Badge color="indigo">{r.type}</Badge> },
  { key: 'city', label: 'Miasto', group: 'Adres', defaultVisible: true,
    render: r => <span style={{ color: 'var(--ts)' }}>{r.city ?? '—'}</span> },
  { key: 'addressLine1', label: 'Adres', group: 'Adres', defaultVisible: false,
    render: r => <span className="text-xs" style={{ color: 'var(--tm)' }}>{r.addressLine1 ?? '—'}</span> },
  { key: 'postalCode', label: 'Kod pocztowy', group: 'Adres', defaultVisible: false,
    render: r => <span className="font-mono text-xs" style={{ color: 'var(--tm)' }}>{r.postalCode ?? '—'}</span> },
  { key: 'contact', label: 'Kontakt', group: 'Kontakt', defaultVisible: true,
    render: r => r.contactPersonName
      ? <span style={{ color: 'var(--ts)' }}>{r.contactPersonName}</span>
      : <span style={{ color: 'var(--td)' }}>—</span> },
  { key: 'phone', label: 'Telefon', group: 'Kontakt', defaultVisible: false,
    render: r => <span style={{ color: 'var(--tm)' }}>{r.contactPersonPhone ?? '—'}</span> },
  { key: 'email', label: 'Email', group: 'Kontakt', defaultVisible: false,
    render: r => <span className="text-xs" style={{ color: 'var(--tm)' }}>{r.contactPersonEmail ?? '—'}</span> },
  { key: 'devices', label: 'Urządzenia', group: 'Statystyki', defaultVisible: true,
    render: r => {
      const cnt = r._count?.devices ?? 0;
      return cnt > 0
        ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.1)', color: '#818CF8' }}>{cnt}</span>
        : <span style={{ color: 'var(--td)' }}>0</span>;
    }},
  { key: 'notes', label: 'Notatki', group: 'Inne', defaultVisible: false,
    render: r => r.notes
      ? <span className="text-xs truncate max-w-[150px] block" style={{ color: 'var(--tm)' }}>{r.notes}</span>
      : <span style={{ color: 'var(--td)' }}>—</span> },
];

/* ── Storage ── */
const STORAGE_KEY = 'infradesk_location_columns';
function loadColumns(): string[] {
  try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s); } catch {}
  return ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);
}
function saveColumns(keys: string[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)); }

/* ════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════ */
export function LocationsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showColumnEditor, setShowColumnEditor] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(loadColumns);
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);
  const debouncedSearch = useDebounce(search);

  useEffect(() => { saveColumns(visibleKeys); }, [visibleKeys]);

  const { data: locations = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => locationsApi.delete(id),
    onSuccess: () => { toast.success('Lokalizacja usunięta'); qc.invalidateQueries({ queryKey: ['locations'] }); setDeleteTarget(null); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Frontend search
  const filtered = locations.filter(loc => {
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      loc.name.toLowerCase().includes(q) ||
      (loc.client?.name ?? '').toLowerCase().includes(q) ||
      (loc.city ?? '').toLowerCase().includes(q) ||
      (loc.addressLine1 ?? '').toLowerCase().includes(q) ||
      (loc.contactPersonName ?? '').toLowerCase().includes(q) ||
      (loc.type ?? '').toLowerCase().includes(q)
    );
  });

  const visibleCols = visibleKeys.map(k => ALL_COLUMNS.find(c => c.key === k)).filter(Boolean) as ColDef[];
  const groups = [...new Set(ALL_COLUMNS.map(c => c.group))];

  return (
    <div>
      <PageHeader
        title="Lokalizacje"
        subtitle={`${filtered.length} lokalizacji`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setShowColumnEditor(v => !v)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all"
              style={{
                color: showColumnEditor ? 'var(--accent-s)' : 'var(--tm)',
                background: showColumnEditor ? 'var(--accent-g)' : 'var(--hover-bg)',
                border: showColumnEditor ? '1px solid var(--accent)' : '1px solid var(--border)',
              }}>
              <Settings2 className="h-4 w-4" /> Kolumny
            </button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
              Nowa lokalizacja
            </Button>
          </div>
        }
      />

      {/* Search (IDS) */}
      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Szukaj: nazwa, klient, miasto, typ..." />
      </div>

      <ScopedAccessBanner />
      {isLoading && <LoadingSpinner />}
      {!isLoading && isError && <ErrorState onRetry={() => refetch()} />}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="page-card">
          <EmptyState
            icon={<MapPin style={{ width: 22, height: 22, color: 'var(--td)' }} />}
            title="Brak lokalizacji"
            description={search ? 'Nie znaleziono lokalizacji pasujących do wyszukiwania.' : 'Dodaj pierwszą lokalizację.'}
            action={<Button onClick={() => setShowCreate(true)} icon={<Plus className="h-4 w-4" />} size="sm">Dodaj lokalizację</Button>}
          />
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
                    {visibleCols.map(col => (
                      <th key={col.key} className={`text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider ${col.width || ''}`}
                        style={{ color: 'var(--td)' }}>{col.label}</th>
                    ))}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(loc => (
                    <tr key={loc.id} onClick={() => navigate(`/locations/${loc.id}`)}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      {visibleCols.map(col => (
                        <td key={col.key} className="px-5 py-3.5">{col.render(loc)}</td>
                      ))}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => navigate(`/locations/${loc.id}`)}
                            className="p-1.5 rounded-lg transition-colors hover:text-indigo-400 hover:bg-indigo-500/10"
                            style={{ color: 'var(--td)' }} title="Otwórz">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setDeleteTarget(loc)}
                            className="p-1.5 rounded-lg transition-colors hover:text-red-400 hover:bg-red-500/10"
                            style={{ color: 'var(--td)' }} title="Usuń">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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
            {filtered.map(loc => (
              <div key={loc.id} onClick={() => navigate(`/locations/${loc.id}`)}
                className="rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-all active:scale-[0.99]"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--accent-g)', color: 'var(--accent-s)' }}>
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate" style={{ color: 'var(--t)' }}>{loc.name}</span>
                    <Badge color="indigo">{loc.type}</Badge>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--tm)' }}>
                    {loc.client?.name} · {loc.city || '—'}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--td)' }} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Column Editor */}
      {showColumnEditor && (
        <ColumnEditorPanel
          visibleKeys={visibleKeys}
          setVisibleKeys={setVisibleKeys}
          groups={groups}
          onClose={() => setShowColumnEditor(false)}
        />
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nowa lokalizacja" size="xl">
        <LocationForm
          onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['locations'] }); toast.success('Lokalizacja dodana'); }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Usuń lokalizację"
        message={`Czy usunąć "${deleteTarget?.name}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Column Editor Panel
   ════════════════════════════════════════════════════════════ */
function ColumnEditorPanel({ visibleKeys, setVisibleKeys, groups, onClose }: {
  visibleKeys: string[];
  setVisibleKeys: React.Dispatch<React.SetStateAction<string[]>>;
  groups: string[];
  onClose: () => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const toggleColumn = (key: string) => {
    setVisibleKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const onDragStart = (idx: number) => (e: React.DragEvent) => { setDragIdx(idx); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver = (idx: number) => (e: React.DragEvent) => { e.preventDefault(); setOverIdx(idx); };
  const onDrop = (toIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === toIdx) { setDragIdx(null); setOverIdx(null); return; }
    setVisibleKeys(prev => { const next = [...prev]; const [moved] = next.splice(dragIdx, 1); next.splice(toIdx, 0, moved); return next; });
    setDragIdx(null); setOverIdx(null);
  };
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  const orderedVisible = visibleKeys.map(k => ALL_COLUMNS.find(c => c.key === k)).filter(Boolean) as ColDef[];

  return (
    <div className="fixed inset-0 z-40" style={{ marginLeft: 220 }}>
      {/* Backdrop overlay */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 top-[40%] mx-4 mb-4 rounded-t-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--bg2)', border: '2px solid var(--accent)', boxShadow: '0 -12px 60px rgba(0,0,0,0.35), 0 0 30px var(--accent-g)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--t)' }}>Edycja kolumn</span>
            <span className="text-xs" style={{ color: 'var(--td)' }}>({visibleKeys.length} widocznych)</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowHelp(v => !v)}
              className="p-1.5 rounded-full transition-colors"
              style={{ color: showHelp ? 'var(--accent-s)' : 'var(--td)', background: showHelp ? 'var(--accent-g)' : 'transparent' }}
              title="Instrukcja">
              <HelpCircle className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full transition-colors" style={{ color: 'var(--tm)' }} title="Zamknij">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Help */}
        {showHelp && (
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)', background: 'var(--accent-g)' }}>
            <div className="flex gap-6 text-xs" style={{ color: 'var(--ts)' }}>
              <div className="flex-1 space-y-2">
                <p className="font-semibold" style={{ color: 'var(--t)' }}>Jak to działa?</p>
                <div className="flex items-start gap-2">
                  <Eye className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                  <p><strong>Włącz/wyłącz</strong> — kliknij nazwę kolumny w dolnej sekcji, żeby ją pokazać lub ukryć w tabeli.</p>
                </div>
                <div className="flex items-start gap-2">
                  <GripVertical className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                  <p><strong>Zmień kolejność</strong> — przeciągnij kafelek w pasku "Kolejność" na nową pozycję (drag & drop).</p>
                </div>
                <div className="flex items-start gap-2">
                  <Settings2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                  <p><strong>Zapis</strong> — ustawienia zapisują się automatycznie i są zapamiętane w przeglądarce.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Drag strip */}
        <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
          <span className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0 mr-1" style={{ color: 'var(--td)' }}>Kolejność:</span>
          {orderedVisible.map((col, idx) => (
            <div key={col.key} draggable onDragStart={onDragStart(idx)} onDragOver={onDragOver(idx)} onDrop={onDrop(idx)} onDragEnd={onDragEnd}
              className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[11px] font-medium cursor-grab active:cursor-grabbing select-none flex-shrink-0 transition-all"
              style={{
                background: overIdx === idx ? 'var(--accent-g)' : 'var(--hover-bg)',
                border: overIdx === idx ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: overIdx === idx ? 'var(--accent-s)' : 'var(--ts)',
                opacity: dragIdx === idx ? 0.35 : 1,
              }}>
              <GripVertical className="h-3 w-3" style={{ color: 'var(--td)' }} />
              {col.label}
            </div>
          ))}
        </div>

        {/* Toggle groups */}
        <div className="flex-1 p-4 overflow-y-auto">
          <p className="text-[9px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--td)' }}>Włącz / wyłącz kolumny</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.map(group => (
              <div key={group}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--td)' }}>{group}</p>
                <div className="space-y-0.5">
                  {ALL_COLUMNS.filter(c => c.group === group).map(col => {
                    const visible = visibleKeys.includes(col.key);
                    return (
                      <button key={col.key} onClick={() => toggleColumn(col.key)}
                        className="flex items-center gap-2 w-full py-1.5 px-2 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: visible ? 'var(--accent-g)' : 'transparent',
                          color: visible ? 'var(--accent-s)' : 'var(--tm)',
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
  );
}

