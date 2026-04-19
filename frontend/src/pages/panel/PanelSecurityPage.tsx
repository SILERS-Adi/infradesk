/**
 * PanelSecurityPage — active monitoring alerts + score history.
 * Data: /api/monitoring/alerts (workspace-scoped)
 */

import React from 'react';
import apiClient from '../../api/client';
import { AlertTriangle, Shield, ShieldCheck, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface MonitoringAlert {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  resolved: boolean;
  createdAt: string;
  agent: { id: string; hostname: string; companyName: string | null } | null;
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_LABEL: Record<string, string> = { critical: 'Krytyczny', high: 'Wysoki', medium: 'Średni', low: 'Niski' };

const TYPE_LABEL: Record<string, string> = {
  score_drop:        'Spadek wyniku bezpieczeństwa',
  critical_fail:     'Krytyczne błędy audytu',
  disk_failing:      'Dysk w stanie krytycznym',
  service_down:      'Zatrzymana usługa krytyczna',
  defender_off:      'Windows Defender wyłączony',
  defender_outdated: 'Windows Defender nieaktualny',
  firewall_off:      'Firewall wyłączony',
  smb1_enabled:      'SMBv1 włączone (przestarzały protokół)',
  new_lan_device:    'Nowe urządzenie w sieci LAN',
  unlocked_idle:     'Komputer odblokowany bez aktywności',
  guest_enabled:     'Konto gościa aktywne',
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
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const { data } = await apiClient.get('/monitoring/alerts', {
        params: { resolved: showResolved },
      });
      const sorted = [...(data as MonitoringAlert[])].sort((a, b) => {
        const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (sev !== 0) return sev;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setAlerts(sorted);
      setErr(null);
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.response?.data?.message || 'Błąd pobierania alertów');
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
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Błąd');
    }
  };

  const byGroup = React.useMemo(() => {
    const g: Record<string, MonitoringAlert[]> = { critical: [], high: [], medium: [], low: [] };
    for (const a of alerts) (g[a.severity] || g.low).push(a);
    return g;
  }, [alerts]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        .sec-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding: 8px 4px; }
        .sec-title { font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -0.025em; line-height: 1.05; }
        .sec-sub { color: var(--text-secondary); font-size: 14px; margin-top: 6px; }
        .sec-toggle { display: inline-flex; padding: 4px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 14px; gap: 2px; }
        .sec-toggle__opt { padding: 8px 16px; border-radius: 10px; color: var(--text-secondary); font-size: 13px; font-weight: 500; cursor: pointer; background: none; border: none; font-family: inherit; transition: all 150ms; }
        .sec-toggle__opt[aria-pressed="true"] { background: var(--glass-bg-vivid); color: var(--text-primary); border: 1px solid var(--glass-border-hi); }
        .sec-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
        .sec-sum-tile { padding: 20px; display: flex; align-items: center; gap: 16px; }
        .sec-sum-icon { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .sec-sum-val { font-size: 36px; font-weight: 800; line-height: 1; letter-spacing: -0.03em; }
        .sec-sum-label { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; color: var(--text-tertiary); text-transform: uppercase; margin-top: 2px; }
        .alert-card { padding: 20px 24px; display: flex; align-items: flex-start; gap: 16px; }
        .alert-chip { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; border: 1px solid; }
        .alert-chip--critical { background: rgba(239,68,68,0.14); color: #F87171; border-color: rgba(239,68,68,0.4); }
        .alert-chip--high     { background: rgba(249,115,22,0.14); color: #FB923C; border-color: rgba(249,115,22,0.4); }
        .alert-chip--medium   { background: rgba(251,191,36,0.14); color: #FBBF24; border-color: rgba(251,191,36,0.4); }
        .alert-chip--low      { background: rgba(56,189,248,0.14); color: #38BDF8; border-color: rgba(56,189,248,0.4); }
        .alert-body { flex: 1; min-width: 0; }
        .alert-title { font-size: 15px; font-weight: 600; color: var(--text-primary); letter-spacing: -0.01em; }
        .alert-meta { display: flex; gap: 12px; margin-top: 6px; font-size: 12px; color: var(--text-tertiary); flex-wrap: wrap; }
        .alert-device { color: var(--text-secondary); font-weight: 500; font-family: var(--font-mono, monospace); }
        .alert-message { font-size: 13px; color: var(--text-secondary); margin-top: 8px; line-height: 1.5; }
        .alert-actions { display: flex; gap: 8px; flex-shrink: 0; }
        .alert-btn { padding: 8px 14px; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid var(--glass-border-hi); background: var(--glass-bg); color: var(--text-secondary); font-family: inherit; transition: all 150ms; }
        .alert-btn:hover { color: var(--text-primary); border-color: #22D3EE; background: var(--glass-bg-hi); }
        .empty-state { padding: 60px 20px; text-align: center; }
        .empty-icon { margin: 0 auto 20px; width: 64px; height: 64px; border-radius: 50%; background: var(--brand-gradient-soft, rgba(139,92,246,0.12)); display: flex; align-items: center; justify-content: center; color: #34D399; }
        .empty-title { font-size: 20px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.015em; }
        .empty-desc { color: var(--text-secondary); font-size: 14px; margin-top: 8px; }
        .group-header { font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--text-tertiary); margin: 24px 0 12px; }
      `}</style>

      <header className="sec-head">
        <div>
          <h1 className="sec-title">Bezpieczeństwo</h1>
          <div className="sec-sub">Monitoring urządzeń, alerty, audyt</div>
        </div>
        <div className="sec-toggle" role="group">
          <button className="sec-toggle__opt" aria-pressed={!showResolved} onClick={() => setShowResolved(false)}>Aktywne</button>
          <button className="sec-toggle__opt" aria-pressed={showResolved}  onClick={() => setShowResolved(true)}>Rozwiązane</button>
        </div>
      </header>

      {/* Summary */}
      <div className="sec-summary">
        <div className="panel-glass sec-sum-tile">
          <div className="sec-sum-icon" style={{ background: 'rgba(239,68,68,0.14)', color: '#F87171' }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <div className="sec-sum-val" style={{ color: '#F87171' }}>{byGroup.critical.length}</div>
            <div className="sec-sum-label">Krytyczne</div>
          </div>
        </div>
        <div className="panel-glass sec-sum-tile">
          <div className="sec-sum-icon" style={{ background: 'rgba(249,115,22,0.14)', color: '#FB923C' }}>
            <Shield size={22} />
          </div>
          <div>
            <div className="sec-sum-val" style={{ color: '#FB923C' }}>{byGroup.high.length}</div>
            <div className="sec-sum-label">Wysokie</div>
          </div>
        </div>
        <div className="panel-glass sec-sum-tile">
          <div className="sec-sum-icon" style={{ background: 'rgba(251,191,36,0.14)', color: '#FBBF24' }}>
            <Shield size={22} />
          </div>
          <div>
            <div className="sec-sum-val" style={{ color: '#FBBF24' }}>{byGroup.medium.length}</div>
            <div className="sec-sum-label">Średnie</div>
          </div>
        </div>
        <div className="panel-glass sec-sum-tile">
          <div className="sec-sum-icon" style={{ background: 'rgba(52,211,153,0.14)', color: '#34D399' }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="sec-sum-val" style={{ color: '#34D399' }}>{alerts.length - byGroup.critical.length - byGroup.high.length - byGroup.medium.length}</div>
            <div className="sec-sum-label">Niskie / pozostałe</div>
          </div>
        </div>
      </div>

      {/* List */}
      {err ? (
        <div className="panel-glass" style={{ padding: 20, color: '#F87171' }}>Błąd: {err}</div>
      ) : loading ? (
        <div className="panel-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Ładowanie alertów…</div>
      ) : alerts.length === 0 ? (
        <div className="panel-glass empty-state">
          <div className="empty-icon"><CheckCircle2 size={32} /></div>
          <div className="empty-title">{showResolved ? 'Brak rozwiązanych alertów' : 'Wszystko pod kontrolą'}</div>
          <div className="empty-desc">
            {showResolved
              ? 'Nie zamknąłeś jeszcze żadnych alertów.'
              : 'Nie wykryto aktywnych zagrożeń. System monitoruje urządzenia 24/7.'}
          </div>
        </div>
      ) : (
        (['critical', 'high', 'medium', 'low'] as const).map(sev =>
          byGroup[sev].length > 0 ? (
            <div key={sev}>
              <div className="group-header">{SEVERITY_LABEL[sev]} ({byGroup[sev].length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {byGroup[sev].map(a => (
                  <div key={a.id} className="panel-glass alert-card">
                    <span className={`alert-chip alert-chip--${sev}`}>{SEVERITY_LABEL[sev]}</span>
                    <div className="alert-body">
                      <div className="alert-title">{TYPE_LABEL[a.type] ?? a.type}</div>
                      <div className="alert-meta">
                        {a.agent && <span className="alert-device">{a.agent.hostname}{a.agent.companyName ? ` · ${a.agent.companyName}` : ''}</span>}
                        <span>{formatTime(a.createdAt)} temu</span>
                      </div>
                      <div className="alert-message">{a.message}</div>
                    </div>
                    {!a.resolved && (
                      <div className="alert-actions">
                        <button className="alert-btn" onClick={() => resolve(a.id)}>Rozwiązane</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null
        )
      )}
    </div>
  );
}
