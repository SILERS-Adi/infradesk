import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Clock, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../api/client';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

interface SlaPriority {
  responseTime: number; // minutes
  resolutionTime: number; // minutes
}

interface BusinessHours {
  days: number[]; // 0=Sun, 1=Mon ... 6=Sat
  startHour: string; // "08:00"
  endHour: string;   // "16:00"
}

interface SlaConfig {
  priorities: Record<string, SlaPriority>;
  businessHours: BusinessHours;
}

const PRIORITY_LABELS: { key: string; label: string; color: string }[] = [
  { key: 'CRITICAL', label: 'Krytyczny', color: '#EF4444' },
  { key: 'HIGH',     label: 'Wysoki',    color: '#F59E0B' },
  { key: 'MEDIUM',   label: 'Średni',    color: '#6366F1' },
  { key: 'LOW',      label: 'Niski',     color: '#22C55E' },
];

const DAY_LABELS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];

const DEFAULT_CONFIG: SlaConfig = {
  priorities: {
    CRITICAL: { responseTime: 30,  resolutionTime: 240 },
    HIGH:     { responseTime: 60,  resolutionTime: 480 },
    MEDIUM:   { responseTime: 240, resolutionTime: 1440 },
    LOW:      { responseTime: 480, resolutionTime: 2880 },
  },
  businessHours: {
    days: [1, 2, 3, 4, 5], // Mon-Fri
    startHour: '08:00',
    endHour: '16:00',
  },
};

function formatMinutes(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default function SlaContent() {
  const queryClient = useQueryClient();

  const { data: savedConfig, isLoading } = useQuery({
    queryKey: ['sla-config'],
    queryFn: () => apiClient.get<SlaConfig | null>('/helpdesk-settings/sla').then(r => r.data),
  });

  const [config, setConfig] = useState<SlaConfig>(DEFAULT_CONFIG);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (savedConfig && !initialized) {
      setConfig({
        priorities: { ...DEFAULT_CONFIG.priorities, ...savedConfig.priorities },
        businessHours: { ...DEFAULT_CONFIG.businessHours, ...savedConfig.businessHours },
      });
      setInitialized(true);
    } else if (savedConfig === null && !initialized) {
      setInitialized(true);
    }
  }, [savedConfig, initialized]);

  const saveMut = useMutation({
    mutationFn: (data: SlaConfig) => apiClient.put('/helpdesk-settings/sla', data).then(r => r.data),
    onSuccess: () => {
      toast.success('Konfiguracja SLA zapisana');
      queryClient.invalidateQueries({ queryKey: ['sla-config'] });
    },
    onError: () => toast.error('Błąd zapisu SLA'),
  });

  if (isLoading) return <LoadingSpinner />;

  const isConfigured = savedConfig !== null;

  const updatePriority = (key: string, field: keyof SlaPriority, value: number) => {
    setConfig(c => ({
      ...c,
      priorities: {
        ...c.priorities,
        [key]: { ...c.priorities[key], [field]: value },
      },
    }));
  };

  const toggleDay = (day: number) => {
    setConfig(c => {
      const days = c.businessHours.days.includes(day)
        ? c.businessHours.days.filter(d => d !== day)
        : [...c.businessHours.days, day].sort();
      return { ...c, businessHours: { ...c.businessHours, days } };
    });
  };

  return (
    <div>
      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--t)', margin: '0 0 4px' }}>
            Umowy poziomu usług (SLA)
          </h2>
          <p style={{ fontSize: 13, color: 'var(--tm)', margin: 0 }}>
            Określ maksymalny czas reakcji i rozwiązania per priorytet
          </p>
        </div>
        <button className="btn-primary" onClick={() => saveMut.mutate(config)} disabled={saveMut.isPending}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {saveMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Zapisz
        </button>
      </div>

      {!isConfigured && (
        <div style={{
          padding: '14px 18px', borderRadius: 12, marginBottom: 20,
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertTriangle size={16} color="#F59E0B" />
          <span style={{ fontSize: 13, color: 'var(--ts)' }}>
            Brak konfiguracji SLA — poniżej widoczne wartości domyślne. Kliknij "Zapisz" aby aktywować.
          </span>
        </div>
      )}

      {/* SLA per priority */}
      <div className="page-card" style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={thStyle}>Priorytet</th>
              <th style={thStyle}>Czas reakcji</th>
              <th style={thStyle}>Czas rozwiązania</th>
            </tr>
          </thead>
          <tbody>
            {PRIORITY_LABELS.map(p => {
              const sla = config.priorities[p.key] ?? { responseTime: 60, resolutionTime: 480 };
              return (
                <tr key={p.key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: 'var(--t)', fontSize: 13 }}>{p.label}</span>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <TimeInput value={sla.responseTime} onChange={v => updatePriority(p.key, 'responseTime', v)} />
                  </td>
                  <td style={tdStyle}>
                    <TimeInput value={sla.resolutionTime} onChange={v => updatePriority(p.key, 'resolutionTime', v)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Business Hours */}
      <div className="page-card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={16} /> Godziny pracy
        </h3>
        <p style={{ fontSize: 12, color: 'var(--tm)', margin: '0 0 16px' }}>
          SLA liczone jest tylko w godzinach roboczych
        </p>

        {/* Days */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tm)', marginBottom: 8 }}>Dni robocze</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {DAY_LABELS.map((label, idx) => {
              const active = config.businessHours.days.includes(idx);
              return (
                <button
                  key={idx}
                  onClick={() => toggleDay(idx)}
                  style={{
                    width: 40, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: active ? 700 : 500,
                    background: active ? 'var(--accent)' : 'var(--hover-bg)',
                    color: active ? '#fff' : 'var(--tm)',
                    transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hours */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tm)', marginBottom: 6 }}>Od</div>
            <input
              type="time"
              className="input"
              value={config.businessHours.startHour}
              onChange={e => setConfig(c => ({ ...c, businessHours: { ...c.businessHours, startHour: e.target.value } }))}
              style={{ width: 120 }}
            />
          </div>
          <span style={{ color: 'var(--td)', marginTop: 20 }}>—</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tm)', marginBottom: 6 }}>Do</div>
            <input
              type="time"
              className="input"
              value={config.businessHours.endHour}
              onChange={e => setConfig(c => ({ ...c, businessHours: { ...c.businessHours, endHour: e.target.value } }))}
              style={{ width: 120 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Time Input (minutes) ──────────────────────────────────────

const TIME_PRESETS = [
  { label: '15min', value: 15 },
  { label: '30min', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 },
  { label: '4h', value: 240 },
  { label: '8h', value: 480 },
  { label: '24h', value: 1440 },
  { label: '48h', value: 2880 },
];

function TimeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <select
        className="input"
        value={TIME_PRESETS.find(p => p.value === value) ? value : 'custom'}
        onChange={e => {
          if (e.target.value !== 'custom') onChange(Number(e.target.value));
        }}
        style={{ width: 100, fontSize: 12, padding: '6px 8px' }}
      >
        {TIME_PRESETS.map(p => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
        {!TIME_PRESETS.find(p => p.value === value) && (
          <option value="custom">{formatMinutes(value)}</option>
        )}
      </select>
      <span style={{ fontSize: 11, color: 'var(--td)', whiteSpace: 'nowrap' }}>
        {formatMinutes(value)}
      </span>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--td)',
  background: 'var(--hover-bg)',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
};
