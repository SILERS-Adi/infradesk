import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Monitor, Ticket, Plus, X, Loader2, AlertTriangle, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { operatorApi, type CreateClientPayload } from '../../api/operator';
import { apiClient } from '../../api/client';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { OperatorClient } from '../../api/operator';

export default function OperatorClients() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showLink, setShowLink] = useState(false);

  const { data: clients, isLoading, isError } = useQuery({
    queryKey: ['operator', 'clients'],
    queryFn: operatorApi.getClients,
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
    { key: 'taxId', header: 'NIP', render: (r) => r.taxId || '—' },
  ];

  if (isLoading) return <LoadingSpinner />;

  if (isError) {
    return (
      <div style={{ padding: '0 0 40px' }}>
        <PageHeader title="Klienci" subtitle="Firmy obsługiwane przez Twoje Centrum IT" />
        <div className="page-card" style={{ padding: 32, textAlign: 'center' }}>
          <AlertTriangle size={32} color="#EF4444" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: 'var(--t)', fontWeight: 600 }}>Nie udało się załadować klientów</p>
          <p style={{ fontSize: 12, color: 'var(--tm)' }}>Sprawdź czy Twój workspace jest skonfigurowany jako Centrum Obsługi IT</p>
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
              <Plus size={16} /> Nowy klient
            </button>
          </div>
        }
      />

      {showLink && (
        <LinkExistingForm
          onClose={() => setShowLink(false)}
          onSuccess={() => {
            setShowLink(false);
            queryClient.invalidateQueries({ queryKey: ['operator'] });
          }}
        />
      )}

      {showForm && (
        <AddClientForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['operator'] });
          }}
        />
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
            <Plus size={16} /> Dodaj klienta
          </button>
        }
      />
    </div>
  );
}

function AddClientForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<CreateClientPayload>({
    name: '', legalName: '', taxId: '', email: '', phone: '', contactPerson: '', city: '',
  });

  const mutation = useMutation({
    mutationFn: operatorApi.createClient,
    onSuccess: () => { toast.success('Klient dodany pomyślnie'); onSuccess(); },
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
      <input className="input" type={type} value={form[key] ?? ''} onChange={(e) => setForm(prev => ({ ...prev, [key]: e.target.value }))} required={required} />
    </div>
  );

  return (
    <div className="page-card" style={{ padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', margin: 0 }}>Nowy klient</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4 }}><X size={18} /></button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 20 }}>
          {field('Nazwa firmy', 'name', 'text', true)}
          {field('Nazwa prawna', 'legalName')}
          {field('NIP', 'taxId')}
          {field('Email', 'email', 'email')}
          {field('Telefon', 'phone', 'tel')}
          {field('Osoba kontaktowa', 'contactPerson')}
          {field('Miasto', 'city')}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Anuluj</button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Dodaj klienta
          </button>
        </div>
      </form>
    </div>
  );
}

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
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>
          Wszystkie firmy w systemie są już podpięte jako Twoi klienci.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 8px' }}>
            Wybierz firmę, którą chcesz obsługiwać. Zostanie podpięta jako Twój klient z pełnymi uprawnieniami.
          </p>
          {available.map((ws: any) => (
            <div key={ws.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{ws.name}</div>
                <div style={{ fontSize: 11, color: 'var(--td)' }}>
                  {[ws.city, ws.taxId, ws.email].filter(Boolean).join(' · ') || ws.slug}
                </div>
              </div>
              <button
                className="btn-primary"
                onClick={() => linkMutation.mutate(ws.id)}
                disabled={linkMutation.isPending}
                style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {linkMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                Podepnij
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
