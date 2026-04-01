import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Building2, Plus, Users, Monitor, Loader2, Settings2, X, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { apiClient } from '../../api/client';

const ALL_MODULES = [
  { key: 'tickets', label: 'Zgłoszenia' },
  { key: 'tasks', label: 'Zadania' },
  { key: 'calendar', label: 'Kalendarz' },
  { key: 'orders', label: 'Zamówienia' },
  { key: 'delegations', label: 'Delegacje' },
  { key: 'crm', label: 'CRM' },
  { key: 'sessions', label: 'Sesje pracy' },
  { key: 'billing', label: 'Rozliczenia' },
  { key: 'backup', label: 'Kopie zapasowe' },
  { key: 'security_audit', label: 'Audyt bezpieczeństwa' },
  { key: 'network_scan', label: 'Skan sieci' },
  { key: 'partners', label: 'Partnerzy' },
  { key: 'monitoring', label: 'Monitoring' },
  { key: 'rustdesk', label: 'RustDesk' },
  { key: 'ai', label: 'AI' },
];

const childApi = {
  list: () => apiClient.get('/tenant/children').then(r => r.data),
  create: (data: any) => apiClient.post('/tenant/children', data).then(r => r.data),
  updateModules: (childId: string, enabledModules: string[]) =>
    apiClient.patch(`/tenant/children/${childId}/modules`, { enabledModules }).then(r => r.data),
};

export default function ChildTenantsPage() {
  const qc = useQueryClient();
  const { data: children = [], isLoading } = useQuery({ queryKey: ['child-tenants'], queryFn: childApi.list });
  const [showCreate, setShowCreate] = useState(false);
  const [editModules, setEditModules] = useState<any>(null);

  if (isLoading) return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white/85">Klienci (podmioty)</h1>
          <p className="text-sm text-white/35">{children.length} kont zarządzanych</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.97]"
          style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)', boxShadow: '0 2px 10px rgba(79,140,255,0.2)' }}>
          <Plus className="h-4 w-4" /> Nowy podmiot
        </button>
      </div>

      {children.length === 0 && !showCreate && (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <Building2 className="h-10 w-10 mx-auto mb-3 text-white/15" />
          <p className="text-white/50 font-medium">Brak podmiotów</p>
          <p className="text-sm text-white/25 mt-1">Utwórz pierwsze konto klienta</p>
        </div>
      )}

      {/* Cards */}
      <div className="space-y-3">
        {children.map((c: any) => {
          const modules = (c.enabledModules as string[]) || [];
          return (
            <div key={c.id} className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm" style={{ background: 'rgba(59,130,246,0.12)', color: '#60A5FA' }}>
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white/85">{c.name}</h3>
                    <p className="text-xs text-white/30">{c.slug}.infradesk.pl · {c.ownerEmail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-4 text-xs text-white/35">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{c._count?.users}</span>
                    <span className="flex items-center gap-1"><Monitor className="h-3 w-3" />{c._count?.agents}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    {c.isActive ? 'Aktywny' : 'Wyłączony'}
                  </span>
                  <button onClick={() => setEditModules(editModules?.id === c.id ? null : c)}
                    className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors" title="Zarządzaj modułami">
                    <Settings2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Modules quick view */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {ALL_MODULES.map(m => {
                  const on = modules.includes(m.key);
                  return (
                    <span key={m.key} className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: on ? 'rgba(139,92,246,0.08)' : 'var(--bg-card)', color: on ? '#A78BFA' : 'var(--td)' }}>
                      {m.label}
                    </span>
                  );
                })}
              </div>

              {/* Module editor */}
              {editModules?.id === c.id && (
                <ModuleEditor
                  current={modules}
                  onSave={async (newModules) => {
                    try {
                      await childApi.updateModules(c.id, newModules);
                      toast.success('Moduły zaktualizowane');
                      qc.invalidateQueries({ queryKey: ['child-tenants'] });
                    } catch { toast.error('Błąd'); }
                    setEditModules(null);
                  }}
                  onCancel={() => setEditModules(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateChildForm
          onCreated={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['child-tenants'] }); }}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

/* ── Module Editor ──────────────────────────────────────────────────── */
function ModuleEditor({ current, onSave, onCancel }: { current: string[]; onSave: (m: string[]) => void; onCancel: () => void }) {
  const [modules, setModules] = useState<string[]>([...current]);

  const toggle = (key: string) => {
    setModules(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  return (
    <div className="mt-4 p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-white/50">Dostępne moduły</span>
        <div className="flex gap-2">
          <button onClick={() => setModules(ALL_MODULES.map(m => m.key))} className="text-[10px] text-violet-400 hover:text-violet-300">Wszystkie</button>
          <button onClick={() => setModules([])} className="text-[10px] text-white/30 hover:text-white/50">Żadne</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {ALL_MODULES.map(m => {
          const on = modules.includes(m.key);
          return (
            <button key={m.key} onClick={() => toggle(m.key)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: on ? 'rgba(139,92,246,0.1)' : 'var(--bg-card)',
                border: on ? '1px solid rgba(139,92,246,0.25)' : '1px solid var(--border)',
                color: on ? '#A78BFA' : 'var(--tm)',
              }}>
              {on ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {m.label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 mt-3 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-white/40 hover:text-white/60">Anuluj</button>
        <button onClick={() => onSave(modules)} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>Zapisz</button>
      </div>
    </div>
  );
}

/* ── Create form ────────────────────────────────────────────────────── */
function CreateChildForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: '', slug: '', ownerEmail: '', ownerFirstName: '', ownerLastName: '', ownerPassword: '' });
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name || !form.slug || !form.ownerEmail || !form.ownerFirstName || !form.ownerLastName || !form.ownerPassword) {
      toast.error('Uzupełnij wszystkie pola'); return;
    }
    setLoading(true);
    try {
      const res = await childApi.create(form);
      toast.success(`Podmiot "${res.name}" utworzony`);
      onCreated();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Błąd'); }
    setLoading(false);
  };

  return (
    <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid rgba(139,92,246,0.15)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white/70">Nowy podmiot</h3>
        <button onClick={onCancel} className="text-white/30 hover:text-white/60"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3">
        <div className="flex gap-3">
          <F label="Nazwa firmy" value={form.name} onChange={v => set('name', v)} />
          <div className="flex-1">
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-white/30">Subdomena</label>
            <div className="flex">
              <input value={form.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="flex-1 px-3 py-2 text-sm rounded-l-xl" placeholder="firma"
                style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} />
              <span className="px-2 py-2 text-xs text-white/30 rounded-r-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>.infradesk.pl</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <F label="Imię admina" value={form.ownerFirstName} onChange={v => set('ownerFirstName', v)} />
          <F label="Nazwisko" value={form.ownerLastName} onChange={v => set('ownerLastName', v)} />
        </div>
        <div className="flex gap-3">
          <F label="Email admina" value={form.ownerEmail} onChange={v => set('ownerEmail', v)} type="email" />
          <F label="Hasło" value={form.ownerPassword} onChange={v => set('ownerPassword', v)} type="password" />
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button onClick={submit} disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Utwórz podmiot
        </button>
      </div>
    </div>
  );
}

function F({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="flex-1">
      <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-white/30">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-xl focus:outline-none"
        style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }} />
    </div>
  );
}
