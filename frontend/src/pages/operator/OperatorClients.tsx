import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Monitor, Ticket, Plus, X, Loader2, AlertTriangle, Link2, Send, Receipt, Pencil, Save, Search } from 'lucide-react';
import ClientBillingModal from './ClientBillingModal';
import toast from 'react-hot-toast';
import { operatorApi, operatorClientApi, type CreateClientPayload } from '../../api/operator';
import { apiClient } from '../../api/client';
import { usersApi } from '../../api/users';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import type { OperatorClient } from '../../api/operator';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:   { label: 'Robocza',    color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' },
  invited: { label: 'Zaproszona', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  active:  { label: 'Aktywna',    color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
};

export default function OperatorClients() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [billingClient, setBillingClient] = useState<{ relationId: string; name: string } | null>(null);
  const [editClient, setEditClient] = useState<OperatorClient | null>(null);

  const { data: clients, isLoading, isError } = useQuery({
    queryKey: ['operator', 'clients'],
    queryFn: operatorApi.getClients,
  });

  const activateMut = useMutation({
    mutationFn: (clientWsId: string) => operatorClientApi.activate(clientWsId),
    onSuccess: () => { toast.success('Portal aktywowany'); queryClient.invalidateQueries({ queryKey: ['operator'] }); },
    onError: () => toast.error('Błąd aktywacji'),
  });

  const columns: Column<OperatorClient>[] = [
    { key: 'name', header: 'Firma', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Building2 size={16} color="#fff" />
        </div>
        <div>
          <span style={{ fontWeight: 600, color: 'var(--t)' }}>{r.name}</span>
          {r.city && <div style={{ fontSize: 11, color: 'var(--td)' }}>{r.city}</div>}
        </div>
      </div>
    )},
    { key: 'taxId', header: 'NIP', render: (r) => (
      r.taxId ? <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--ts)' }}>{r.taxId}</span> : <span style={{ color: 'var(--td)' }}>—</span>
    )},
    { key: 'status', header: 'Status', render: (r) => {
      const sc = STATUS_CONFIG[r.clientStatus] ?? STATUS_CONFIG.active;
      return <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: sc.bg, color: sc.color }}>{sc.label}</span>;
    }},
    { key: 'ticketCount', header: 'Zgłoszenia', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Ticket size={14} color="var(--tm)" />
        <span>{r.ticketCount}</span>
        {r.activeTickets > 0 && <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>({r.activeTickets})</span>}
      </div>
    )},
    { key: 'deviceCount', header: 'Urządzenia', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Monitor size={14} color="var(--tm)" /> {r.deviceCount}
      </div>
    )},
    { key: 'email', header: 'Kontakt', render: (r) => (
      <div style={{ fontSize: 12 }}>
        {r.email && <div>{r.email}</div>}
        {r.phone && <div style={{ color: 'var(--td)' }}>{r.phone}</div>}
      </div>
    )},
    { key: 'actions', header: '', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={(e) => { e.stopPropagation(); setEditClient(r); }}
          title="Edytuj firmę"
          style={{ fontSize: 11, fontWeight: 600, color: 'var(--tm)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setBillingClient({ relationId: r.relationId, name: r.name }); }}
          style={{ fontSize: 11, fontWeight: 600, color: '#818CF8', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
        >
          <Receipt size={12} /> Rozliczenia
        </button>
        {r.clientStatus === 'draft' && (
          <button
            onClick={(e) => { e.stopPropagation(); activateMut.mutate(r.id); }}
            disabled={activateMut.isPending}
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
          >
            <Send size={12} /> Wyślij dostęp
          </button>
        )}
      </div>
    )},
  ];

  if (isLoading) return <LoadingSpinner />;

  if (isError) {
    return (
      <div style={{ padding: '0 0 40px' }}>
        <PageHeader title="Klienci" subtitle="Firmy obsługiwane przez Twoje Centrum IT" />
        <div className="page-card" style={{ padding: 32, textAlign: 'center' }}>
          <AlertTriangle size={32} color="#EF4444" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: 'var(--t)', fontWeight: 600 }}>Nie udało się załadować klientów</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader
        title="Klienci"
        subtitle="Firmy obsługiwane przez Twoje Centrum IT"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={() => setShowLink(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Link2 size={16} /> Podepnij firmę
            </button>
            <button className="btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={16} /> Dodaj firmę klienta
            </button>
          </div>
        }
      />

      {showLink && (
        <LinkExistingForm onClose={() => setShowLink(false)} onSuccess={() => { setShowLink(false); queryClient.invalidateQueries({ queryKey: ['operator'] }); }} />
      )}

      {showForm && (
        <AddClientForm onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); queryClient.invalidateQueries({ queryKey: ['operator'] }); }} />
      )}

      <DataTable
        columns={columns}
        data={clients ?? []}
        loading={false}
        keyExtractor={(r) => r.id}
        emptyTitle="Brak klientów"
        emptyDescription="Dodaj pierwszego klienta, aby rozpocząć obsługę"
        emptyAction={
          <button className="btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Dodaj firmę klienta
          </button>
        }
      />

      {billingClient && (
        <ClientBillingModal
          open={!!billingClient}
          onClose={() => setBillingClient(null)}
          relationId={billingClient.relationId}
          clientName={billingClient.name}
        />
      )}

      {editClient && (
        <EditClientModal
          client={editClient}
          onClose={() => setEditClient(null)}
          onSuccess={() => { setEditClient(null); queryClient.invalidateQueries({ queryKey: ['operator'] }); }}
        />
      )}
    </div>
  );
}

// ── Edit Client Modal ──
function EditClientModal({ client, onClose, onSuccess }: { client: OperatorClient; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(client.name);
  const [legalName, setLegalName] = useState((client as any).legalName || '');
  const [taxId, setTaxId] = useState(client.taxId || '');
  const [email, setEmail] = useState(client.email || '');
  const [phone, setPhone] = useState(client.phone || '');
  const [city, setCity] = useState(client.city || '');
  const [saving, setSaving] = useState(false);
  const [gusLoading, setGusLoading] = useState(false);

  async function lookupGus() {
    const cleanNip = taxId.replace(/[-\s]/g, '');
    if (!/^\d{10}$/.test(cleanNip)) { toast.error('Wpisz poprawny NIP'); return; }
    setGusLoading(true);
    try {
      const { data } = await apiClient.get(`/invoicing/contractors/nip-lookup/${cleanNip}`);
      if (data.name) setLegalName(data.name);
      if (data.city) setCity(data.city);
      toast.success('Pobrano z GUS');
    } catch { toast.error('Nie udało się pobrać'); }
    finally { setGusLoading(false); }
  }

  async function save() {
    setSaving(true);
    try {
      await apiClient.put(`/workspaces/${client.id}`, {
        name: name.trim(), legalName: legalName.trim() || undefined,
        taxId: taxId.trim() || undefined, email: email.trim() || undefined,
        phone: phone.trim() || undefined, city: city.trim() || undefined,
      });
      toast.success('Zapisano');
      onSuccess();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Błąd zapisu');
    } finally { setSaving(false); }
  }

  return (
    <div onClick={() => !saving && onClose()} style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card, #0F1628)', border: '1px solid var(--border)', borderRadius: 14,
        width: '100%', maxWidth: 560, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>Edytuj firmę klienta</div>
              <div style={{ fontSize: 11, color: 'var(--tm)' }}>{client.name}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--td)', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        {/* NIP + GUS */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <Input label="NIP" placeholder="np. 1234567890" value={taxId} onChange={e => setTaxId(e.target.value)} />
          </div>
          <button onClick={lookupGus} disabled={gusLoading || taxId.replace(/[-\s]/g, '').length < 10}
            style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--cta)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: gusLoading || taxId.replace(/[-\s]/g, '').length < 10 ? 0.5 : 1 }}>
            {gusLoading ? <Loader2 size={12} className="spinning" /> : <Search size={12} />}
            {gusLoading ? 'Szukam' : 'GUS'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <Input label="Nazwa krótka" placeholder="np. PKS Garwolin" value={name} onChange={e => setName(e.target.value)} />
          <Input label="Pełna nazwa (prawna)" placeholder="np. PKS Garwolin Sp. z o.o." value={legalName} onChange={e => setLegalName(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <Input label="Email" placeholder="biuro@firma.pl" value={email} onChange={e => setEmail(e.target.value)} />
          <Input label="Telefon" placeholder="+48 500 000 000" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <Input label="Miasto" placeholder="np. Garwolin" value={city} onChange={e => setCity(e.target.value)} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ts)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Anuluj</button>
          <button onClick={save} disabled={saving} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--cta)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(99,102,241,0.2)' }}>
            {saving ? <Loader2 size={12} className="spinning" /> : <Save size={12} />}
            {saving ? 'Zapisuję...' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Client Form ──────────────────────────────────────────

function AddClientForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<CreateClientPayload>({
    name: '', legalName: '', taxId: '', email: '', phone: '', contactPerson: '', city: '',
    locationName: '', activatePortal: false,
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll(),
  });

  const mutation = useMutation({
    mutationFn: operatorApi.createClient,
    onSuccess: () => { toast.success('Klient dodany — od razu widoczny na liście'); onSuccess(); },
    onError: (err: any) => { toast.error(err?.response?.data?.error ?? 'Błąd przy dodawaniu klienta'); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Nazwa firmy jest wymagana'); return; }
    mutation.mutate(form);
  };

  const set = <K extends keyof CreateClientPayload>(key: K, value: CreateClientPayload[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const userOptions = [
    { value: '', label: '— Brak —' },
    ...((users ?? []) as any[]).map(u => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
  ];

  return (
    <div className="page-card" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', margin: 0 }}>Dodaj firmę klienta</h3>
          <p style={{ fontSize: 12, color: 'var(--tm)', margin: '4px 0 0' }}>
            Utwórz nową firmę obsługiwaną przez Twoje Centrum IT
          </p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4 }}><X size={18} /></button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Left — dane firmy */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Dane firmy
            </div>
            <Input label="Nazwa firmy *" placeholder="np. Acme Sp. z o.o." value={form.name ?? ''} onChange={e => set('name', e.target.value)} />
            <Input label="NIP" placeholder="123-456-78-90" value={form.taxId ?? ''} onChange={e => set('taxId', e.target.value)} />
            <Input label="Miasto" placeholder="Warszawa" value={form.city ?? ''} onChange={e => set('city', e.target.value)} />
            <Input label="Lokalizacja główna" placeholder="np. Biuro Warszawa" value={form.locationName ?? ''} onChange={e => set('locationName', e.target.value)} />
          </div>

          {/* Right — kontakt + portal */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Kontakt i opiekun
            </div>
            <Input label="Osoba kontaktowa" placeholder="Jan Kowalski" value={form.contactPerson ?? ''} onChange={e => set('contactPerson', e.target.value)} />
            <Input label="Email kontaktowy" type="email" placeholder="kontakt@firma.pl" value={form.email ?? ''} onChange={e => set('email', e.target.value)} />
            <Input label="Telefon" type="tel" placeholder="+48 123 456 789" value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} />
            <Select
              label="Opiekun po stronie MSP"
              options={userOptions}
              value={form.assignedUserId ?? ''}
              onChange={e => set('assignedUserId', e.target.value || undefined)}
            />
          </div>
        </div>

        {/* Portal toggle */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, padding: '12px 16px', borderRadius: 12,
          border: '1px solid var(--border)', background: 'var(--hover-bg)', cursor: 'pointer', fontSize: 13, color: 'var(--t)',
        }}>
          <input type="checkbox" checked={form.activatePortal ?? false}
            onChange={e => set('activatePortal', e.target.checked)}
            style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
          <span><strong>Aktywuj portal klienta</strong> — wyślij e-mail z dostępem od razu po utworzeniu</span>
        </label>

        {!form.activatePortal && (
          <div style={{ padding: '10px 14px', borderRadius: 10, marginTop: 12, background: 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.12)', fontSize: 12, color: 'var(--tm)' }}>
            Klient zostanie utworzony w statusie <strong style={{ color: 'var(--t)' }}>Robocza</strong> — możesz wysłać dostęp do portalu później.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <Button variant="secondary" type="button" onClick={onClose}>Anuluj</Button>
          <Button type="submit" loading={mutation.isPending}>
            <Plus size={16} style={{ marginRight: 6 }} /> Dodaj firmę klienta
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Link Existing ────────────────────────────────────────────

function LinkExistingForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { data: available, isLoading } = useQuery({
    queryKey: ['operator', 'clients', 'available'],
    queryFn: () => apiClient.get<any[]>('/operator/clients/available').then(r => r.data),
  });

  const linkMutation = useMutation({
    mutationFn: (clientWorkspaceId: string) =>
      apiClient.post('/operator/clients/link', { clientWorkspaceId }).then(r => r.data),
    onSuccess: (_, wsId) => {
      const name = available?.find((w: any) => w.id === wsId)?.name ?? 'Firma';
      toast.success(`${name} podpięta jako klient`);
      onSuccess();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Błąd podpinania'),
  });

  return (
    <div className="page-card" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', margin: 0 }}>Podepnij istniejącą firmę</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4 }}><X size={18} /></button>
      </div>

      {isLoading ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>Ładowanie...</div>
      ) : !available || available.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>Wszystkie firmy są już podpięte.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {available.map((ws: any) => (
            <div key={ws.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{ws.name}</div>
                <div style={{ fontSize: 11, color: 'var(--td)' }}>{[ws.city, ws.taxId, ws.email].filter(Boolean).join(' · ') || ws.slug}</div>
              </div>
              <button className="btn-primary" onClick={() => linkMutation.mutate(ws.id)} disabled={linkMutation.isPending}
                style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 4 }}>
                {linkMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Podepnij
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
