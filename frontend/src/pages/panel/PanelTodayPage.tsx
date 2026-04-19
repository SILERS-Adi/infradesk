/**
 * PanelTodayPage v3 — COCKPIT REBUILD.
 *
 * Layout: 2-col grid (Control | Intelligence) + bottom 3-col (Devices, Activity, Security).
 * No gradients, no decorative blobs. Dense, command-center dense.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import { panelApi, type PanelPulse, type PanelTiles, type PanelActivityItem } from '../../api/panel';
import { devicesApi } from '../../api/devices';
import apiClient from '../../api/client';
import { IdCore, idCoreMessage, type IdCoreStatus } from '../../components/panel/IdCore';
import { Ticket, MonitorUp, AlertOctagon, Zap, Activity, ShieldCheck, ChevronRight } from 'lucide-react';

interface MiniDevice { id: string; name: string; status: string }
interface MiniAlert { id: string; severity: string; message: string; agent?: { hostname?: string } | null }

const fmt = (iso?: string) => {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};

function mapStatus(state: 'ok' | 'warn' | 'alert' | undefined, loading: boolean): IdCoreStatus {
  if (loading) return 'offline';
  if (state === 'alert') return 'critical';
  if (state === 'warn')  return 'warning';
  return 'ok';
}

function devStatusClass(s: string): string {
  if (s === 'ACTIVE') return 'ok';
  if (s === 'IN_SERVICE') return 'warn';
  if (s === 'BROKEN') return 'bad';
  return 'gray';
}

function devStatusLabel(s: string): string {
  const m: Record<string, string> = { ACTIVE: 'Online', INACTIVE: 'Offline', IN_SERVICE: 'Serwis', BROKEN: 'Uszkodzone', RETIRED: 'Wycofane' };
  return m[s] ?? s;
}

export default function PanelTodayPage() {
  const { user } = useAuth();

  const [pulse, setPulse] = React.useState<PanelPulse | null>(null);
  const [tiles, setTiles] = React.useState<PanelTiles | null>(null);
  const [activity, setActivity] = React.useState<PanelActivityItem[]>([]);
  const [devices, setDevices] = React.useState<MiniDevice[]>([]);
  const [alerts, setAlerts] = React.useState<MiniAlert[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [lastUpdate, setLastUpdate] = React.useState<Date | null>(null);
  const [aiActive, setAiActive] = React.useState(false);

  const load = React.useCallback(async () => {
    /* AI active flash — during each refresh pulse the core indicates activity */
    setAiActive(true);
    try {
      const [p, t, a, d, al] = await Promise.all([
        panelApi.getPulse().catch(() => null),
        panelApi.getTiles().catch(() => null),
        panelApi.getActivity(6).catch(() => ({ items: [] })),
        devicesApi.getAll().catch(() => []) as Promise<MiniDevice[]>,
        apiClient.get<MiniAlert[]>('/monitoring/alerts').then(r => r.data).catch(() => []),
      ]);
      if (p) setPulse(p);
      if (t) setTiles(t);
      setActivity(a.items ?? []);
      setDevices(d ?? []);
      setAlerts(al ?? []);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
      setTimeout(() => setAiActive(false), 1200);
    }
  }, []);

  React.useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const status = mapStatus(pulse?.state, loading);
  const message = idCoreMessage(status, aiActive);
  const devicesOnline = devices.filter(d => d.status === 'ACTIVE').length;
  const devicesTotal = devices.length;
  const activeAlerts = alerts.length;

  const hello = React.useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Dobry wieczór';
    if (h < 12) return 'Dzień dobry';
    if (h < 18) return 'Cześć';
    return 'Dobry wieczór';
  }, []);

  return (
    <>
      {/* ═ Cockpit row: Control | Intelligence ═ */}
      <div className="ip-cockpit">
        {/* LEFT — Control */}
        <section className="ip-surface ip-status ip-fade-in">
          <div className="ip-status__eyebrow">
            <div className="ip-label">Status systemu</div>
            <span className={`ip-chip ip-chip--live ip-chip--${status === 'critical' ? 'bad' : status === 'warning' ? 'warn' : status === 'offline' ? 'gray' : 'ok'}`}>
              <span className="ip-chip__dot" style={{ background: 'currentColor' }} />
              {status === 'critical' ? 'Critical' : status === 'warning' ? 'Warning' : status === 'offline' ? 'Offline' : 'OK'}
            </span>
          </div>

          <div className="ip-status__msg">
            <h2>{hello}, {user?.firstName || ''}.</h2>
            <p>{message}</p>
          </div>

          <div className="ip-status__metrics">
            <div className="ip-status__metric">
              <span className="ip-status__metric-label">Urządzeń</span>
              <span className="ip-status__metric-value">{devicesTotal}</span>
              <span className="ip-status__metric-sub">
                <span style={{ color: 'var(--ip-ok)' }}>● {devicesOnline} online</span>
                {devicesTotal - devicesOnline > 0 && <span style={{ color: 'var(--ip-text-3)', marginLeft: 6 }}>· {devicesTotal - devicesOnline} offline</span>}
              </span>
            </div>
            <div className="ip-status__metric">
              <span className="ip-status__metric-label">Zgłoszenia</span>
              <span className="ip-status__metric-value">{pulse?.metrics.openTickets ?? '—'}</span>
              <span className="ip-status__metric-sub">
                {pulse?.metrics.overdueTickets
                  ? <span style={{ color: 'var(--ip-warn)' }}>▲ {pulse.metrics.overdueTickets} przeterminowane</span>
                  : 'wszystko w terminie'}
              </span>
            </div>
            <div className="ip-status__metric">
              <span className="ip-status__metric-label">Alerty</span>
              <span className="ip-status__metric-value" style={{ color: activeAlerts > 0 ? 'var(--ip-warn)' : undefined }}>{activeAlerts}</span>
              <span className="ip-status__metric-sub">
                {activeAlerts === 0 ? 'brak aktywnych' : `${activeAlerts} do sprawdzenia`}
              </span>
            </div>
            <div className="ip-status__metric">
              <span className="ip-status__metric-label">Ostatnia synchr.</span>
              <span className="ip-status__metric-value" style={{ fontSize: 14, fontWeight: 500 }}>{fmt(lastUpdate?.toISOString())}</span>
              <span className="ip-status__metric-sub">odświeża co 30s</span>
            </div>
          </div>

          <div className="ip-status__cta">
            <Link to="/panel/tickets?new=1" className="ip-btn ip-btn--primary ip-btn--lg" style={{ width: '100%' }}>
              <Ticket size={16} strokeWidth={2.2} />
              Zgłoś problem
            </Link>
            <Link to="/panel/ido" className="ip-btn ip-btn--secondary" style={{ width: '100%' }}>
              <Zap size={15} strokeWidth={2} />
              Zapytaj IDO
            </Link>
          </div>
        </section>

        {/* RIGHT — Intelligence */}
        <section className="ip-surface ip-intel ip-fade-in ip-fade-in-1">
          <div className="ip-intel__head">
            <div className="ip-label">ID CORE</div>
            <span className={`ip-chip ip-chip--${aiActive ? 'blue' : 'gray'} ${aiActive ? 'ip-chip--live' : ''}`}>
              <span className="ip-chip__dot" style={{ background: 'currentColor' }} />
              {aiActive ? 'AI Active' : 'AI Idle'}
            </span>
          </div>

          <div className="ip-intel__core">
            <IdCore
              score={pulse?.score ?? 0}
              status={status}
              aiActive={aiActive}
              alerts={activeAlerts}
              devicesOnline={devicesOnline}
              size={340}
            />
          </div>

          <div className="ip-intel__footer">
            <div className="ip-intel__stat">
              <span className="ip-intel__stat-label">Bezpieczeństwo</span>
              <span className="ip-intel__stat-value">{pulse?.score ?? '—'}<span style={{ color: 'var(--ip-text-3)', fontSize: 12, fontWeight: 500 }}> /100</span></span>
            </div>
            <div className="ip-intel__stat">
              <span className="ip-intel__stat-label">Urządzenia</span>
              <span className="ip-intel__stat-value">{devicesOnline}<span style={{ color: 'var(--ip-text-3)', fontSize: 12, fontWeight: 500 }}> /{devicesTotal}</span></span>
            </div>
            <div className="ip-intel__stat">
              <span className="ip-intel__stat-label">Alerty</span>
              <span className="ip-intel__stat-value" style={{ color: activeAlerts > 0 ? 'var(--ip-warn)' : undefined }}>{activeAlerts}</span>
            </div>
            <div className="ip-intel__stat">
              <span className="ip-intel__stat-label">AI Status</span>
              <span className="ip-intel__stat-value" style={{ fontSize: 13, fontWeight: 600, color: aiActive ? 'var(--ip-blue-hi)' : 'var(--ip-text-2)' }}>
                {aiActive ? 'ACTIVE' : 'STANDBY'}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* ═ Bottom cockpit: 3 modules ═ */}
      <div className="ip-bottom">
        {/* Devices */}
        <section className="ip-surface ip-module ip-fade-in ip-fade-in-2">
          <div className="ip-module__head">
            <span className="ip-module__title"><MonitorUp size={12} style={{ display: 'inline', marginRight: 6 }} /> Urządzenia</span>
            <Link to="/panel/devices" className="ip-btn ip-btn--ghost ip-btn--sm" style={{ height: 24, padding: '0 8px', fontSize: 11 }}>
              Wszystkie <ChevronRight size={12} />
            </Link>
          </div>
          <div className="ip-module__body">
            {devices.length === 0 ? (
              <div className="ip-empty">Brak urządzeń</div>
            ) : (
              devices.slice(0, 6).map(d => (
                <Link key={d.id} to="/panel/devices" className="ip-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span className={`ip-row__dot ip-row__dot--${devStatusClass(d.status)}`} />
                  <span className="ip-row__name">{d.name}</span>
                  <span className="ip-row__meta">{devStatusLabel(d.status)}</span>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Activity */}
        <section className="ip-surface ip-module ip-fade-in ip-fade-in-3">
          <div className="ip-module__head">
            <span className="ip-module__title"><Activity size={12} style={{ display: 'inline', marginRight: 6 }} /> Aktywność</span>
            <Link to="/panel/activity" className="ip-btn ip-btn--ghost ip-btn--sm" style={{ height: 24, padding: '0 8px', fontSize: 11 }}>
              Historia <ChevronRight size={12} />
            </Link>
          </div>
          <div className="ip-module__body">
            {activity.length === 0 ? (
              <div className="ip-empty">Brak ostatniej aktywności</div>
            ) : (
              activity.slice(0, 6).map(a => (
                <div key={a.id} className="ip-row" style={{ cursor: 'default' }}>
                  <span className="ip-row__dot ip-row__dot--blue" />
                  <span className="ip-row__name" style={{ fontSize: 12, fontWeight: 500 }}>{a.description}</span>
                  <span className="ip-row__meta">{fmt(a.at)}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Security */}
        <section className="ip-surface ip-module ip-fade-in ip-fade-in-4">
          <div className="ip-module__head">
            <span className="ip-module__title"><ShieldCheck size={12} style={{ display: 'inline', marginRight: 6 }} /> Bezpieczeństwo</span>
            <Link to="/panel/security" className="ip-btn ip-btn--ghost ip-btn--sm" style={{ height: 24, padding: '0 8px', fontSize: 11 }}>
              Wszystkie <ChevronRight size={12} />
            </Link>
          </div>
          <div className="ip-module__body">
            {alerts.length === 0 ? (
              <div className="ip-empty">
                <ShieldCheck size={24} style={{ margin: '0 auto 8px', color: 'var(--ip-ok)', display: 'block' }} />
                Wszystko bezpieczne
              </div>
            ) : (
              alerts.slice(0, 6).map(a => (
                <Link key={a.id} to="/panel/security" className="ip-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span className={`ip-row__dot ip-row__dot--${a.severity === 'critical' ? 'bad' : a.severity === 'high' ? 'warn' : 'gray'}`} />
                  <span className="ip-row__name" style={{ fontSize: 12 }}>
                    {a.agent?.hostname ? `${a.agent.hostname}: ` : ''}{a.message.slice(0, 40)}
                  </span>
                  <span className="ip-row__status" style={{
                    background: a.severity === 'critical' ? 'var(--ip-bad-soft)' : a.severity === 'high' ? 'var(--ip-warn-soft)' : 'var(--ip-gray-soft)',
                    color: a.severity === 'critical' ? 'var(--ip-bad)' : a.severity === 'high' ? 'var(--ip-warn)' : 'var(--ip-text-3)',
                  }}>
                    {a.severity === 'critical' ? 'Crit' : a.severity === 'high' ? 'High' : a.severity === 'medium' ? 'Med' : 'Low'}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}
