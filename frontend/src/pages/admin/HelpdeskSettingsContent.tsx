import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wrench, Save, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../api/client';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

interface HelpdeskSettings {
  id?: string;
  ticketRoutingMode: string;
  defaultProviderWorkspaceId: string | null;
  allowUserProviderSelection: boolean;
  allowAssistantAutoCreate: boolean;
  allowAlertAutoCreate: boolean;
}

interface ProviderRelation {
  id: string;
  providerWorkspace: { id: string; name: string };
  isDefaultHelpdeskProvider: boolean;
}

const ROUTING_MODES = [
  { id: 'internal_only', label: 'Obsługa wewnętrzna', desc: 'Wszystkie zgłoszenia trafiają do Twojego zespołu' },
  { id: 'send_to_default_provider', label: 'Wyślij do domyślnej firmy IT', desc: 'Zgłoszenia automatycznie trafiają do zewnętrznej firmy IT' },
  { id: 'ask_each_time', label: 'Pytaj przy każdym zgłoszeniu', desc: 'Użytkownik wybiera, kto obsłuży zgłoszenie' },
];

export default function HelpdeskSettingsContent() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['helpdesk-settings'],
    queryFn: () => apiClient.get<HelpdeskSettings>('/api/helpdesk-settings').then(r => r.data),
  });

  const { data: relations } = useQuery({
    queryKey: ['workspace-relations'],
    queryFn: () => apiClient.get<{ asClient: ProviderRelation[]; asProvider: any[] }>('/api/workspace-relations').then(r => r.data.asClient ?? []),
  });

  const [form, setForm] = useState<HelpdeskSettings>({
    ticketRoutingMode: 'internal_only',
    defaultProviderWorkspaceId: null,
    allowUserProviderSelection: false,
    allowAssistantAutoCreate: true,
    allowAlertAutoCreate: true,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        ticketRoutingMode: settings.ticketRoutingMode || 'internal_only',
        defaultProviderWorkspaceId: settings.defaultProviderWorkspaceId || null,
        allowUserProviderSelection: settings.allowUserProviderSelection ?? false,
        allowAssistantAutoCreate: settings.allowAssistantAutoCreate ?? true,
        allowAlertAutoCreate: settings.allowAlertAutoCreate ?? true,
      });
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (data: Partial<HelpdeskSettings>) => apiClient.put('/api/helpdesk-settings', data).then(r => r.data),
    onSuccess: () => { toast.success('Ustawienia zapisane'); queryClient.invalidateQueries({ queryKey: ['helpdesk-settings'] }); },
    onError: (err: any) => { toast.error(err?.response?.data?.error ?? 'Błąd zapisu'); },
  });

  if (isLoading) return <LoadingSpinner />;

  const providers = (relations as ProviderRelation[] | undefined) ?? [];

  return (
    <div>
      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn-primary" onClick={() => mutation.mutate(form)} disabled={mutation.isPending}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Zapisz
        </button>
      </div>

      {/* Routing mode */}
      <div className="page-card" style={{ padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wrench size={16} /> Tryb routingu zgłoszeń
        </h3>
        <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 16px' }}>Zdecyduj, jak system przekierowuje nowe zgłoszenia</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ROUTING_MODES.map(rm => {
            const selected = form.ticketRoutingMode === rm.id;
            return (
              <button key={rm.id} onClick={() => setForm(f => ({ ...f, ticketRoutingMode: rm.id }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                  border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected ? 'var(--accent-g, rgba(109,40,217,0.04))' : 'transparent',
                }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selected && <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)' }} />}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: selected ? 'var(--accent)' : 'var(--t)' }}>{rm.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>{rm.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Default provider */}
      {form.ticketRoutingMode === 'send_to_default_provider' && (
        <div className="page-card" style={{ padding: 24, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', margin: '0 0 12px' }}>Domyślna firma IT</h3>
          {providers.length > 0 ? (
            <select className="input" value={form.defaultProviderWorkspaceId ?? ''} onChange={e => setForm(f => ({ ...f, defaultProviderWorkspaceId: e.target.value || null }))} style={{ minWidth: 300 }}>
              <option value="">— Wybierz firmę IT —</option>
              {providers.map(p => <option key={p.providerWorkspace.id} value={p.providerWorkspace.id}>{p.providerWorkspace.name}</option>)}
            </select>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--tm)' }}>Brak połączonych firm IT. Dodaj relację w zakładce Udostępnianie.</p>
          )}
        </div>
      )}

      {/* Toggles */}
      <div className="page-card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', margin: '0 0 16px' }}>Opcje dodatkowe</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ToggleRow label="Użytkownik może wybrać firmę IT" desc="Pozwól użytkownikom ręcznie wybrać, do której firmy IT trafi zgłoszenie" checked={form.allowUserProviderSelection} onChange={v => setForm(f => ({ ...f, allowUserProviderSelection: v }))} />
          <ToggleRow label="Asystent AI może tworzyć zgłoszenia" desc="AI automatycznie tworzy zgłoszenia na podstawie wykrytych problemów" checked={form.allowAssistantAutoCreate} onChange={v => setForm(f => ({ ...f, allowAssistantAutoCreate: v }))} />
          <ToggleRow label="Alerty agentów tworzą zgłoszenia" desc="Automatyczne tworzenie zgłoszeń gdy agent wykryje problem" checked={form.allowAlertAutoCreate} onChange={v => setForm(f => ({ ...f, allowAlertAutoCreate: v }))} />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>{desc}</div>
      </div>
      <button onClick={() => onChange(!checked)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0, background: checked ? 'var(--accent)' : 'var(--border)', position: 'relative', transition: 'background 0.2s' }}>
        <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: checked ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </button>
    </div>
  );
}
