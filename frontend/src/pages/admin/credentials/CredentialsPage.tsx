import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Copy, Check, Eye, EyeOff,
  Wifi, Server, Monitor, Mail, Shield, Globe, Database, Camera, KeyRound, Network,
  Pencil, Trash2, ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { credentialsApi } from '../../../api/credentials';
import { clientsApi } from '../../../api/clients';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { CredentialForm } from '../../../components/forms/CredentialForm';
import { useDebounce } from '../../../hooks/useDebounce';
import { copyToClipboard, getErrorMessage } from '../../../utils/helpers';
import type { Credential } from '../../../types';

// Ikony i kolory kategorii
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
  NAS:     { icon: <Database className="h-4 w-4" />,  bg: 'rgba(255,255,255,0.04)', text: 'rgba(255,255,255,0.5)', label: 'NAS' },
  CAMERA:  { icon: <Camera className="h-4 w-4" />,    bg: 'rgba(255,255,255,0.04)', text: 'rgba(255,255,255,0.5)', label: 'Kamera' },
  OTHER:   { icon: <KeyRound className="h-4 w-4" />,  bg: 'rgba(255,255,255,0.04)', text: 'rgba(255,255,255,0.4)', label: 'Inne' },
};

const CATEGORIES = Object.keys(CATEGORY_CONFIG);

export function CredentialsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [category, setCategory] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Credential | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);
  const debouncedSearch = useDebounce(search);

  const { data: credentials = [], isLoading } = useQuery({
    queryKey: ['credentials', { clientId, category }],
    queryFn: () => credentialsApi.getAll({
      clientId:  clientId  || undefined,
      category:  category  || undefined,
    }),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => credentialsApi.delete(id),
    onSuccess: () => {
      toast.success('Usunięto dane dostępowe');
      qc.invalidateQueries({ queryKey: ['credentials'] });
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const filtered = credentials.filter(c =>
    !debouncedSearch ||
    c.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    c.username?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    c.client?.name.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Dostępy"
        subtitle={`${filtered.length} wpisów`}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
            Nowy dostęp
          </Button>
        }
      />

      {/* Filtry */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}
          />
        </div>
        <FilterSelect
          value={clientId}
          onChange={setClientId}
          placeholder="Wszyscy klienci"
          options={clients.map(c => ({ value: c.id, label: c.name }))}
        />
        <FilterSelect
          value={category}
          onChange={setCategory}
          placeholder="Kategoria"
          options={CATEGORIES.map(c => ({ value: c, label: CATEGORY_CONFIG[c]?.label ?? c }))}
        />
      </div>

      {/* Skróty kategorii (mobile scroll) */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
        <button
          onClick={() => setCategory('')}
          className={clsx(
            'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
            !category ? 'bg-sidebar-bg text-white border border-sidebar-bg' : 'border hover:border-white/20'
          )}
          style={category ? { background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' } : undefined}
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
                : { background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }
              }
            >
              {cfg.icon}
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <KeyRound className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
          <p className="font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>Brak danych dostępowych</p>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Dodaj pierwszy wpis klikając "Nowy dostęp".</p>
        </div>
      )}

      {/* Lista kart */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(cred => (
            <CredentialCard
              key={cred.id}
              cred={cred}
              onEdit={() => setEditTarget(cred)}
              onDelete={() => setDeleteTarget(cred)}
            />
          ))}
        </div>
      )}

      {/* Modal: nowy */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} size="xl" noPadding>
        <CredentialForm
          onSuccess={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['credentials'] });
          }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      {/* Modal: edycja */}
      {editTarget && (
        <Modal open={!!editTarget} onClose={() => setEditTarget(null)} size="xl" noPadding>
          <CredentialForm
            credential={editTarget}
            onSuccess={() => {
              setEditTarget(null);
              qc.invalidateQueries({ queryKey: ['credentials'] });
            }}
            onCancel={() => setEditTarget(null)}
          />
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Usuń dane dostępowe"
        message={`Czy na pewno usunąć "${deleteTarget?.name}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// Karta jednego dostępu
function CredentialCard({ cred, onEdit, onDelete }: {
  cred: Credential;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cfg = CATEGORY_CONFIG[cred.category] ?? CATEGORY_CONFIG.OTHER;
  const [password, setPassword] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [loadingReveal, setLoadingReveal] = useState(false);
  const [copiedUser, setCopiedUser] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  const handleReveal = async () => {
    if (password) { setShown(v => !v); return; }
    setLoadingReveal(true);
    try {
      const r = await credentialsApi.reveal(cred.id);
      setPassword(r.password);
      setShown(true);
    } catch {
      toast.error('Nie można odsłonić hasła');
    } finally {
      setLoadingReveal(false);
    }
  };

  const handleCopyUser = async () => {
    if (!cred.username) return;
    await copyToClipboard(cred.username);
    setCopiedUser(true);
    toast.success('Login skopiowany');
    setTimeout(() => setCopiedUser(false), 2000);
  };

  const handleCopyPass = async () => {
    if (!password) return;
    await copyToClipboard(password);
    setCopiedPass(true);
    toast.success('Hasło skopiowane');
    setTimeout(() => setCopiedPass(false), 2000);
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-start gap-4 p-4">
        {/* Ikona kategorii */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg, color: cfg.text }}>
          {cfg.icon}
        </div>

        {/* Treść */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-white/85 text-sm">{cred.name}</div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {cred.client?.name && <span className="font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{cred.client.name}</span>}
                {cred.device?.name && <><span>·</span><span>{cred.device.name}</span></>}
                {cred.location?.name && !cred.device && <><span>·</span><span>{cred.location.name}</span></>}
                {cred.urlOrHost && (
                  <span className="font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {cred.urlOrHost}{cred.port ? `:${cred.port}` : ''}
                  </span>
                )}
              </div>
            </div>
            {/* Akcje desktop */}
            <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
              {cred.isSharedWithClient && (
                <Badge color="green">Udostępnione</Badge>
              )}
              <button onClick={onEdit} className="p-1.5 rounded-lg transition-colors hover:text-violet-400" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={onDelete} className="p-1.5 rounded-lg transition-colors hover:text-red-400 hover:bg-red-500/10" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Login + Hasło */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
            {/* Login */}
            {cred.username && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Login:</span>
                <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>{cred.username}</span>
                <button
                  onClick={handleCopyUser}
                  className="transition-colors hover:text-violet-400"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                  title="Kopiuj login"
                >
                  {copiedUser
                    ? <Check className="h-3.5 w-3.5 text-green-500" />
                    : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}

            {/* Hasło */}
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Hasło:</span>
              <span className="text-xs font-mono min-w-[72px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {shown && password ? password : '••••••••'}
              </span>
              <button
                onClick={handleReveal}
                disabled={loadingReveal}
                className="transition-colors hover:text-violet-400"
                style={{ color: 'rgba(255,255,255,0.3)' }}
                title={shown ? 'Ukryj' : 'Pokaż hasło'}
              >
                {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              {password && (
                <button
                  onClick={handleCopyPass}
                  className="transition-colors hover:text-violet-400"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                  title="Kopiuj hasło"
                >
                  {copiedPass
                    ? <Check className="h-3.5 w-3.5 text-green-500" />
                    : <Copy className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Akcje mobile */}
      <div className="sm:hidden flex" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        {cred.isSharedWithClient && (
          <div className="flex-1 flex items-center justify-center py-2 text-xs text-green-400 font-medium">
            Udostępnione klientowi
          </div>
        )}
        <button onClick={onEdit} className="flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-white/[0.03] transition-colors" style={{ color: 'rgba(255,255,255,0.5)', borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
          <Pencil className="h-3.5 w-3.5" />Edytuj
        </button>
        <button onClick={onDelete} className="flex-1 py-2.5 text-xs text-red-400 hover:bg-red-500/10 font-medium flex items-center justify-center gap-1.5" style={{ borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
          <Trash2 className="h-3.5 w-3.5" />Usuń
        </button>
      </div>
    </div>
  );
}

// Pomocniczy select dla filtrów
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
        className="appearance-none rounded-xl px-3 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'rgba(255,255,255,0.3)' }} />
    </div>
  );
}
