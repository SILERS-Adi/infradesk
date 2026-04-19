/**
 * PanelSecurityPage — migrated to primitives.
 */

import React from 'react';
import apiClient from '../../api/client';
import { AlertTriangle, Shield, ShieldCheck, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, SectionHeader, StatCard, EmptyState, Badge, Button, IconContainer } from '../../ui/primitives';

interface MonitoringAlert {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  resolved: boolean;
  createdAt: string;
  agent: { id: string; hostname: string; companyName: string | null } | null;
}

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEV_LABEL: Record<string, string> = { critical: 'Krytyczny', high: 'Wysoki', medium: 'Średni', low: 'Niski' };
const SEV_TONE: Record<string, 'bad' | 'warn' | 'blue' | 'gray'> = { critical: 'bad', high: 'warn', medium: 'warn', low: 'blue' };

const TYPE_LABEL: Record<string, string> = {
  score_drop: 'Spadek wyniku bezpieczeństwa',
  critical_fail: 'Krytyczne błędy audytu',
  disk_failing: 'Dysk w stanie krytycznym',
  service_down: 'Zatrzymana usługa krytyczna',
  defender_off: 'Windows Defender wyłączony',
  defender_outdated: 'Windows Defender nieaktualny',
  firewall_off: 'Firewall wyłączony',
  smb1_enabled: 'SMBv1 włączone',
  new_lan_device: 'Nowe urządzenie w sieci LAN',
  unlocked_idle: 'Komputer odblokowany bez aktywności',
  guest_enabled: 'Konto gościa aktywne',
};

function formatTime(iso: string): string {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.round(d / 60)} min`;
  if (d < 86400) return `${Math.round(d / 3600)} h`;
  return `${Math.round(d / 86400)} dni`;
}

export default function PanelSecurityPage() {
  const [alerts, setAlerts] = React.useState<MonitoringAlert[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showResolved, setShowResolved] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const { data } = await apiClient.get<MonitoringAlert[]>('/monitoring/alerts', { params: { resolved: showResolved } });
      const sorted = [...data].sort((a, b) => {
        const s = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
        if (s !== 0) return s;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setAlerts(sorted);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Błąd');
    } finally { setLoading(false); }
  }, [showResolved]);

  React.useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const resolve = async (id: string) => {
    try {
      await apiClient.post(`/monitoring/alerts/${id}/resolve`);
      toast.success('Alert oznaczony jako rozwiązany');
      load();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Błąd'); }
  };

  const byGroup = React.useMemo(() => {
    const g: Record<string, MonitoringAlert[]> = { critical: [], high: [], medium: [], low: [] };
    for (const a of alerts) (g[a.severity] || g.low).push(a);
    return g;
  }, [alerts]);

  return (
    <>
      <SectionHeader
        title="Bezpieczeństwo"
        sub="Monitoring urządzeń, alerty, audyt"
        action={(
          <div style={{ display: 'inline-flex', padding: 4, background: 'var(--ip-surface-solid)', border: 'var(--ip-border)', borderRadius: 12, gap: 2 }}>
            <button onClick={() => setShowResolved(false)}
              style={{ padding: '7px 14px', borderRadius: 9, border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer', background: !showResolved ? 'var(--ip-blue-soft)' : 'transparent', color: !showResolved ? 'var(--ip-blue-hi)' : 'var(--ip-text-2)' }}>
              Aktywne
            </button>
            <button onClick={() => setShowResolved(true)}
              style={{ padding: '7px 14px', borderRadius: 9, border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer', background: showResolved ? 'var(--ip-blue-soft)' : 'transparent', color: showResolved ? 'var(--ip-blue-hi)' : 'var(--ip-text-2)' }}>
              Rozwiązane
            </button>
          </div>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <StatCard label="Krytyczne" value={byGroup.critical.length} valueTone="bad" />
        <StatCard label="Wysokie" value={byGroup.high.length} valueTone="warn" />
        <StatCard label="Średnie" value={byGroup.medium.length} valueTone="warn" />
        <StatCard label="Niskie" value={byGroup.low.length} valueTone="ok" />
      </div>

      {loading ? (
        <Card><EmptyState icon={<Shield size={28} />} title="Ładowanie alertów…" /></Card>
      ) : alerts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 size={28} strokeWidth={1.8} />}
            title={showResolved ? 'Brak rozwiązanych alertów' : 'Wszystko pod kontrolą'}
            sub={showResolved ? 'Nie zamknąłeś jeszcze żadnych alertów' : 'Nie wykryto aktywnych zagrożeń'}
          />
        </Card>
      ) : (
        (['critical', 'high', 'medium', 'low'] as const).map(sev =>
          byGroup[sev].length > 0 ? (
            <div key={sev}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ip-text-3)', fontFamily: 'var(--ip-font-mono)', margin: '16px 0 10px' }}>
                {SEV_LABEL[sev]} ({byGroup[sev].length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {byGroup[sev].map(a => (
                  <Card key={a.id} size="md" style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    <IconContainer tone={SEV_TONE[sev] === 'bad' ? 'bad' : SEV_TONE[sev] === 'warn' ? 'warn' : 'brand'}>
                      <AlertTriangle size={18} strokeWidth={2} />
                    </IconContainer>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ip-text)', letterSpacing: '-0.005em' }}>
                        {TYPE_LABEL[a.type] ?? a.type}
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: 'var(--ip-text-3)', flexWrap: 'wrap', fontFamily: 'var(--ip-font-mono)' }}>
                        {a.agent && <span style={{ color: 'var(--ip-text-2)', fontWeight: 500 }}>{a.agent.hostname}{a.agent.companyName ? ` · ${a.agent.companyName}` : ''}</span>}
                        <span>{formatTime(a.createdAt)} temu</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--ip-text-2)', marginTop: 8, lineHeight: 1.5 }}>{a.message}</div>
                    </div>
                    <Badge tone={SEV_TONE[sev]}>{SEV_LABEL[sev]}</Badge>
                    {!a.resolved && (
                      <Button variant="secondary" size="sm" onClick={() => resolve(a.id)}>
                        <ShieldCheck size={14} /> Rozwiązane
                      </Button>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ) : null,
        )
      )}
    </>
  );
}
