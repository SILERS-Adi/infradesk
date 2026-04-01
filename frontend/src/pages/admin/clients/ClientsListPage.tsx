import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, ChevronRight, ChevronLeft, Upload, Phone, Mail, Ticket, Settings2, GripVertical, Eye, EyeOff, X, Pencil, Trash2, ExternalLink, XCircle, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { clientsApi } from '../../../api/clients';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ClientForm } from '../../../components/forms/ClientForm';
import { ClientStatusBadge } from '../../../components/ui/StatusBadge';
import { ImportCsvModal } from '../../../components/ui/ImportCsvModal';
import { UnifiedTicketWizard } from '../../../components/wizard/UnifiedTicketWizard';
import { useDebounce } from '../../../hooks/useDebounce';
import type { Client } from '../../../types';

const PAGE_SIZE = 20;

/* ── All possible columns ─────────────────────────────────────────── */
interface ColActions {
  navigate: (path: string) => void;
  onDelete: (c: Client) => void;
  onDeactivate: (c: Client) => void;
  onNewTicket: (c: Client) => void;
  onEdit: (c: Client) => void;
}

interface ColDef {
  key: string;
  label: string;
  group: string;
  defaultVisible: boolean;
  render: (c: Client, actions?: ColActions) => React.ReactNode;
  width?: string;
  stopPropagation?: boolean;
}

const ALL_COLUMNS: ColDef[] = [
  // Podstawowe
  { key: 'name', label: 'Nazwa', group: 'Podstawowe', defaultVisible: true,
    render: c => (
      <div className="flex items-center gap-3">
        <ClientAvatar client={c} size="sm" />
        <span className="font-medium text-white/85">{c.name}</span>
      </div>
    ), width: 'min-w-[200px]' },
  { key: 'legalName', label: 'Nazwa skrócona', group: 'Podstawowe', defaultVisible: false,
    render: c => <span className="text-white/50">{c.legalName || '—'}</span> },
  { key: 'taxId', label: 'NIP', group: 'Podstawowe', defaultVisible: true,
    render: c => <span className="font-mono text-white/50">{c.taxId || '—'}</span> },
  { key: 'clientType', label: 'Typ', group: 'Podstawowe', defaultVisible: false,
    render: c => <span className="text-white/50">{c.clientType === 'COMPANY' ? 'Firma' : 'Osoba'}</span> },
  { key: 'status', label: 'Status', group: 'Podstawowe', defaultVisible: true,
    render: c => <ClientStatusBadge status={c.status} /> },

  // Kontakt
  { key: 'phone', label: 'Telefon', group: 'Kontakt', defaultVisible: true,
    render: c => c.phone ? (
      <div className="flex items-center gap-1.5 text-white/50">
        <Phone className="h-3.5 w-3.5 flex-shrink-0 text-white/25" />{c.phone}
      </div>
    ) : <span className="text-white/15">—</span> },
  { key: 'email', label: 'Email', group: 'Kontakt', defaultVisible: true,
    render: c => c.email ? (
      <div className="flex items-center gap-1.5 text-white/40 text-xs">
        <Mail className="h-3 w-3 flex-shrink-0" /><span className="truncate max-w-[180px]">{c.email}</span>
      </div>
    ) : <span className="text-white/15">—</span> },
  { key: 'website', label: 'Strona WWW', group: 'Kontakt', defaultVisible: false,
    render: c => c.website ? <span className="text-white/40 text-xs truncate max-w-[160px]">{c.website}</span> : <span className="text-white/15">—</span> },

  // Adres
  { key: 'city', label: 'Miasto', group: 'Adres', defaultVisible: true,
    render: c => <span className="text-white/50">{c.city || '—'}</span> },
  { key: 'addressLine1', label: 'Adres', group: 'Adres', defaultVisible: false,
    render: c => <span className="text-white/40 text-xs truncate max-w-[180px]">{c.addressLine1 || '—'}</span> },
  { key: 'postalCode', label: 'Kod pocztowy', group: 'Adres', defaultVisible: false,
    render: c => <span className="text-white/40 font-mono">{c.postalCode || '—'}</span> },
  { key: 'country', label: 'Kraj', group: 'Adres', defaultVisible: false,
    render: c => <span className="text-white/40">{c.country || 'PL'}</span> },

  // Umowa
  { key: 'hasContract', label: 'Umowa', group: 'Umowa', defaultVisible: false,
    render: c => c.hasContract ? (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#4ADE80' }}>Tak</span>
    ) : <span className="text-white/15">—</span> },
  { key: 'hourlyRate', label: 'Stawka/h', group: 'Umowa', defaultVisible: false,
    render: c => c.hourlyRate ? <span className="text-white/50">{c.hourlyRate} zł</span> : <span className="text-white/15">—</span> },
  { key: 'contractMonthlyValue', label: 'Abonament', group: 'Umowa', defaultVisible: false,
    render: c => (c as any).contractMonthlyValue ? <span className="text-white/50">{(c as any).contractMonthlyValue} zł</span> : <span className="text-white/15">—</span> },
  { key: 'contractHours', label: 'Godziny umowy', group: 'Umowa', defaultVisible: false,
    render: c => (c as any).contractHours ? <span className="text-white/50">{(c as any).contractHours}h</span> : <span className="text-white/15">—</span> },

  // Funkcje
  { key: 'enableSecurityAudit', label: 'Audyt', group: 'Funkcje', defaultVisible: false,
    render: c => <FeatureDot enabled={(c as any).enableSecurityAudit} /> },
  { key: 'enableNetworkScan', label: 'Skan sieci', group: 'Funkcje', defaultVisible: false,
    render: c => <FeatureDot enabled={(c as any).enableNetworkScan} /> },
  { key: 'enableManagedBackup', label: 'Backup', group: 'Funkcje', defaultVisible: false,
    render: c => <FeatureDot enabled={(c as any).enableManagedBackup} /> },
  { key: 'enableMonthlyReport', label: 'Raport', group: 'Funkcje', defaultVisible: false,
    render: c => <FeatureDot enabled={(c as any).enableMonthlyReport} /> },

  // Statystyki
  { key: 'tickets', label: 'Zgłoszenia', group: 'Statystyki', defaultVisible: true,
    render: c => (c._count?.tickets ?? 0) > 0 ? (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,146,60,0.12)', color: '#FB923C' }}>
        <Ticket className="h-3 w-3" />{c._count?.tickets}
      </span>
    ) : <span className="text-white/15">—</span> },
  { key: 'locations', label: 'Lokalizacje', group: 'Statystyki', defaultVisible: false,
    render: c => <span className="text-white/40">{c._count?.locations ?? 0}</span> },
  { key: 'devices', label: 'Urządzenia', group: 'Statystyki', defaultVisible: false,
    render: c => <span className="text-white/40">{c._count?.devices ?? 0}</span> },

  // Osobowe
  { key: 'firstName', label: 'Imię kontaktu', group: 'Osobowe', defaultVisible: false,
    render: c => <span className="text-white/50">{c.firstName || '—'}</span> },
  { key: 'lastName', label: 'Nazwisko kontaktu', group: 'Osobowe', defaultVisible: false,
    render: c => <span className="text-white/50">{c.lastName || '—'}</span> },
  { key: 'notes', label: 'Notatki', group: 'Osobowe', defaultVisible: false,
    render: c => c.notes ? <span className="text-white/30 text-xs truncate max-w-[150px] block">{c.notes}</span> : <span className="text-white/15">—</span> },

  // Akcje
  { key: 'act_open', label: 'Otwórz', group: 'Akcje', defaultVisible: false, stopPropagation: true,
    render: (c, a) => (
      <button onClick={(e) => { e.stopPropagation(); a?.navigate(`/clients/${c.id}`); }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-violet-400 hover:bg-violet-500/10 transition-all">
        <ExternalLink className="h-3 w-3" /> Otwórz
      </button>
    )},
  { key: 'act_edit', label: 'Edytuj', group: 'Akcje', defaultVisible: false, stopPropagation: true,
    render: (c, a) => (
      <button onClick={(e) => { e.stopPropagation(); a?.onEdit(c); }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-blue-400 hover:bg-blue-500/10 transition-all">
        <Pencil className="h-3 w-3" /> Edytuj
      </button>
    )},
  { key: 'act_ticket', label: 'Nowe zgłoszenie', group: 'Akcje', defaultVisible: false, stopPropagation: true,
    render: (c, a) => (
      <button onClick={(e) => { e.stopPropagation(); a?.onNewTicket(c); }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/10 transition-all">
        <Plus className="h-3 w-3" /> Zgłoszenie
      </button>
    )},
  { key: 'act_deactivate', label: 'Dezaktywuj', group: 'Akcje', defaultVisible: false, stopPropagation: true,
    render: (c, a) => c.status === 'ACTIVE' ? (
      <button onClick={(e) => { e.stopPropagation(); a?.onDeactivate(c); }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-amber-400 hover:bg-amber-500/10 transition-all">
        <Power className="h-3 w-3" /> Dezaktywuj
      </button>
    ) : <span className="text-[10px] text-white/20">Nieaktywny</span> },
  { key: 'act_delete', label: 'Usuń', group: 'Akcje', defaultVisible: false, stopPropagation: true,
    render: (c, a) => (
      <button onClick={(e) => { e.stopPropagation(); a?.onDelete(c); }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-red-400 hover:bg-red-500/10 transition-all">
        <Trash2 className="h-3 w-3" /> Usuń
      </button>
    )},
];

function FeatureDot({ enabled }: { enabled: boolean }) {
  return enabled
    ? <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 mx-auto" />
    : <div className="w-2.5 h-2.5 rounded-full bg-white/10 mx-auto" />;
}

/* ── Storage for column config ────────────────────────────────────── */
const STORAGE_KEY = 'infradesk_client_columns';

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

/* ── Client Avatar ────────────────────────────────────────────────── */
function ClientAvatar({ client, size = 'sm' }: { client: Client; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-[13px]';
  const initials = client.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className={`${sz} rounded-lg flex items-center justify-center font-bold flex-shrink-0`}
      style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
      {initials}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════════ */
export function ClientsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showColumnEditor, setShowColumnEditor] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(loadColumns);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Client | null>(null);
  const [ticketForClient, setTicketForClient] = useState<Client | null>(null);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const debouncedSearch = useDebounce(search);

  const colActions: ColActions = {
    navigate,
    onDelete: (c) => setDeleteTarget(c),
    onDeactivate: (c) => setDeactivateTarget(c),
    onNewTicket: (c) => setTicketForClient(c),
    onEdit: (c) => {
      // Fetch full client data then open editor
      clientsApi.getOne(c.id).then(full => setEditClient(full)).catch(() => toast.error('Błąd ładowania'));
    },
  };

  useEffect(() => { saveColumns(visibleKeys); }, [visibleKeys]);

  const { data, isLoading } = useQuery({
    queryKey: ['clients', debouncedSearch, page],
    queryFn: () => clientsApi.getPaged({ search: debouncedSearch || undefined, page, limit: PAGE_SIZE }),
  });

  const clients = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;
  const total = pagination?.total ?? 0;

  const visibleCols = visibleKeys.map(k => ALL_COLUMNS.find(c => c.key === k)).filter(Boolean) as ColDef[];

  const toggleColumn = (key: string) => {
    setVisibleKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const groups = [...new Set(ALL_COLUMNS.map(c => c.group))];

  return (
    <div>
      <PageHeader
        title="Klienci"
        subtitle={`${total} klientów`}
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
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all duration-200 active:scale-[0.97]"
              style={{ color: 'var(--ts)', background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>
              <Upload className="h-4 w-4" /> Import
            </button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
              Nowy klient
            </Button>
          </div>
        }
      />

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--td)' }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Szukaj: nazwa, NIP, miasto, email, telefon..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl focus:outline-none transition-all duration-200 placeholder:text-white/20"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.08)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>
      </div>

      {isLoading && <div className="text-center py-12 text-sm text-white/30">Ładowanie...</div>}

      {!isLoading && clients.length === 0 && (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <Building2 className="h-10 w-10 mx-auto mb-3 text-white/15" />
          <p className="font-medium text-white/50">Brak klientów</p>
          <p className="text-sm mt-1 text-white/25">Dodaj pierwszego klienta.</p>
          <div className="mt-4"><Button onClick={() => setShowCreate(true)} icon={<Plus className="h-4 w-4" />}>Dodaj klienta</Button></div>
        </div>
      )}

      {!isLoading && clients.length > 0 && (
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
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {clients.map(client => (
                    <tr key={client.id} onClick={() => navigate(`/clients/${client.id}`)}
                      className="cursor-pointer transition-colors duration-150"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      {visibleCols.map(col => (
                        <td key={col.key} className="px-5 py-3.5">{col.render(client, colActions)}</td>
                      ))}
                      <td className="px-4 py-3.5">
                        <ChevronRight className="h-4 w-4 text-white/15" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {clients.map(client => (
              <div key={client.id} onClick={() => navigate(`/clients/${client.id}`)}
                className="rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-all duration-200 active:scale-[0.99]"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <ClientAvatar client={client} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white/85 truncate">{client.name}</span>
                    <ClientStatusBadge status={client.status} />
                  </div>
                  {client.taxId && <div className="text-xs font-mono text-white/30 mt-0.5">NIP: {client.taxId}</div>}
                  <div className="flex items-center gap-3 mt-1 text-xs text-white/30">
                    <span>{client.city || ''}</span>
                    {client.phone && <span>{client.phone}</span>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-white/15" />
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-white/35">Strona {page} z {totalPages} · {total} klientów</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-all duration-200 disabled:opacity-30"
                  style={{ color: 'var(--ts)', background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>
                  <ChevronLeft className="h-4 w-4" /> Poprzednia
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 5) p = i + 1;
                    else if (page <= 3) p = i + 1;
                    else if (page >= totalPages - 2) p = totalPages - 4 + i;
                    else p = page - 2 + i;
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        className="w-9 h-9 text-sm font-medium rounded-xl transition-all duration-200"
                        style={page === p
                          ? { background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)', color: '#fff', boxShadow: '0 2px 8px rgba(79,140,255,0.2)' }
                          : { color: 'var(--tm)', background: 'var(--bg-card)' }
                        }>{p}</button>
                    );
                  })}
                </div>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-all duration-200 disabled:opacity-30"
                  style={{ color: 'var(--ts)', background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>
                  Następna <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Column Editor Panel — bottom fixed, drag & drop ──────── */}
      {showColumnEditor && (
        <ColumnEditorPanel
          visibleKeys={visibleKeys}
          setVisibleKeys={setVisibleKeys}
          groups={groups}
          onClose={() => setShowColumnEditor(false)}
        />
      )}

      {/* Modals */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} size="xl" noPadding>
        <ClientForm onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['clients'] }); }} onCancel={() => setShowCreate(false)} />
      </Modal>
      <ImportCsvModal open={showImport} onClose={() => setShowImport(false)} onSuccess={() => qc.invalidateQueries({ queryKey: ['clients'] })} />

      {/* Inline Edit Panel */}
      {editClient && (
        <QuickEditPanel
          client={editClient}
          onSave={() => { setEditClient(null); qc.invalidateQueries({ queryKey: ['clients'] }); }}
          onCancel={() => setEditClient(null)}
        />
      )}

      {/* New ticket wizard */}
      <UnifiedTicketWizard
        open={!!ticketForClient}
        onClose={() => setTicketForClient(null)}
        defaultClientId={ticketForClient?.id}
        onSuccess={() => {
          setTicketForClient(null);
          qc.invalidateQueries({ queryKey: ['clients'] });
        }}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await clientsApi.delete(deleteTarget.id);
            toast.success(`Klient "${deleteTarget.name}" usunięty`);
            qc.invalidateQueries({ queryKey: ['clients'] });
          } catch (e: any) { toast.error(e?.response?.data?.error || 'Błąd usuwania'); }
          setDeleteTarget(null);
        }}
        title="Usunąć klienta?"
        message={`Czy na pewno chcesz usunąć klienta "${deleteTarget?.name}"? Tej operacji nie można cofnąć.`}
        confirmLabel="Usuń"
      />

      {/* Deactivate confirmation */}
      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={async () => {
          if (!deactivateTarget) return;
          try {
            await clientsApi.deactivate(deactivateTarget.id);
            toast.success(`Klient "${deactivateTarget.name}" dezaktywowany`);
            qc.invalidateQueries({ queryKey: ['clients'] });
          } catch (e: any) { toast.error(e?.response?.data?.error || 'Błąd'); }
          setDeactivateTarget(null);
        }}
        title="Dezaktywować klienta?"
        message={`Czy chcesz dezaktywować klienta "${deactivateTarget?.name}"?`}
        confirmLabel="Dezaktywuj"
      />
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
          {/* LEFT: Toggle columns by group */}
          <div className="flex-1 p-4 overflow-y-auto" style={{ borderRight: '1px solid var(--border)' }}>
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

          {/* RIGHT: empty — order strip is below */}

        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Quick Edit Panel — slide-in from right
   ════════════════════════════════════════════════════════════════════ */
function QuickEditPanel({ client, onSave, onCancel }: { client: any; onSave: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ ...client });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await clientsApi.update(client.id, form);
      toast.success('Zapisano');
      onSave();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Błąd'); }
    setSaving(false);
  };

  const F = ({ label, field, type = 'text', half = false }: { label: string; field: string; type?: string; half?: boolean }) => (
    <div className={half ? 'flex-1 min-w-[140px]' : 'w-full'}>
      <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--tm)' }}>{label}</label>
      <input type={type} value={form[field] ?? ''} onChange={e => set(field, type === 'number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value || null)}
        className="w-full px-3 py-2 text-sm rounded-xl focus:outline-none" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }} onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }} />
    </div>
  );

  const T = ({ label, field }: { label: string; field: string }) => (
    <button onClick={() => set(field, !form[field])} className="flex items-center gap-2 py-1.5 px-3 rounded-xl text-xs font-medium transition-all"
      style={{ background: form[field] ? 'rgba(34,197,94,0.1)' : 'var(--bg-card)', border: form[field] ? '1px solid rgba(34,197,94,0.2)' : '1px solid var(--border)', color: form[field] ? '#4ADE80' : 'var(--tm)' }}>
      <div className={`w-2.5 h-2.5 rounded-full ${form[field] ? 'bg-emerald-400' : 'bg-white/10'}`} /> {label}
    </button>
  );

  const S = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div><h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--tm)' }}>{title}</h3>{children}</div>
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="ml-auto relative z-10 h-full w-full max-w-[660px] overflow-y-auto"
        style={{ background: 'var(--bg2)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>
          <div>
            <h2 className="text-lg font-bold text-white/85">Edycja klienta</h2>
            <p className="text-xs text-white/35 mt-0.5">{client.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-medium text-white/50 hover:bg-white/5">Anuluj</button>
            <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)', boxShadow: '0 2px 10px rgba(79,140,255,0.2)' }}>
              {saving ? '...' : 'Zapisz'}
            </button>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <S title="Dane podstawowe">
            <div className="space-y-3">
              <F label="Nazwa firmy" field="name" />
              <div className="flex gap-3"><F label="Nazwa skrócona" field="legalName" half /><F label="NIP" field="taxId" half /></div>
              <div className="flex gap-3">
                <div className="flex-1"><label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--tm)' }}>Typ</label>
                  <select value={form.clientType || 'COMPANY'} onChange={e => set('clientType', e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}>
                    <option value="COMPANY">Firma</option><option value="INDIVIDUAL">Osoba</option></select></div>
                <div className="flex-1"><label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--tm)' }}>Status</label>
                  <select value={form.status || 'ACTIVE'} onChange={e => set('status', e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}>
                    <option value="ACTIVE">Aktywny</option><option value="INACTIVE">Nieaktywny</option></select></div>
              </div>
            </div>
          </S>
          <S title="Kontakt">
            <div className="space-y-3">
              <div className="flex gap-3"><F label="Email" field="email" half /><F label="Telefon" field="phone" half /></div>
              <F label="Strona WWW" field="website" />
              <div className="flex gap-3"><F label="Imię kontaktu" field="firstName" half /><F label="Nazwisko" field="lastName" half /></div>
            </div>
          </S>
          <S title="Adres">
            <div className="space-y-3">
              <F label="Adres" field="addressLine1" />
              <div className="flex gap-3"><F label="Kod pocztowy" field="postalCode" half /><F label="Miasto" field="city" half /></div>
            </div>
          </S>
          <S title="Umowa">
            <div className="space-y-3">
              <T label="Posiada umowę" field="hasContract" />
              <div className="flex gap-3"><F label="Stawka/h (zł)" field="hourlyRate" type="number" half /><F label="Abonament (zł)" field="contractMonthlyValue" type="number" half /></div>
              <div className="flex gap-3"><F label="Godziny w umowie" field="contractHours" type="number" half /><F label="Stawka po limicie" field="contractHourlyRateOverLimit" type="number" half /></div>
            </div>
          </S>
          <S title="Usługi">
            <div className="flex flex-wrap gap-2">
              <T label="Audyt" field="enableSecurityAudit" /><T label="Skan sieci" field="enableNetworkScan" />
              <T label="Backup" field="enableManagedBackup" /><T label="Raport" field="enableMonthlyReport" />
            </div>
          </S>
          <S title="Notatki">
            <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value || null)} rows={3}
              className="w-full px-3 py-2 text-sm rounded-xl focus:outline-none resize-none" placeholder="Notatki..."
              style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} />
          </S>
        </div>
      </div>
    </div>
  );
}
