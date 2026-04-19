/**
 * PanelTodayPage — flagship "Dziś" page for ID Panel.
 *
 * Phase 2 live data:
 *   - Puls Firmy        ← /api/panel/pulse        (score 0-100 + state ok/warn/alert)
 *   - Tiles             ← /api/panel/tiles        (tickets/devices/alerts/billing)
 *   - Activity timeline ← /api/panel/activity     (ActivityLog recent)
 */

import React from 'react';
import { useRole } from '../../components/panel/RoleGate';
import { useAuth } from '../../store/authStore';
import { panelApi, PanelPulse, PanelTiles, PanelActivityItem } from '../../api/panel';

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const d = Math.round((now - then) / 1000);
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.round(d / 60)}m`;
  if (d < 86400) return `${Math.round(d / 3600)}h`;
  return `${Math.round(d / 86400)}d`;
}

function formatPLN(n: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function PanelTodayPage() {
  const { role, isOwner } = useRole();
  const { user } = useAuth();

  const [pulse, setPulse] = React.useState<PanelPulse | null>(null);
  const [tiles, setTiles] = React.useState<PanelTiles | null>(null);
  const [activity, setActivity] = React.useState<PanelActivityItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [p, t, a] = await Promise.all([
        panelApi.getPulse(),
        panelApi.getTiles(),
        panelApi.getActivity(12),
      ]);
      setPulse(p);
      setTiles(t);
      setActivity(a.items);
      setErr(null);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Nie udało się pobrać danych');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000); // odświeżaj co 30s
    return () => window.clearInterval(id);
  }, [load]);

  const hello = React.useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Dobry wieczór';
    if (h < 12) return 'Dzień dobry';
    if (h < 18) return 'Cześć';
    return 'Dobry wieczór';
  }, []);

  const pulseChip =
    pulse?.state === 'alert'
      ? { cls: 'panel-chip--alert', text: 'UWAGA' }
      : pulse?.state === 'warn'
        ? { cls: 'panel-chip--warn', text: 'MONITOR' }
        : { cls: 'panel-chip--ok', text: 'WSZYSTKO OK' };

  // SVG arc pulse ring — score → stopnie łuku
  const arcPct = Math.max(0, Math.min(100, pulse?.score ?? 0));
  const C = 2 * Math.PI * 82;
  const dash = `${(C * arcPct) / 100} ${C}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        .hero-today { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 24px 4px 8px; }
        .hero-title { font-size: clamp(32px, 5vw, 56px); font-weight: 800; letter-spacing: -0.02em; line-height: 1.05; margin: 0; }
        .hero-sub { color: var(--text-secondary); font-size: 14px; margin-top: 6px; }
        .pulse-card { padding: 20px; min-height: 260px; display: flex; flex-direction: column; gap: 12px; }
        .pulse-title { font-size: 11px; font-weight: 700; letter-spacing: 0.2em; color: var(--text-tertiary); text-transform: uppercase; }
        .pulse-body { flex: 1; display: grid; grid-template-columns: 220px 1fr; gap: 24px; align-items: center; }
        @media (max-width: 640px) { .pulse-body { grid-template-columns: 1fr; } }
        .pulse-ring-wrap { display: grid; place-items: center; position: relative; }
        .pulse-ring { transform: rotate(-90deg); transition: all 300ms ease; }
        .pulse-core { position: absolute; inset: 0; display: grid; place-items: center; flex-direction: column; }
        .pulse-score { font-size: 48px; font-weight: 800; letter-spacing: -0.03em; background: var(--brand-gradient-vivid); -webkit-background-clip: text; background-clip: text; color: transparent; line-height: 1; }
        .pulse-score-label { font-size: 10px; font-weight: 700; letter-spacing: 0.2em; color: var(--text-tertiary); text-transform: uppercase; margin-top: 4px; }
        .pulse-metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 18px; }
        .pulse-metric { display: flex; flex-direction: column; gap: 2px; }
        .pulse-metric-label { font-size: 10px; font-weight: 700; letter-spacing: 0.16em; color: var(--text-tertiary); text-transform: uppercase; }
        .pulse-metric-value { font-size: 18px; font-weight: 700; color: var(--text-primary); }
        .tiles-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
        .tile { padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
        .tile-label { font-size: 10px; font-weight: 700; letter-spacing: 0.18em; color: var(--text-tertiary); text-transform: uppercase; }
        .tile-value { font-size: 30px; font-weight: 700; background: var(--brand-gradient-vivid); -webkit-background-clip: text; background-clip: text; color: transparent; letter-spacing: -0.02em; }
        .tile-sub { font-size: 12px; color: var(--text-secondary); }
        .timeline { padding: 18px 20px; }
        .timeline-item { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px dashed var(--glass-border); font-size: 13px; color: var(--text-secondary); }
        .timeline-item:last-child { border-bottom: 0; }
        .timeline-time { font-family: ui-monospace, monospace; font-size: 11px; color: var(--text-tertiary); min-width: 52px; }
        .panel-chip--warn { background: rgba(245, 158, 11, 0.18); color: #f59e0b; border-color: rgba(245, 158, 11, 0.35); }
        .panel-chip--alert { background: rgba(239, 68, 68, 0.18); color: #ef4444; border-color: rgba(239, 68, 68, 0.4); }
      `}</style>

      {/* Hero */}
      <header className="hero-today">
        <div>
          <h1 className="hero-title">
            <span className="panel-text-brand">{hello}</span>, {user?.firstName || 'Adrian'}.
          </h1>
          <div className="hero-sub">
            Panel {role === 'OWNER' ? 'właściciela' : role === 'ADMIN' ? 'administratora' : role === 'TECHNICIAN' ? 'technika' : 'użytkownika'}
            {' · '}Phase 2 · live
          </div>
        </div>
      </header>

      {/* Puls Firmy */}
      <div className="panel-glass pulse-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="pulse-title">Puls Firmy</span>
          <span className={`panel-chip ${pulseChip.cls}`}>{pulseChip.text}</span>
        </div>
        {err ? (
          <div style={{ color: '#ef4444', fontSize: 13, padding: 12 }}>{err}</div>
        ) : (
          <div className="pulse-body">
            <div className="pulse-ring-wrap" style={{ width: 200, height: 200 }}>
              <svg className="pulse-ring" width={200} height={200} viewBox="0 0 200 200">
                <circle cx={100} cy={100} r={82} stroke="rgba(255,255,255,0.06)" strokeWidth={8} fill="none" />
                <circle
                  cx={100}
                  cy={100}
                  r={82}
                  stroke="url(#pulseGrad)"
                  strokeWidth={8}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={dash}
                  style={{ transition: 'stroke-dasharray 500ms ease' }}
                />
                <defs>
                  <linearGradient id="pulseGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#00d4ff" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="pulse-core">
                <div>
                  <div className="pulse-score">{loading ? '—' : Math.round(arcPct)}</div>
                  <div className="pulse-score-label">score</div>
                </div>
              </div>
            </div>
            <div className="pulse-metrics">
              <div className="pulse-metric">
                <span className="pulse-metric-label">Overdue</span>
                <span className="pulse-metric-value">{pulse?.metrics.overdueTickets ?? '—'}</span>
              </div>
              <div className="pulse-metric">
                <span className="pulse-metric-label">Nieprzydzielone</span>
                <span className="pulse-metric-value">{pulse?.metrics.unassignedTickets ?? '—'}</span>
              </div>
              <div className="pulse-metric">
                <span className="pulse-metric-label">Otwarte</span>
                <span className="pulse-metric-value">{pulse?.metrics.openTickets ?? '—'}</span>
              </div>
              <div className="pulse-metric">
                <span className="pulse-metric-label">Ostatnie 24h</span>
                <span className="pulse-metric-value">{pulse?.metrics.ticketsLast24h ?? '—'}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tiles */}
      <div className="tiles-grid">
        <div className="panel-glass tile">
          <span className="tile-label">Zgłoszenia otwarte</span>
          <span className="tile-value">{loading ? '—' : tiles?.openTickets.value ?? '—'}</span>
          <span className="tile-sub">
            {pulse?.metrics.overdueTickets
              ? `${pulse.metrics.overdueTickets} overdue`
              : 'wszystko w terminie'}
          </span>
        </div>
        <div className="panel-glass tile">
          <span className="tile-label">Urządzenia aktywne</span>
          <span className="tile-value">{loading ? '—' : tiles?.devicesOnline.value ?? '—'}</span>
          <span className="tile-sub">
            {tiles ? `z ${tiles.devicesOnline.total} total` : 'ładowanie…'}
          </span>
        </div>
        {isOwner && tiles?.billingDue && (
          <div className="panel-glass tile">
            <span className="tile-label">Do zafakturowania</span>
            <span className="tile-value">{formatPLN(tiles.billingDue.value)}</span>
            <span className="tile-sub">zaległe faktury</span>
          </div>
        )}
        <div className="panel-glass tile">
          <span className="tile-label">Alerty bezp.</span>
          <span className="tile-value">{loading ? '—' : tiles?.securityAlerts.value ?? '—'}</span>
          <span className="tile-sub">urządzenia bez aktualizacji &gt;30 dni</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="panel-glass timeline">
        <div className="pulse-title" style={{ marginBottom: 10 }}>Aktywność</div>
        {loading && activity.length === 0 ? (
          <div className="timeline-item">
            <span className="timeline-time">…</span>
            <span style={{ color: 'var(--text-tertiary)' }}>Ładowanie ostatnich zdarzeń…</span>
          </div>
        ) : activity.length === 0 ? (
          <div className="timeline-item">
            <span className="timeline-time">—</span>
            <span style={{ color: 'var(--text-tertiary)' }}>Brak ostatniej aktywności.</span>
          </div>
        ) : (
          activity.map((it) => (
            <div key={it.id} className="timeline-item">
              <span className="timeline-time">{formatRelative(it.at)}</span>
              <span>
                {it.description}
                {it.by ? <span style={{ color: 'var(--text-tertiary)' }}> · {it.by}</span> : null}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
