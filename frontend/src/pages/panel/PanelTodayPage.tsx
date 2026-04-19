/**
 * PanelTodayPage — flagship "Dziś" page for ID Panel.
 *
 * Phase 1 scope: static shell with hero, Puls Firmy placeholder, 4 stat tiles,
 * timeline stub. Wired to useRole() so content shifts by role.
 *
 * Phase 2 will swap placeholders for live data:
 *   - Puls Firmy from /api/panel/pulse (composite score)
 *   - Tiles from /api/panel/tiles (tickets, devices, vault, billing)
 *   - Timeline from /api/panel/activity (recent audit events)
 *   - IDO chat card wired to /api/ido/sessions
 */

import React from 'react';
import { useRole } from '../../components/panel/RoleGate';
import { useAuth } from '../../store/authStore';

export default function PanelTodayPage() {
  const { role, isMsp, isOwner } = useRole();
  const { user } = useAuth();

  const hello = React.useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Dobry wieczór';
    if (h < 12) return 'Dzień dobry';
    if (h < 18) return 'Cześć';
    return 'Dobry wieczór';
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        .hero-today { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 24px 4px 8px; }
        .hero-title { font-size: clamp(32px, 5vw, 56px); font-weight: 800; letter-spacing: -0.02em; line-height: 1.05; margin: 0; }
        .hero-sub { color: var(--text-secondary); font-size: 14px; margin-top: 6px; }
        .pulse-card { padding: 20px; min-height: 260px; display: flex; flex-direction: column; gap: 12px; }
        .pulse-title { font-size: 11px; font-weight: 700; letter-spacing: 0.2em; color: var(--text-tertiary); text-transform: uppercase; }
        .pulse-placeholder { flex: 1; display: grid; place-items: center; color: var(--text-tertiary); font-family: ui-monospace, monospace; font-size: 12px; letter-spacing: 0.15em; }
        .tiles-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
        .tile { padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
        .tile-label { font-size: 10px; font-weight: 700; letter-spacing: 0.18em; color: var(--text-tertiary); text-transform: uppercase; }
        .tile-value { font-size: 30px; font-weight: 700; background: var(--brand-gradient-vivid); -webkit-background-clip: text; background-clip: text; color: transparent; letter-spacing: -0.02em; }
        .tile-sub { font-size: 12px; color: var(--text-secondary); }
        .timeline { padding: 18px 20px; }
        .timeline-item { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px dashed var(--glass-border); font-size: 13px; color: var(--text-secondary); }
        .timeline-item:last-child { border-bottom: 0; }
        .timeline-time { font-family: ui-monospace, monospace; font-size: 11px; color: var(--text-tertiary); min-width: 52px; }
      `}</style>

      {/* Hero */}
      <header className="hero-today">
        <div>
          <h1 className="hero-title">
            <span className="panel-text-brand">{hello}</span>, {user?.firstName || 'Adrian'}.
          </h1>
          <div className="hero-sub">
            Panel {role === 'MSP' ? 'dostawcy' : role === 'OWNER' ? 'właściciela' : role === 'ADMIN' ? 'administratora' : 'użytkownika'}
            {' · '}Phase 1 · fundament gotowy
          </div>
        </div>
      </header>

      {/* Puls Firmy */}
      <div className="panel-glass pulse-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="pulse-title">Puls Firmy</span>
          <span className="panel-chip panel-chip--ok">WSZYSTKO OK</span>
        </div>
        <div className="pulse-placeholder">
          ⋅ rdzeń precision-tech wyląduje tutaj (Phase 2) ⋅
        </div>
      </div>

      {/* Tiles */}
      <div className="tiles-grid">
        <div className="panel-glass tile">
          <span className="tile-label">Zgłoszenia otwarte</span>
          <span className="tile-value">—</span>
          <span className="tile-sub">live w Phase 2</span>
        </div>
        <div className="panel-glass tile">
          <span className="tile-label">Urządzenia online</span>
          <span className="tile-value">—</span>
          <span className="tile-sub">live w Phase 2</span>
        </div>
        {(isOwner || isMsp) && (
          <div className="panel-glass tile">
            <span className="tile-label">Do zafakturowania</span>
            <span className="tile-value">—</span>
            <span className="tile-sub">live w Phase 2</span>
          </div>
        )}
        <div className="panel-glass tile">
          <span className="tile-label">Alertów bezp.</span>
          <span className="tile-value">—</span>
          <span className="tile-sub">live w Phase 2</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="panel-glass timeline">
        <div className="pulse-title" style={{ marginBottom: 10 }}>Aktywność</div>
        <div className="timeline-item">
          <span className="timeline-time">now</span>
          <span>Panel Phase 1 wdrożony — routing /panel/* aktywny, tokeny załadowane.</span>
        </div>
        <div className="timeline-item">
          <span className="timeline-time">—</span>
          <span style={{ color: 'var(--text-tertiary)' }}>Więcej wydarzeń pojawi się gdy Phase 2 podłączy /api/panel/activity.</span>
        </div>
      </div>
    </div>
  );
}
