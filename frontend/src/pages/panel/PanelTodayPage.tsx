/**
 * PanelTodayPage — flagship "Dziś" page for ID Panel.
 *
 * Phase 2 v2:
 *   - Premium canvas Puls Firmy (icosahedron + hex grid + shield + HUD)
 *   - Hero layout with greeting + CTA buttons
 *   - 4 tiles (tickets/devices/alerts/billing)
 *   - IDO orb card + quick actions
 *   - Activity timeline
 * Data: /api/panel/{pulse,tiles,activity} refreshed every 30s.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useRole } from '../../components/panel/RoleGate';
import { useAuth } from '../../store/authStore';
import { panelApi, PanelPulse, PanelTiles, PanelActivityItem } from '../../api/panel';
import { PulsFirmyCanvas } from '../../components/panel/PulsFirmyCanvas';

function formatRelative(iso: string): string {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.round(d / 60)}m`;
  if (d < 86400) return `${Math.round(d / 3600)}h`;
  return `${Math.round(d / 86400)}d`;
}

function formatPLN(n: number): string {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(n);
}

export default function PanelTodayPage() {
  const { role, isOwner, isAdmin } = useRole();
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
      setPulse(p); setTiles(t); setActivity(a.items); setErr(null);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Nie udało się pobrać danych');
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const hello = React.useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Dobry wieczór';
    if (h < 12) return 'Dzień dobry';
    if (h < 18) return 'Cześć';
    return 'Dobry wieczór';
  }, []);

  const dateStr = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  /* Map API state → canvas state */
  const canvasState = pulse?.state === 'alert' ? 'bad' : pulse?.state === 'warn' ? 'warn' : 'ok';
  const statusText = pulse?.state === 'alert'
    ? 'Krytyczne zagrożenia — wymagana interwencja'
    : pulse?.state === 'warn'
      ? 'Wykryto uwagi — warto sprawdzić alerty'
      : 'W firmie wszystko działa stabilnie';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <style>{`
        .today-hero {
          position: relative; overflow: hidden;
          display: grid; grid-template-columns: minmax(320px, 1fr) 1fr; gap: 40px;
          padding: 48px; align-items: center; min-height: 540px;
          border-radius: 32px;
        }
        .today-hero::after {
          content: ''; position: absolute; top: 50%; right: -10%;
          width: 60%; height: 120%;
          background: radial-gradient(circle, rgba(139,92,246,0.12), transparent 60%);
          transform: translateY(-50%); filter: blur(40px); pointer-events: none;
        }
        @media (max-width: 1024px) { .today-hero { grid-template-columns: 1fr; padding: 32px; min-height: auto; } }
        .today-hero__left { position: relative; z-index: 1; }
        .today-hero__date { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 12px; }
        .today-hero__title { font-size: clamp(40px, 5.5vw, 72px); font-weight: 900; letter-spacing: -0.055em; line-height: 0.98; color: var(--text-primary); margin-bottom: 16px; }
        .today-hero__title em { background: var(--brand-gradient-vivid); -webkit-background-clip: text; background-clip: text; color: transparent; font-style: normal; }
        .today-hero__sub { font-size: 16px; color: var(--text-secondary); margin-bottom: 24px; max-width: 480px; line-height: 1.55; }
        .today-status {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 18px; border-radius: 9999px;
          font-size: 13px; font-weight: 600;
          margin-bottom: 28px;
        }
        .today-status--ok   { background: rgba(52,211,153,0.14); color: #34D399; border: 1px solid rgba(52,211,153,0.35); }
        .today-status--warn { background: rgba(251,191,36,0.14); color: #FBBF24; border: 1px solid rgba(251,191,36,0.35); }
        .today-status--bad  { background: rgba(248,113,113,0.14); color: #F87171; border: 1px solid rgba(248,113,113,0.35); }
        .today-cta { display: flex; gap: 12px; flex-wrap: wrap; }
        .today-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          height: 52px; padding: 0 28px; border-radius: 16px;
          font-size: 16px; font-weight: 600; border: none; cursor: pointer; text-decoration: none;
          transition: all 180ms cubic-bezier(0.22, 0.82, 0.32, 1);
        }
        .today-btn--primary {
          background: var(--brand-gradient-vivid, linear-gradient(135deg, #8B5CF6, #22D3EE));
          color: #fff;
          box-shadow: 0 10px 30px rgba(139,92,246,.35), 0 24px 60px rgba(34,211,238,.18), inset 0 1px 0 rgba(255,255,255,.22);
        }
        .today-btn--primary:hover { transform: translateY(-2px); filter: brightness(1.1); }
        .today-btn--secondary {
          background: var(--glass-bg-hi, rgba(255,255,255,0.06));
          color: var(--text-primary);
          border: 1px solid var(--glass-border-hi, rgba(255,255,255,0.14));
        }
        .today-btn--secondary:hover { background: var(--glass-bg-vivid, rgba(255,255,255,0.10)); transform: translateY(-1px); }
        .today-hero__canvas-wrap {
          display: flex; align-items: center; justify-content: center;
          aspect-ratio: 1; width: 100%; max-width: 540px; justify-self: center;
        }
        .today-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
        .today-tile { padding: 24px; display: flex; flex-direction: column; gap: 12px; min-height: 150px; }
        .today-tile__label { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; color: var(--text-tertiary); text-transform: uppercase; }
        .today-tile__value { font-size: 48px; font-weight: 800; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; color: var(--text-primary); }
        .today-tile__unit { font-size: 20px; color: var(--text-tertiary); font-weight: 500; margin-left: 4px; }
        .today-tile__sub { font-size: 12px; color: var(--text-secondary); }
        .today-bottom { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
        @media (max-width: 1024px) { .today-bottom { grid-template-columns: 1fr; } }
        .today-timeline { padding: 24px; }
        .today-timeline__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .today-timeline__title { font-size: 20px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.015em; }
        .today-timeline__sub { font-size: 13px; color: var(--text-tertiary); margin-top: 3px; }
        .today-timeline__item { display: grid; grid-template-columns: 40px 1fr auto; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--glass-border, rgba(255,255,255,0.08)); }
        .today-timeline__item:last-child { border-bottom: 0; padding-bottom: 0; }
        .today-timeline__dot { width: 12px; height: 12px; border-radius: 50%; background: var(--brand-gradient, linear-gradient(135deg, #8B5CF6, #22D3EE)); margin-top: 6px; margin-left: 14px; box-shadow: 0 0 16px rgba(139,92,246,.5); }
        .today-timeline__content { font-size: 13px; color: var(--text-primary); }
        .today-timeline__meta { color: var(--text-tertiary); font-size: 11px; margin-top: 3px; }
        .today-timeline__time { color: var(--text-tertiary); font-size: 11px; white-space: nowrap; font-family: var(--font-mono, ui-monospace, monospace); }
        .today-ido { padding: 28px; display: flex; flex-direction: column; gap: 20px; min-height: 400px; }
        .today-ido__orb-wrap { display: flex; justify-content: center; margin-top: 8px; }
        .today-ido__orb {
          width: 96px; height: 96px; border-radius: 50%;
          background:
            radial-gradient(circle at 35% 30%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 35%),
            radial-gradient(circle at 50% 50%, #A78BFA 0%, #8B5CF6 40%, #22D3EE 100%);
          box-shadow: 0 0 50px rgba(139,92,246,.55), 0 0 120px rgba(34,211,238,.28), inset 0 -6px 20px rgba(14,22,40,.35), inset 0 2px 8px rgba(255,255,255,.25);
          animation: idoOrbPulse 3.5s ease-in-out infinite;
        }
        @keyframes idoOrbPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        .today-ido__text { text-align: center; }
        .today-ido__hello { font-size: 22px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; letter-spacing: -0.015em; }
        .today-ido__sub { font-size: 13px; color: var(--text-secondary); }
        .today-ido__quick { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: auto; }
        .today-ido__quick button {
          padding: 12px 14px; text-align: left; border-radius: 10px;
          background: var(--glass-bg, rgba(255,255,255,0.04)); border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
          color: var(--text-secondary); font-size: 11px; cursor: pointer; font-family: inherit;
          transition: all 160ms;
        }
        .today-ido__quick button:hover { border-color: #22D3EE; color: var(--text-primary); }
      `}</style>

      {/* HERO */}
      <div className="panel-glass today-hero">
        <div className="today-hero__left">
          <div className="today-hero__date">{dateStr}</div>
          <h1 className="today-hero__title">
            <em>{hello}</em>, {user?.firstName || ''}
          </h1>
          <p className="today-hero__sub">
            Panel {role === 'OWNER' ? 'właściciela' : role === 'ADMIN' ? 'administratora' : role === 'TECHNICIAN' ? 'technika' : 'użytkownika'}
            {pulse && pulse.metrics.totalDevices > 0 ? ` · ${pulse.metrics.totalDevices} urządzeń` : ''}
          </p>
          <div className={`today-status today-status--${canvasState}`}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />
            {err ? `Błąd: ${err}` : statusText}
          </div>
          <div className="today-cta">
            <Link to="/panel/tickets/new" className="today-btn today-btn--primary">
              Zgłoś problem
            </Link>
            <Link to="/panel/ido" className="today-btn today-btn--secondary">
              Zapytaj IDO
            </Link>
          </div>
        </div>
        <div className="today-hero__canvas-wrap">
          <PulsFirmyCanvas
            score={pulse?.score ?? 0}
            devices={pulse?.metrics.totalDevices ?? 0}
            alerts={tiles?.securityAlerts.value ?? 0}
            state={canvasState}
          />
        </div>
      </div>

      {/* TILES */}
      <div className="today-grid">
        <div className="panel-glass today-tile">
          <span className="today-tile__label">Zgłoszenia otwarte</span>
          <span className="today-tile__value">{loading ? '—' : tiles?.openTickets.value ?? '—'}</span>
          <span className="today-tile__sub">
            {pulse?.metrics.overdueTickets
              ? `${pulse.metrics.overdueTickets} overdue`
              : 'wszystko w terminie'}
          </span>
        </div>
        <div className="panel-glass today-tile">
          <span className="today-tile__label">Urządzenia aktywne</span>
          <span className="today-tile__value">
            {loading ? '—' : tiles?.devicesOnline.value ?? '—'}
            {tiles && <span className="today-tile__unit">/ {tiles.devicesOnline.total ?? 0}</span>}
          </span>
          <span className="today-tile__sub">{tiles ? `${Math.round((tiles.devicesOnline.value / Math.max(1, tiles.devicesOnline.total ?? 1)) * 100)}% online` : 'ładowanie…'}</span>
        </div>
        <div className="panel-glass today-tile">
          <span className="today-tile__label">Alerty bezpieczeństwa</span>
          <span className="today-tile__value">{loading ? '—' : tiles?.securityAlerts.value ?? '—'}</span>
          <span className="today-tile__sub">urządzenia bez aktualizacji &gt;30 dni</span>
        </div>
        {(isOwner || isAdmin) && tiles?.billingDue && (
          <div className="panel-glass today-tile">
            <span className="today-tile__label">Do zafakturowania</span>
            <span className="today-tile__value">{formatPLN(tiles.billingDue.value)}</span>
            <span className="today-tile__sub">zaległe faktury</span>
          </div>
        )}
      </div>

      {/* BOTTOM */}
      <div className="today-bottom">
        <div className="panel-glass today-timeline">
          <div className="today-timeline__head">
            <div>
              <div className="today-timeline__title">Ostatnie w firmie</div>
              <div className="today-timeline__sub">Timeline wszystkiego co się zdarzyło</div>
            </div>
          </div>
          {loading && activity.length === 0 ? (
            <div className="today-timeline__item">
              <div className="today-timeline__dot" />
              <div className="today-timeline__content">Ładowanie ostatnich zdarzeń…</div>
              <div className="today-timeline__time">—</div>
            </div>
          ) : activity.length === 0 ? (
            <div className="today-timeline__item">
              <div className="today-timeline__dot" />
              <div className="today-timeline__content">Brak ostatniej aktywności.</div>
              <div className="today-timeline__time">—</div>
            </div>
          ) : (
            activity.map((it) => (
              <div key={it.id} className="today-timeline__item">
                <div className="today-timeline__dot" />
                <div>
                  <div className="today-timeline__content">{it.description}</div>
                  {it.by && <div className="today-timeline__meta">{it.by}</div>}
                </div>
                <div className="today-timeline__time">{formatRelative(it.at)}</div>
              </div>
            ))
          )}
        </div>

        <div className="panel-glass today-ido">
          <div className="today-ido__orb-wrap"><div className="today-ido__orb" /></div>
          <div className="today-ido__text">
            <div className="today-ido__hello">Jestem Twoim IDO</div>
            <div className="today-ido__sub">W czym mogę pomóc?</div>
          </div>
          <div className="today-ido__quick">
            <button>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>💾 Miejsce na dysku</div>
              <div>sprawdź i zwolnij</div>
            </button>
            <button>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>🔄 Aktualizacje</div>
              <div>status Windows i programów</div>
            </button>
            <button>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>🖨️ Drukarka</div>
              <div>nie drukuje? przywróć</div>
            </button>
            <button>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>🔐 Nowe hasło</div>
              <div>wygeneruj i zapisz</div>
            </button>
          </div>
          <Link to="/panel/ido" className="today-btn today-btn--primary" style={{ width: '100%' }}>
            Napisz do IDO
          </Link>
        </div>
      </div>
    </div>
  );
}
