import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2 } from 'lucide-react';
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

type RoutingMode = 'internal_only' | 'send_to_default_provider' | 'ask_each_time';

const MODES: { id: RoutingMode; label: string; short: string }[] = [
  { id: 'internal_only',            label: 'Wewnętrzna',   short: 'Zgłoszenia trafiają do Twojego zespołu' },
  { id: 'send_to_default_provider', label: 'Zewnętrzna',   short: 'Automatycznie do firmy IT' },
  { id: 'ask_each_time',            label: 'Ręczny wybór', short: 'Użytkownik decyduje przy każdym zgłoszeniu' },
];

// ── Routing Preview (hero diagram) ────────────────────────────

function RoutingPreview({ mode }: { mode: RoutingMode }) {
  return (
    <div style={{
      height: 260, borderRadius: 16, overflow: 'hidden', marginBottom: 24, position: 'relative',
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)',
    }}>
      {/* Glass overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 30% 20%, rgba(139,92,246,0.15), transparent 60%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 80% 80%, rgba(99,102,241,0.1), transparent 50%)' }} />

      {/* Diagram */}
      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ opacity: 1, transition: 'opacity 0.25s ease' }} key={mode}>
          {mode === 'internal_only' && <InternalDiagram />}
          {mode === 'send_to_default_provider' && <ExternalDiagram />}
          {mode === 'ask_each_time' && <ManualDiagram />}
        </div>
      </div>

      {/* Mode label */}
      <div style={{
        position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center',
        fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        {MODES.find(m => m.id === mode)?.short}
      </div>
    </div>
  );
}

const nodeStyle = (accent = false): React.CSSProperties => ({
  padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
  background: accent ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.08)',
  border: `1px solid ${accent ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.12)'}`,
  color: accent ? '#c4b5fd' : 'rgba(255,255,255,0.85)',
  backdropFilter: 'blur(8px)',
});

const arrowColor = 'rgba(167,139,250,0.6)';

function Arrow({ horizontal = true }: { horizontal?: boolean }) {
  if (horizontal) {
    return (
      <svg width="64" height="24" viewBox="0 0 64 24" fill="none" style={{ flexShrink: 0 }}>
        <line x1="0" y1="12" x2="52" y2="12" stroke={arrowColor} strokeWidth="2" strokeDasharray="4 3">
          <animate attributeName="stroke-dashoffset" from="7" to="0" dur="1s" repeatCount="indefinite" />
        </line>
        <polygon points="52,6 64,12 52,18" fill={arrowColor} />
      </svg>
    );
  }
  return (
    <svg width="24" height="40" viewBox="0 0 24 40" fill="none" style={{ flexShrink: 0 }}>
      <line x1="12" y1="0" x2="12" y2="28" stroke={arrowColor} strokeWidth="2" strokeDasharray="4 3">
        <animate attributeName="stroke-dashoffset" from="7" to="0" dur="1s" repeatCount="indefinite" />
      </line>
      <polygon points="6,28 12,40 18,28" fill={arrowColor} />
    </svg>
  );
}

function DiagArrow({ angle }: { angle: number }) {
  const len = 56;
  const rad = (angle * Math.PI) / 180;
  const x2 = 12 + Math.cos(rad) * len;
  const y2 = 4 + Math.sin(rad) * len;
  return (
    <svg width="80" height="60" viewBox="0 0 80 60" fill="none" style={{ flexShrink: 0 }}>
      <line x1="12" y1="4" x2={x2 - Math.cos(rad) * 10} y2={y2 - Math.sin(rad) * 10} stroke={arrowColor} strokeWidth="2" strokeDasharray="4 3">
        <animate attributeName="stroke-dashoffset" from="7" to="0" dur="1s" repeatCount="indefinite" />
      </line>
      <circle cx={x2} cy={y2} r="4" fill={arrowColor} />
    </svg>
  );
}

function InternalDiagram() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <div style={nodeStyle()}>👤 Użytkownik</div>
      <Arrow />
      <div style={nodeStyle(true)}>🛡️ Wewnętrzny IT</div>
    </div>
  );
}

function ExternalDiagram() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <div style={nodeStyle()}>👤 Użytkownik</div>
      <Arrow />
      <div style={nodeStyle()}>⚙️ System</div>
      <Arrow />
      <div style={nodeStyle(true)}>🏢 Partner IT</div>
    </div>
  );
}

function ManualDiagram() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={nodeStyle()}>👤 Użytkownik</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32, marginTop: -4 }}>
        <DiagArrow angle={135} />
        <DiagArrow angle={45} />
      </div>
      <div style={{ display: 'flex', gap: 32, marginTop: -12 }}>
        <div style={nodeStyle(true)}>🛡️ Wewnętrzny IT</div>
        <div style={nodeStyle(true)}>🏢 Partner IT</div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function HelpdeskSettingsContent() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['helpdesk-settings'],
    queryFn: () => apiClient.get<HelpdeskSettings>('/helpdesk-settings').then(r => r.data),
  });

  const { data: relations } = useQuery({
    queryKey: ['workspace-relations'],
    queryFn: () => apiClient.get<{ asClient: ProviderRelation[]; asProvider: any[] }>('/workspace-relations').then(r => r.data.asClient ?? []),
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
    mutationFn: (data: Partial<HelpdeskSettings>) => apiClient.put('/helpdesk-settings', data).then(r => r.data),
    onSuccess: () => { toast.success('Ustawienia zapisane'); queryClient.invalidateQueries({ queryKey: ['helpdesk-settings'] }); },
    onError: (err: any) => { toast.error(err?.response?.data?.error ?? 'Błąd zapisu'); },
  });

  if (isLoading) return <LoadingSpinner />;

  const providers = (relations as ProviderRelation[] | undefined) ?? [];
  const mode = form.ticketRoutingMode as RoutingMode;

  return (
    <div>
      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button className="btn-primary" onClick={() => mutation.mutate(form)} disabled={mutation.isPending}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Zapisz
        </button>
      </div>

      {/* Hero diagram */}
      <RoutingPreview mode={mode} />

      {/* Segmented control */}
      <div style={{
        display: 'flex', gap: 2, padding: 3, borderRadius: 12, marginBottom: 24,
        background: 'var(--hover-bg)', border: '1px solid var(--border)',
      }}>
        {MODES.map(m => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setForm(f => ({ ...f, ticketRoutingMode: m.id }))}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: active ? 700 : 500,
                background: active ? 'var(--bg-card, var(--bg2))' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--tm)',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Default provider (only for external mode) */}
      {mode === 'send_to_default_provider' && (
        <div style={{ marginBottom: 24, padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card, var(--bg2))' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', marginBottom: 8 }}>Domyślna firma IT</div>
          {providers.length > 0 ? (
            <select className="input" value={form.defaultProviderWorkspaceId ?? ''} onChange={e => setForm(f => ({ ...f, defaultProviderWorkspaceId: e.target.value || null }))} style={{ minWidth: 300 }}>
              <option value="">— Wybierz firmę IT —</option>
              {providers.map(p => <option key={p.providerWorkspace.id} value={p.providerWorkspace.id}>{p.providerWorkspace.name}</option>)}
            </select>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--tm)', margin: 0 }}>Brak połączonych firm IT. Dodaj relację w zakładce Udostępnianie.</p>
          )}
        </div>
      )}

      {/* Toggles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ToggleRow label="Użytkownik może wybrać firmę IT" desc="Pozwól użytkownikom ręcznie wybrać, do której firmy IT trafi zgłoszenie" checked={form.allowUserProviderSelection} onChange={v => setForm(f => ({ ...f, allowUserProviderSelection: v }))} />
        <ToggleRow label="Asystent AI może tworzyć zgłoszenia" desc="AI automatycznie tworzy zgłoszenia na podstawie wykrytych problemów" checked={form.allowAssistantAutoCreate} onChange={v => setForm(f => ({ ...f, allowAssistantAutoCreate: v }))} />
        <ToggleRow label="Alerty agentów tworzą zgłoszenia" desc="Automatyczne tworzenie zgłoszeń gdy agent wykryje problem" checked={form.allowAlertAutoCreate} onChange={v => setForm(f => ({ ...f, allowAlertAutoCreate: v }))} />
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>{desc}</div>
      </div>
      <button onClick={() => onChange(!checked)} style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: checked ? 'var(--accent)' : 'var(--border)', position: 'relative', transition: 'background 0.2s',
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3,
          left: checked ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  );
}
