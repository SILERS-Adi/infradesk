import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CreditCard, Plus, Trash2, Eye, EyeOff, Copy, X, Loader2, Heart, Shield } from 'lucide-react';
import { apiClient } from '../../api/client';

const CATEGORIES = [
  { value: 'STREAMING', label: 'Streaming', examples: 'Netflix, Spotify, Disney+, HBO' },
  { value: 'TELECOM', label: 'Telefon / Internet', examples: 'Orange, Play, T-Mobile, Plus' },
  { value: 'INSURANCE', label: 'Ubezpieczenie', examples: 'PZU, Warta, Allianz' },
  { value: 'SOFTWARE', label: 'Oprogramowanie', examples: 'Office 365, Adobe, Antywirus' },
  { value: 'CLOUD', label: 'Chmura', examples: 'Google One, iCloud, Dropbox' },
  { value: 'HOSTING', label: 'Hosting / Domena', examples: 'OVH, home.pl, nazwa.pl' },
  { value: 'OTHER', label: 'Inne', examples: '' },
];

const CYCLES = [
  { value: 'MONTHLY', label: 'Miesięcznie' },
  { value: 'QUARTERLY', label: 'Kwartalnie' },
  { value: 'YEARLY', label: 'Rocznie' },
  { value: 'ONE_TIME', label: 'Jednorazowo' },
];

const api = {
  list: () => apiClient.get('/subscriptions').then(r => r.data),
  create: (d: any) => apiClient.post('/subscriptions', d).then(r => r.data),
  update: (id: string, d: any) => apiClient.patch(`/subscriptions/${id}`, d).then(r => r.data),
  delete: (id: string) => apiClient.delete(`/subscriptions/${id}`),
  listContacts: () => apiClient.get('/subscriptions/trusted-contacts').then(r => r.data),
  createContact: (d: any) => apiClient.post('/subscriptions/trusted-contacts', d).then(r => r.data),
  deleteContact: (id: string) => apiClient.delete(`/subscriptions/trusted-contacts/${id}`),
};

export function PortalSubscriptionsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'subs' | 'trusted'>('subs');
  const [showAdd, setShowAdd] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [reveal, setReveal] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: subs = [], isLoading } = useQuery({ queryKey: ['subscriptions'], queryFn: api.list });
  const { data: contacts = [] } = useQuery({ queryKey: ['trusted-contacts'], queryFn: api.listContacts });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subscriptions'] }); toast.success('Usunięto'); setDeleteId(null); },
  });

  const deleteContactMut = useMutation({
    mutationFn: (id: string) => api.deleteContact(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trusted-contacts'] }); toast.success('Usunięto'); },
  });

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success('Skopiowano'); };

  const totalMonthly = subs.filter((s: any) => s.isActive && s.amount).reduce((sum: number, s: any) => {
    const amt = s.amount || 0;
    if (s.billingCycle === 'YEARLY') return sum + amt / 12;
    if (s.billingCycle === 'QUARTERLY') return sum + amt / 3;
    return sum + amt;
  }, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,146,60,0.12)' }}>
            <CreditCard className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white/85">Abonamenty i zaufane osoby</h1>
            <p className="text-sm text-white/35">{subs.length} abonamentów · ~{totalMonthly.toFixed(0)} zł/mies</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <button onClick={() => setTab('subs')} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all"
          style={{ background: tab === 'subs' ? 'rgba(251,146,60,0.12)' : 'transparent', color: tab === 'subs' ? '#FB923C' : 'rgba(255,255,255,0.4)' }}>
          <CreditCard className="h-3.5 w-3.5" /> Abonamenty
        </button>
        <button onClick={() => setTab('trusted')} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all"
          style={{ background: tab === 'trusted' ? 'rgba(239,68,68,0.12)' : 'transparent', color: tab === 'trusted' ? '#F87171' : 'rgba(255,255,255,0.4)' }}>
          <Heart className="h-3.5 w-3.5" /> Zaufane osoby
        </button>
      </div>

      {tab === 'subs' && (<>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(145deg, #F97316, #EA580C)', boxShadow: '0 2px 10px rgba(249,115,22,0.2)' }}>
          <Plus className="h-4 w-4" /> Dodaj abonament
        </button>

        {isLoading && <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin text-orange-400 mx-auto" /></div>}

        <div className="space-y-2">
          {subs.map((s: any) => {
            const cat = CATEGORIES.find(c => c.value === s.category);
            return (
              <div key={s.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: 'rgba(251,146,60,0.1)' }}>💳</div>
                    <div>
                      <span className="text-sm font-semibold text-white/80">{s.name}</span>
                      <span className="text-xs text-white/25 ml-2">{cat?.label}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.amount && <span className="text-sm font-bold text-orange-400">{s.amount} zł<span className="text-xs text-white/25 font-normal">/{CYCLES.find(c => c.value === s.billingCycle)?.label || 'mies'}</span></span>}
                    <button onClick={() => setReveal(reveal === s.id ? null : s.id)} className="p-1.5 rounded-lg hover:bg-white/5 text-white/25">
                      {reveal === s.id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    {deleteId === s.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => deleteMut.mutate(s.id)} className="px-2 py-1 text-[10px] bg-red-500/15 text-red-400 rounded-lg">Tak</button>
                        <button onClick={() => setDeleteId(null)} className="px-2 py-1 text-[10px] text-white/30 rounded-lg">Nie</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteId(s.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/15 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </div>
                {reveal === s.id && (
                  <div className="mt-3 pt-3 space-y-1 text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    {s.login && <div className="flex items-center gap-2"><span className="text-white/30 w-16">Login:</span><span className="text-white/60">{s.login}</span><button onClick={() => copy(s.login)} className="text-white/20 hover:text-white/50"><Copy className="h-3 w-3" /></button></div>}
                    {s.passwordEnc && <div className="flex items-center gap-2"><span className="text-white/30 w-16">Hasło:</span><span className="text-white/60">••••••</span><button onClick={() => copy(s.passwordEnc)} className="text-white/20 hover:text-white/50"><Copy className="h-3 w-3" /></button></div>}
                    {s.pin && <div className="flex items-center gap-2"><span className="text-white/30 w-16">PIN:</span><span className="text-white/60">{s.pin}</span><button onClick={() => copy(s.pin)} className="text-white/20 hover:text-white/50"><Copy className="h-3 w-3" /></button></div>}
                    {s.phone && <div><span className="text-white/30 w-16 inline-block">Telefon:</span><span className="text-white/60">{s.phone}</span></div>}
                    {s.url && <div><span className="text-white/30 w-16 inline-block">URL:</span><span className="text-white/60">{s.url}</span></div>}
                    {s.notes && <div className="text-white/25 mt-1">{s.notes}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {showAdd && <AddSubscriptionForm onDone={() => { setShowAdd(false); qc.invalidateQueries({ queryKey: ['subscriptions'] }); }} onCancel={() => setShowAdd(false)} />}
      </>)}

      {tab === 'trusted' && (<>
        <div className="rounded-xl p-5" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-red-400" />
            <span className="text-sm font-semibold text-red-400">Zaufana osoba</span>
          </div>
          <p className="text-xs text-white/40">Osoba, która w razie potrzeby (choroba, wypadek, śmierć) uzyska dostęp do Twoich danych. Dostęp wymaga podania PIN-u.</p>
        </div>

        <button onClick={() => setShowAddContact(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(145deg, #DC2626, #991B1B)', boxShadow: '0 2px 10px rgba(220,38,38,0.2)' }}>
          <Plus className="h-4 w-4" /> Dodaj zaufaną osobę
        </button>

        <div className="space-y-2">
          {contacts.map((c: any) => (
            <div key={c.id} className="rounded-xl p-4 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <span className="text-sm font-semibold text-white/80">{c.firstName} {c.lastName}</span>
                {c.relationship && <span className="text-xs text-white/25 ml-2">({c.relationship})</span>}
                <div className="text-xs text-white/40 mt-1">{c.email}{c.phone ? ` · ${c.phone}` : ''}</div>
                <div className="text-xs text-white/20 mt-0.5">PIN dostępu: <span className="font-mono text-white/40">{c.accessPin}</span></div>
              </div>
              <button onClick={() => { if (confirm('Usunąć zaufaną osobę?')) deleteContactMut.mutate(c.id); }}
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/15 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        {showAddContact && <AddContactForm onDone={() => { setShowAddContact(false); qc.invalidateQueries({ queryKey: ['trusted-contacts'] }); }} onCancel={() => setShowAddContact(false)} />}
      </>)}
    </div>
  );
}

function AddSubscriptionForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ name: '', category: 'STREAMING', amount: '', billingCycle: 'MONTHLY', login: '', passwordEnc: '', pin: '', phone: '', url: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const s = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.name) { toast.error('Wpisz nazwę'); return; }
    setLoading(true);
    try {
      await api.create({ ...f, amount: f.amount ? Number(f.amount) : null, passwordEnc: f.passwordEnc || undefined, pin: f.pin || undefined });
      toast.success('Abonament dodany'); onDone();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Błąd'); }
    setLoading(false);
  };

  return (
    <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(251,146,60,0.15)' }}>
      <div className="flex justify-between mb-4"><span className="text-sm font-semibold text-white/70">Nowy abonament</span><button onClick={onCancel} className="text-white/30"><X className="h-4 w-4" /></button></div>
      <div className="space-y-3">
        <div className="flex gap-3">
          <F label="Nazwa *" value={f.name} onChange={v => s('name', v)} placeholder="Netflix, Orange, PZU..." />
          <div className="w-40"><label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-white/30">Kategoria</label>
            <select value={f.category} onChange={e => s('category', e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select></div>
        </div>
        <div className="flex gap-3">
          <F label="Kwota (zł)" value={f.amount} onChange={v => s('amount', v)} type="number" placeholder="49.99" />
          <div className="w-40"><label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-white/30">Cykl</label>
            <select value={f.billingCycle} onChange={e => s('billingCycle', e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}>
              {CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select></div>
        </div>
        <div className="flex gap-3">
          <F label="Login" value={f.login} onChange={v => s('login', v)} />
          <F label="Hasło" value={f.passwordEnc} onChange={v => s('passwordEnc', v)} type="password" />
        </div>
        <div className="flex gap-3">
          <F label="PIN" value={f.pin} onChange={v => s('pin', v)} />
          <F label="Telefon" value={f.phone} onChange={v => s('phone', v)} />
        </div>
        <F label="URL / Strona" value={f.url} onChange={v => s('url', v)} />
        <F label="Notatka" value={f.notes} onChange={v => s('notes', v)} />
      </div>
      <div className="flex justify-end mt-4">
        <button onClick={submit} disabled={loading} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(145deg, #F97316, #EA580C)' }}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Dodaj
        </button>
      </div>
    </div>
  );
}

function AddContactForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', relationship: '', accessPin: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const s = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.firstName || !f.lastName || !f.email || !f.accessPin) { toast.error('Uzupełnij imię, nazwisko, email i PIN'); return; }
    setLoading(true);
    try {
      await api.createContact(f);
      toast.success('Zaufana osoba dodana'); onDone();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Błąd'); }
    setLoading(false);
  };

  return (
    <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(239,68,68,0.15)' }}>
      <div className="flex justify-between mb-4"><span className="text-sm font-semibold text-white/70">Nowa zaufana osoba</span><button onClick={onCancel} className="text-white/30"><X className="h-4 w-4" /></button></div>
      <div className="space-y-3">
        <div className="flex gap-3"><F label="Imię *" value={f.firstName} onChange={v => s('firstName', v)} /><F label="Nazwisko *" value={f.lastName} onChange={v => s('lastName', v)} /></div>
        <div className="flex gap-3"><F label="Email *" value={f.email} onChange={v => s('email', v)} type="email" /><F label="Telefon" value={f.phone} onChange={v => s('phone', v)} /></div>
        <div className="flex gap-3"><F label="Relacja" value={f.relationship} onChange={v => s('relationship', v)} placeholder="Żona, syn, brat..." /><F label="PIN dostępu *" value={f.accessPin} onChange={v => s('accessPin', v)} placeholder="4-8 cyfr" /></div>
        <F label="Notatka" value={f.notes} onChange={v => s('notes', v)} />
      </div>
      <div className="flex justify-end mt-4">
        <button onClick={submit} disabled={loading} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(145deg, #DC2626, #991B1B)' }}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />} Dodaj
        </button>
      </div>
    </div>
  );
}

function F({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="flex-1">
      <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-white/30">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-xl focus:outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }} />
    </div>
  );
}
