import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { KeyRound, Plus, Eye, EyeOff, Copy, Trash2, Loader2, Search, X, Wifi, Mail, Monitor, Globe, Lock } from 'lucide-react';
import { credentialsApi } from '../../api/credentials';
import { useAuth } from '../../store/authStore';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';

const CATEGORIES = [
  { value: 'WIFI', label: 'WiFi', icon: Wifi, color: '#22D3EE' },
  { value: 'EMAIL', label: 'Email', icon: Mail, color: '#F59E0B' },
  { value: 'ROUTER', label: 'Router', icon: Globe, color: '#10B981' },
  { value: 'WINDOWS', label: 'Windows', icon: Monitor, color: '#3B82F6' },
  { value: 'OTHER', label: 'Inne', icon: Lock, color: '#8B5CF6' },
];

export function PortalVaultPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspaceContext();
  const workspaceId = workspace?.workspaceId;
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: creds = [], isLoading } = useQuery({
    queryKey: ['portal-credentials'],
    queryFn: () => credentialsApi.getAll({}),
    enabled: !!workspaceId,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => credentialsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portal-credentials'] }); toast.success('Usunięto'); setDeleteId(null); },
    onError: () => toast.error('Błąd usuwania'),
  });

  const filtered = creds.filter((c: any) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.username || '').toLowerCase().includes(search.toLowerCase())
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Skopiowano');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)' }}>
            <KeyRound className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white/85">Sejf haseł</h1>
            <p className="text-sm text-white/35">{creds.length} zapisanych haseł</p>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white active:scale-[0.97] transition-all"
          style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)', boxShadow: '0 2px 10px rgba(79,140,255,0.2)' }}>
          <Plus className="h-4 w-4" /> Dodaj hasło
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj..."
          className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }} />
      </div>

      {isLoading && <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin text-violet-400 mx-auto" /></div>}

      {!isLoading && filtered.length === 0 && (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <KeyRound className="h-10 w-10 mx-auto mb-3 text-white/15" />
          <p className="text-white/50 font-medium">Sejf jest pusty</p>
          <p className="text-sm text-white/25 mt-1">Dodaj swoje pierwsze hasło</p>
        </div>
      )}

      {/* Cards */}
      <div className="space-y-2">
        {filtered.map((cred: any) => {
          const cat = CATEGORIES.find(c => c.value === cred.category) || CATEGORIES[4];
          const Icon = cat.icon;
          const revealed = revealedId === cred.id;

          return (
            <div key={cred.id} className="rounded-xl p-4 flex items-center gap-4"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${cat.color}15` }}>
                <Icon className="h-5 w-5" style={{ color: cat.color }} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white/80">{cred.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${cat.color}15`, color: cat.color }}>{cat.label}</span>
                </div>
                {cred.username && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-white/40">{cred.username}</span>
                    <button onClick={() => copyToClipboard(cred.username)} className="text-white/20 hover:text-white/50">
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {cred.urlOrHost && <p className="text-xs text-white/25 mt-0.5">{cred.urlOrHost}</p>}
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Reveal/hide password */}
                <button onClick={() => setRevealedId(revealed ? null : cred.id)}
                  className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
                  title={revealed ? 'Ukryj hasło' : 'Pokaż hasło'}>
                  {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                {revealed && (
                  <button onClick={() => copyToClipboard(cred.passwordDecrypted || '***')}
                    className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors" title="Kopiuj hasło">
                    <Copy className="h-4 w-4" />
                  </button>
                )}
                {/* Delete */}
                {deleteId === cred.id ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => deleteMut.mutate(cred.id)}
                      className="px-2 py-1 rounded-lg text-[10px] font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25">Tak</button>
                    <button onClick={() => setDeleteId(null)}
                      className="px-2 py-1 rounded-lg text-[10px] font-medium text-white/30 hover:text-white/50">Nie</button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteId(cred.id)}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors" title="Usuń">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Password reveal row */}
              {revealed && (
                <div className="absolute" style={{ display: 'none' }}>
                  {/* Password is available via copy button */}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add form */}
      {showAdd && <AddCredentialForm onDone={() => { setShowAdd(false); qc.invalidateQueries({ queryKey: ['portal-credentials'] }); }} onCancel={() => setShowAdd(false)} />}
    </div>
  );
}

function AddCredentialForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: '', category: 'OTHER', username: '', password: '', urlOrHost: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name || !form.password) { toast.error('Nazwa i hasło są wymagane'); return; }
    setLoading(true);
    try {
      // clientId is resolved by backend from workspace context
      await credentialsApi.create({ ...form } as any);
      toast.success('Hasło zapisane w sejfie');
      onDone();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Błąd'); }
    setLoading(false);
  };

  return (
    <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(139,92,246,0.15)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white/70">Dodaj hasło do sejfu</h3>
        <button onClick={onCancel} className="text-white/30 hover:text-white/60"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-white/30">Nazwa *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="np. WiFi biuro, Router TP-Link"
              className="w-full px-3 py-2 text-sm rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }} />
          </div>
          <div className="w-36">
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-white/30">Kategoria</label>
            <select value={form.category} onChange={e => set('category', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-white/30">Login / użytkownik</label>
            <input value={form.username} onChange={e => set('username', e.target.value)} placeholder="admin"
              className="w-full px-3 py-2 text-sm rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }} />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-white/30">Hasło *</label>
            <input value={form.password} onChange={e => set('password', e.target.value)} type="password" placeholder="••••••"
              className="w-full px-3 py-2 text-sm rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }} />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-white/30">Adres / host</label>
          <input value={form.urlOrHost} onChange={e => set('urlOrHost', e.target.value)} placeholder="192.168.1.1 lub https://..."
            className="w-full px-3 py-2 text-sm rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }} />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-white/30">Notatka</label>
          <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Opcjonalna notatka..."
            className="w-full px-3 py-2 text-sm rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }} />
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button onClick={submit} disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Zapisz w sejfie
        </button>
      </div>
    </div>
  );
}
