// @ts-nocheck
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Copy, Check, Eye, EyeOff,
  Wifi, Server, Monitor, Mail, Shield, Globe, Database, Camera, KeyRound, Network,
  Pencil, Trash2, ChevronDown, Settings2, GripVertical, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { credentialsApi } from '../../../api/credentials';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { CredentialForm } from '../../../components/forms/CredentialForm';
import { useDebounce } from '../../../hooks/useDebounce';
import { copyToClipboard, getErrorMessage } from '../../../utils/helpers';
import type { Credential } from '../../../types';

const CATEGORY_CONFIG: Record<string, {
  icon: React.ReactNode;
  bg: string;
  text: string;
  label: string;
}> = {
  ROUTER:  { icon: <Network className="h-4 w-4" />,   bg: 'rgba(249,115,22,0.12)', text: '#F97316', label: 'Router' },
  SERVER:  { icon: <Server className="h-4 w-4" />,    bg: 'rgba(239,68,68,0.12)',  text: '#EF4444', label: 'Serwer' },
  WINDOWS: { icon: <Monitor className="h-4 w-4" />,   bg: 'rgba(59,130,246,0.12)', text: '#3B82F6', label: 'Windows' },
  EMAIL:   { icon: <Mail className="h-4 w-4" />,      bg: 'rgba(99,102,241,0.12)', text: '#6366F1', label: 'Email' },
  VPN:     { icon: <Shield className="h-4 w-4" />,    bg: 'rgba(168,85,247,0.12)', text: '#A855F7', label: 'VPN' },
  WIFI:    { icon: <Wifi className="h-4 w-4" />,      bg: 'rgba(34,197,94,0.12)',  text: '#22C55E', label: 'WiFi' },
  DOMAIN:  { icon: <Globe className="h-4 w-4" />,     bg: 'rgba(14,165,233,0.12)', text: '#0EA5E9', label: 'Domena' },
  NAS:     { icon: <Database className="h-4 w-4" />,  bg: 'var(--hover-bg)',       text: 'var(--tm)', label: 'NAS' },
  CAMERA:  { icon: <Camera className="h-4 w-4" />,    bg: 'var(--hover-bg)',       text: 'var(--tm)', label: 'Kamera' },
  OTHER:   { icon: <KeyRound className="h-4 w-4" />,  bg: 'var(--hover-bg)',       text: 'var(--td)', label: 'Inne' },
};

const CATEGORIES = Object.keys(CATEGORY_CONFIG);

/* ── Column definitions ────────────────────────────────────────────── */
interface ColDef {
  key: string;
  label: string;
  group: string;
  defaultVisible: boolean;
  render: (c: Credential) => React.ReactNode;
  width?: string;
}

const ALL_COLUMNS: ColDef[] = [
  // Podstawowe
  {
    key: 'name', label: 'Nazwa', group: 'Podstawowe', defaultVisible: true,
    render: (c) => {
      const cfg = CATEGORY_CONFIG[c.category] ?? CATEGORY_CONFIG.OTHER;
      return (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg, color: cfg.text }}>
            {cfg.icon}
          </div>
          <span className="font-medium" style={{ color: 'var(--t)' }}>{c.name}</span>
        </div>
      );
    },
    width: 'min-w-[200px]',
  },
  {
    key: 'category', label: 'Kategoria', group: 'Podstawowe', defaultVisible: true,
    render: (c) => {
      const cfg = CATEGORY_CONFIG[c.category] ?? CATEGORY_CONFIG.OTHER;
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: cfg.bg, color: cfg.text }}>
          {cfg.icon}{cfg.label}
        </span>
      );
    },
  },

  // Powiazania
  {
    key: 'client', label: 'Lokalizacja', group: 'Powiazania', defaultVisible: true,
    render: (c) => (c as any).location?.name
      ? <span className="font-medium text-sm" style={{ color: 'var(--ts)' }}>{(c as any).location.name}</span>
      : <span style={{ color: 'var(--td)' }}>—</span>,
  },
  {
    key: 'device', label: 'Urzadzenie', group: 'Powiazania', defaultVisible: false,
    render: (c) => c.device?.name
      ? <span className="text-sm" style={{ color: 'var(--tm)' }}>{c.device.name}</span>
      : <span style={{ color: 'var(--td)' }}>—</span>,
  },
  {
    key: 'location', label: 'Lokalizacja', group: 'Powiazania', defaultVisible: false,
    render: (c) => c.location?.name
      ? <span className="text-sm" style={{ color: 'var(--tm)' }}>{c.location.name}</span>
      : <span style={{ color: 'var(--td)' }}>—</span>,
  },

  // Dostep
  {
    key: 'url', label: 'URL / Host', group: 'Dostep', defaultVisible: true,
    render: (c) => c.urlOrHost
      ? <span className="font-mono text-xs truncate max-w-[180px] block" style={{ color: 'var(--tm)' }}>{c.urlOrHost}{c.port ? `:${c.port}` : ''}</span>
      : <span style={{ color: 'var(--td)' }}>—</span>,
  },
  {
    key: 'port', label: 'Port', group: 'Dostep', defaultVisible: false,
    render: (c) => c.port
      ? <span className="font-mono text-xs" style={{ color: 'var(--tm)' }}>{c.port}</span>
      : <span style={{ color: 'var(--td)' }}>—</span>,
  },
  {
    key: 'login', label: 'Login', group: 'Dostep', defaultVisible: true,
    // rendered inline with copy — see CredentialLoginCell
    render: () => null,
  },
  {
    key: 'password', label: 'Haslo', group: 'Dostep', defaultVisible: true,
    // rendered inline with reveal + copy — see CredentialPasswordCell
    render: () => null,
  },
];

/* ── Storage for column config ────────────────────────────────────── */
const STORAGE_KEY = 'infradesk_credential_columns';

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

/* ── Login cell with copy ─────────────────────────────────────────── */
function CredentialLoginCell({ cred }: { cred: Credential }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cred.username) return;
    await copyToClipboard(cred.username);
    setCopied(true);
    toast.success('Login skopiowany');
    setTimeout(() => setCopied(false), 2000);
  };

  if (!cred.username) return <span style={{ color: 'var(--td)' }}>—</span>;

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs" style={{ color: 'var(--ts)' }}>{cred.username}</span>
      <button onClick={handleCopy} title="Kopiuj login"
        className="p-1 rounded-lg transition-colors hover:bg-indigo-500/10"
        style={{ color: 'var(--td)' }}>
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/* ── Password cell with reveal + copy ─────────────────────────────── */
function CredentialPasswordCell({ cred }: { cred: Credential }) {
  const [password, setPassword] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [loadingReveal, setLoadingReveal] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleReveal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (password) { setShown(v => !v); return; }
    setLoadingReveal(true);
    try {
      const r = await credentialsApi.reveal(cred.id);
      setPassword(r.password);
      setShown(true);
    } catch {
      toast.error('Nie mozna odslonic hasla');
    } finally {
      setLoadingReveal(false);
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!password) return;
    await copyToClipboard(password);
    setCopied(true);
    toast.success('Haslo skopiowane');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs min-w-[60px]" style={{ color: 'var(--ts)' }}>
        {shown && password ? password : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
      </span>
      <button onClick={handleReveal} title={shown ? 'Ukryj' : 'Pokaz haslo'}
        className="p-1 rounded-lg transition-colors hover:bg-indigo-500/10"
        style={{ color: 'var(--td)' }}>
        {loadingReveal
          ? <div className="h-3.5 w-3.5 border border-current border-t-transparent rounded-full animate-spin" />
          : shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      {password && (
        <button onClick={handleCopy} title="Kopiuj haslo"
          className="p-1 rounded-lg transition-colors hover:bg-indigo-500/10"
          style={{ color: 'var(--td)' }}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════════ */
export function CredentialsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Credential | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);
  const [showColumnEditor, setShowColumnEditor] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(loadColumns);
  const debouncedSearch = useDebounce(search);

  useEffect(() => { saveColumns(visibleKeys); }, [visibleKeys]);

  const { data: credentials = [], isLoading } = useQuery({
    queryKey: ['credentials', { category }],
    queryFn: () => credentialsApi.getAll({
      category:  category  || undefined,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => credentialsApi.delete(id),
    onSuccess: () => {
      toast.success('Usunieto dane dostepowe');
      qc.invalidateQueries({ queryKey: ['credentials'] });
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const filtered = credentials.filter(c =>
    !debouncedSearch ||
    c.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    c.username?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (c as any).location?.name?.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  const visibleCols = visibleKeys.map(k => ALL_COLUMNS.find(c => c.key === k)).filter(Boolean) as ColDef[];
  const groups = [...new Set(ALL_COLUMNS.map(c => c.group))];

  const renderCell = (col: ColDef, cred: Credential) => {
    if (col.key === 'login') return <CredentialLoginCell cred={cred} />;
    if (col.key === 'password') return <CredentialPasswordCell cred={cred} />;
    return col.render(cred);
  };

  return (
    <div>
      <PageHeader
        title="Dostepy"
        subtitle={`${filtered.length} wpisow`}
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
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
              Nowy dostep
            </Button>
          </div>
        }
      />

      {/* Filtry */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--td)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
          />
        </div>
        <FilterSelect
          value={category}
          onChange={setCategory}
          placeholder="Kategoria"
          options={CATEGORIES.map(c => ({ value: c, label: CATEGORY_CONFIG[c]?.label ?? c }))}
        />
      </div>

      {/* Skroty kategorii */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
        <button
          onClick={() => setCategory('')}
          className={clsx(
            'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
          )}
          style={!category
            ? { background: 'var(--accent-g)', color: 'var(--accent)', borderColor: 'var(--accent)' }
            : { background: 'var(--hover-bg)', borderColor: 'var(--border)', color: 'var(--tm)' }
          }
        >
          Wszystkie
        </button>
        {CATEGORIES.map(cat => {
          const cfg = CATEGORY_CONFIG[cat];
          return (
            <button
              key={cat}
              onClick={() => setCategory(category === cat ? '' : cat)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
              style={category === cat
                ? { background: cfg.bg, color: cfg.text, borderColor: 'transparent' }
                : { background: 'var(--hover-bg)', borderColor: 'var(--border)', color: 'var(--tm)' }
              }
            >
              {cfg.icon}
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {isLoading && <div className="text-center py-12 text-sm" style={{ color: 'var(--td)' }}>Ladowanie...</div>}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <KeyRound className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--td)' }} />
          <p className="font-medium" style={{ color: 'var(--tm)' }}>Brak danych dostepowych</p>
          <p className="text-sm mt-1" style={{ color: 'var(--td)' }}>Dodaj pierwszy wpis klikajac "Nowy dostep".</p>
        </div>
      )}

      {/* Table */}
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
                        style={{ color: 'var(--tm)' }}>{col.label}</th>
                    ))}
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(cred => (
                    <tr key={cred.id}
                      className="transition-colors duration-150"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      {visibleCols.map(col => (
                        <td key={col.key} className="px-5 py-3.5">{renderCell(col, cred)}</td>
                      ))}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {cred.isSharedWithClient && <Badge color="green">Udost.</Badge>}
                          <ActionBtn onClick={() => setEditTarget(cred)} title="Edytuj"><Pencil className="h-3.5 w-3.5" /></ActionBtn>
                          <ActionBtn onClick={() => setDeleteTarget(cred)} title="Usun" danger><Trash2 className="h-3.5 w-3.5" /></ActionBtn>
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
            {filtered.map(cred => (
              <MobileCredentialCard
                key={cred.id}
                cred={cred}
                onEdit={() => setEditTarget(cred)}
                onDelete={() => setDeleteTarget(cred)}
              />
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

      <Modal open={showCreate} onClose={() => setShowCreate(false)} size="xl" noPadding>
        <CredentialForm
          onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['credentials'] }); }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      {editTarget && (
        <Modal open={!!editTarget} onClose={() => setEditTarget(null)} size="xl" noPadding>
          <CredentialForm
            credential={editTarget}
            onSuccess={() => { setEditTarget(null); qc.invalidateQueries({ queryKey: ['credentials'] }); }}
            onCancel={() => setEditTarget(null)}
          />
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Usun dane dostepowe"
        message={`Czy na pewno usunac "${deleteTarget?.name}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

/* ── Action button ── */
function ActionBtn({ onClick, title, children, danger }: {
  onClick: () => void; title: string; children: React.ReactNode; danger?: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className={clsx(
        'p-1.5 rounded-lg transition-colors',
        danger ? 'hover:text-red-400 hover:bg-red-500/10' : 'hover:text-indigo-400 hover:bg-indigo-500/10'
      )}
      style={{ color: 'var(--td)' }}
    >
      {children}
    </button>
  );
}

/* ── Mobile credential card ── */
function MobileCredentialCard({ cred, onEdit, onDelete }: {
  cred: Credential;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cfg = CATEGORY_CONFIG[cred.category] ?? CATEGORY_CONFIG.OTHER;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-start gap-4 p-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg, color: cfg.text }}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm" style={{ color: 'var(--t)' }}>{cred.name}</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs mt-0.5" style={{ color: 'var(--tm)' }}>
            {(cred as any).location?.name && <span className="font-medium" style={{ color: 'var(--ts)' }}>{(cred as any).location.name}</span>}
            {cred.urlOrHost && (
              <span className="font-mono" style={{ color: 'var(--td)' }}>
                {cred.urlOrHost}{cred.port ? `:${cred.port}` : ''}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
            {cred.username && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--td)' }}>Login:</span>
                <CredentialLoginCell cred={cred} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--td)' }}>Haslo:</span>
              <CredentialPasswordCell cred={cred} />
            </div>
          </div>
        </div>
      </div>
      <div className="flex" style={{ borderTop: '1px solid var(--border)' }}>
        {cred.isSharedWithClient && (
          <div className="flex-1 flex items-center justify-center py-2 text-xs text-green-500 font-medium">
            Udostepnione klientowi
          </div>
        )}
        <button onClick={onEdit} className="flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors" style={{ color: 'var(--tm)', borderLeft: '1px solid var(--border)' }}>
          <Pencil className="h-3.5 w-3.5" />Edytuj
        </button>
        <button onClick={onDelete} className="flex-1 py-2.5 text-xs text-red-400 font-medium flex items-center justify-center gap-1.5" style={{ borderLeft: '1px solid var(--border)' }}>
          <Trash2 className="h-3.5 w-3.5" />Usun
        </button>
      </div>
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
            <span className="text-sm font-semibold" style={{ color: 'var(--t)' }}>Edycja kolumn</span>
            <span className="text-xs" style={{ color: 'var(--td)' }}>({visibleKeys.length} widocznych)</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg transition-colors" style={{ color: 'var(--td)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Horizontal drag strip */}
        <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto" style={{ borderTop: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
          <span className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0 mr-1" style={{ color: 'var(--td)' }}>Kolejnosc:</span>
          <GripVertical className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--td)' }} />
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
              <GripVertical className="h-3 w-3" style={{ color: 'var(--td)' }} />
              {col.label}
            </div>
          ))}
          <span className="text-[9px] flex-shrink-0 ml-2" style={{ color: 'var(--td)' }}>&#8592; przeciagnij aby zmienic &#8594;</span>
        </div>

        <div className="flex gap-0 flex-1 overflow-hidden" style={{ borderTop: '1px solid var(--border)' }}>
          {/* Toggle columns by group */}
          <div className="flex-1 p-4 overflow-y-auto">
            <p className="text-[9px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--td)' }}>Wlacz / wylacz kolumny</p>
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

/* ── Filter Select ── */
function FilterSelect({ value, onChange, placeholder, options }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none rounded-xl px-3 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer"
        style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--td)' }} />
    </div>
  );
}
