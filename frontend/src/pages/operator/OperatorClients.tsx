import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Monitor, Ticket, Plus, X, Loader2, AlertTriangle, Link2, Send, Circle, Receipt } from 'lucide-react';
import ClientBillingModal from './ClientBillingModal';
import toast from 'react-hot-toast';
import { operatorApi, operatorClientApi, type CreateClientPayload } from '../../api/operator';
import { apiClient } from '../../api/client';
import { usersApi } from '../../api/users';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
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

  const field = (label: string, key: keyof CreateClientPayload, type = 'text', required = false) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tm)' }}>
        {label} {required && <span style={{ color: '#EF4444' }}>*</span>}
      </label>
      <input className="input" type={type} value={(form[key] as string) ?? ''} onChange={(e) => setForm(prev => ({ ...prev, [key]: e.target.value }))} required={required} />
    </div>
  );

  return (
    <div className="page-card" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', margin: 0 }}>Dodaj firmę klienta</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4 }}><X size={18} /></button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 16 }}>
          {field('Nazwa firmy', 'name', 'text', true)}
          {field('NIP', 'taxId')}
          {field('Email kontaktowy', 'email', 'email')}
          {field('Telefon', 'phone', 'tel')}
          {field('Osoba kontaktowa', 'contactPerson')}
          {field('Miasto', 'city')}
          {field('Lokalizacja główna', 'locationName')}
        </div>

        {/* Opiekun MSP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tm)' }}>Opiekun po stronie MSP</label>
            <select className="input" value={form.assignedUserId ?? ''} onChange={e => setForm(prev => ({ ...prev, assignedUserId: e.target.value || undefined }))}>
              <option value="">— Brak —</option>
              {(users ?? []).map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>

          {/* Aktywuj portal */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tm)' }}>Portal klienta</label>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10,
              border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, color: 'var(--t)',
            }}>
              <input type="checkbox" checked={form.activatePortal ?? false} onChange={e => setForm(prev => ({ ...prev, activatePortal: e.target.checked }))}
                style={{ accentColor: 'var(--accent)' }} />
              Wyślij dostęp po utworzeniu
            </label>
          </div>
        </div>

        {!form.activatePortal && (
          <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, background: 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.12)', fontSize: 12, color: 'var(--tm)' }}>
            Klient zostanie utworzony w statusie <strong style={{ color: 'var(--t)' }}>Robocza</strong> — możesz wysłać dostęp do portalu później.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Anuluj</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Dodaj firmę klienta
          </button>
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
