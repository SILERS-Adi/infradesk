/**
 * PanelTodayPage v4 — wg nowypanel.png.
 * 3+3 grid: [Status][ID CORE][Kontakt] × [Szybkie akcje][Aktywność AI][Bezpieczeństwo]
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import { useWorkspace } from '../../store/workspaceStore';
import { panelApi, type PanelPulse, type PanelTiles, type PanelActivityItem } from '../../api/panel';
import { devicesApi } from '../../api/devices';
import apiClient from '../../api/client';
import { IdCore, idCoreMessage, type IdCoreStatus } from '../../components/panel/IdCore';
import { useCountUp } from '../../hooks/useCountUp';
import { Ticket, MonitorUp, HardDrive, RefreshCw, Printer, KeyRound, Zap, Bot, CheckCircle2, AlertTriangle, Shield, Wifi, Globe, Server } from 'lucide-react';

interface MiniDevice { id: string; name: string; status: string }
interface MiniAlert { id: string; severity: string; message: string; agent?: { hostname?: string } | null; createdAt: string }

const fmt = (iso?: string) => {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s temu`;
  if (s < 3600) return `${Math.round(s / 60)}m temu`;
  if (s < 86400) return `${Math.round(s / 3600)}h temu`;
  return `${Math.round(s / 86400)}d temu`;
};

function mapStatus(state: 'ok' | 'warn' | 'alert' | undefined, loading: boolean): IdCoreStatus {
  if (loading) return 'offline';
  if (state === 'alert') return 'critical';
  if (state === 'warn')  return 'warning';
  return 'ok';
}

export default function PanelTodayPage() {
  const { user } = useAuth();
  const currentWs = useWorkspace(s => s.current);

  const [pulse, setPulse] = React.useState<PanelPulse | null>(null);
  const [tiles, setTiles] = React.useState<PanelTiles | null>(null);
  const [activity, setActivity] = React.useState<PanelActivityItem[]>([]);
  const [devices, setDevices] = React.useState<MiniDevice[]>([]);
  const [alerts, setAlerts] = React.useState<MiniAlert[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [lastUpdate, setLastUpdate] = React.useState<Date | null>(null);
  const [aiActive, setAiActive] = React.useState(false);

  const load = React.useCallback(async () => {
    setAiActive(true);
    try {
      const [p, t, a, d, al] = await Promise.all([
        panelApi.getPulse().catch(() => null),
        panelApi.getTiles().catch(() => null),
        panelApi.getActivity(8).catch(() => ({ items: [] })),
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
  const coreMessage = idCoreMessage(status, aiActive);
  const score = pulse?.score ?? 0;
  const devicesOnline = devices.filter(d => d.status === 'ACTIVE').length;
  const devicesTotal = devices.length;
  const onlinePercent = devicesTotal > 0 ? Math.round((devicesOnline / devicesTotal) * 100) : 0;
  const activeAlerts = alerts.length;

  return (
    <>
      {/* ═════ TOP ROW: Status / ID CORE / Kontakt ═════ */}
      <div className="ip-grid-top">
        {/* STATUS SYSTEMU */}
        <section className="ip-card ip-status-card ip-fade ip-fade-1">
          <div className="ip-card__head">
            <div>
              <div className="ip-card__title">Status systemu</div>
              <div className="ip-card__subtitle">Przegląd infrastruktury IT</div>
            </div>
            <span className={`ip-chip ip-chip--live ip-chip--${status === 'critical' ? 'bad' : status === 'warning' ? 'warn' : status === 'offline' ? 'gray' : 'ok'}`}>
              <span className="ip-chip__dot" style={{ background: 'currentColor' }} />
              {status === 'critical' ? 'Critical' : status === 'warning' ? 'Warning' : status === 'offline' ? 'Offline' : 'OK'}
            </span>
          </div>

          <div className="ip-status-card__heading-wrap">
            <span className={`ip-status-card__heading-icon ip-status-card__heading-icon--${status === 'critical' ? 'bad' : status === 'warning' ? 'warn' : 'ok'}`}>
              <Shield size={18} strokeWidth={2.2} />
            </span>
            <div className="ip-status-card__title" style={{ marginTop: 0, marginBottom: 0 }}>
              <span className={`ip-status-dot-big ip-status-dot-big--${status === 'critical' ? 'bad' : status === 'warning' ? 'warn' : status === 'offline' ? 'gray' : 'ok'}`} />
              {status === 'critical' ? 'Wymagana interwencja' : status === 'warning' ? 'Wykryto uwagi' : 'System działa poprawnie'}
            </div>
          </div>
          <div className="ip-status-card__desc">
            {status === 'ok' && 'Wszystkie systemy są stabilne i zabezpieczone. Ostatnia synchronizacja ' + fmt(lastUpdate?.toISOString())}
            {status === 'warning' && `Wykryto ${activeAlerts} alertów wymagających sprawdzenia.`}
            {status === 'critical' && `Krytyczne problemy w systemie (${activeAlerts}). Skontaktuj się z IT.`}
            {status === 'offline' && 'Łączę się z systemem…'}
          </div>

          <div className="ip-status-card__metrics">
            <div className="ip-status-card__metric">
              <div className="ip-status-card__metric-label">Urządzenia</div>
              <div className="ip-status-card__metric-val">{devicesOnline}<span style={{ fontSize: 14, color: 'var(--ip-text-3)', fontWeight: 500 }}> / {devicesTotal}</span></div>
              <div className="ip-status-card__metric-sub">online teraz</div>
            </div>
            <div className="ip-status-card__metric">
              <div className="ip-status-card__metric-label">Online</div>
              <div className="ip-status-card__metric-val" style={{ color: onlinePercent === 100 ? 'var(--ip-ok)' : onlinePercent >= 80 ? 'var(--ip-text)' : 'var(--ip-warn)' }}>
                {onlinePercent}<span style={{ fontSize: 14, fontWeight: 500 }}>%</span>
              </div>
              <div className="ip-status-card__metric-sub">{pulse?.metrics.openTickets ?? 0} aktywnych zgłoszeń</div>
            </div>
          </div>

          <div className="ip-status-card__cta">
            <Link to="/panel/tickets?new=1" className="ip-btn ip-btn--primary" style={{ flex: 1 }}>
              <Ticket size={14} strokeWidth={2.2} /> Zgłoś problem
            </Link>
            <Link to="/panel/ido" className="ip-btn ip-btn--secondary" style={{ flex: 1 }}>
              <Zap size={14} strokeWidth={2.2} /> Pomoc zdalna
            </Link>
          </div>
        </section>

        {/* ID CORE */}
        <section className="ip-card ip-core-card ip-fade ip-fade-2">
          <div className="ip-card__head" style={{ width: '100%' }}>
            <div>
              <div className="ip-card__title">ID CORE</div>
              <div className="ip-card__subtitle">Stan systemu {status === 'offline' ? 'offline' : 'online'}</div>
            </div>
            <span className={`ip-chip ip-chip--${aiActive ? 'blue' : 'gray'} ${aiActive ? 'ip-chip--live' : ''}`}>
              <span className="ip-chip__dot" style={{ background: 'currentColor' }} />
              AI {aiActive ? 'Active' : 'Idle'}
            </span>
          </div>

          <div className="ip-core-card__body">
            <IdCore
              score={score}
              status={status}
              aiActive={aiActive}
              alerts={activeAlerts}
              devicesOnline={devicesOnline}
              size={280}
            />
          </div>

          <div className="ip-core-card__msg">{coreMessage}</div>
          <div className="ip-core-card__msg-sub">
            {status === 'ok' && aiActive && 'Skanowanie w toku…'}
            {status === 'ok' && !aiActive && 'Ochrona aktywna · monitoring 24/7'}
            {status === 'warning' && `${activeAlerts} alertów do sprawdzenia`}
            {status === 'critical' && 'Natychmiastowa uwaga wymagana'}
          </div>
        </section>

        {/* KONTAKT / INFO */}
        <section className="ip-card ip-contact-card ip-fade ip-fade-3">
          <div className="ip-card__head">
            <div>
              <div className="ip-card__title">Informacje</div>
              <div className="ip-card__subtitle">Twoja firma</div>
            </div>
          </div>

          <div className="ip-contact-card__box">
            <div className="ip-contact-card__name">{currentWs?.name ?? '—'}</div>
            <div className="ip-contact-card__meta">
              {((currentWs as any) ?? {}).taxId ? `NIP: ${(currentWs as any).taxId} · ` : ''}
              Zalogowany: <strong style={{ color: 'var(--ip-text)', fontWeight: 600 }}>{user?.firstName} {user?.lastName}</strong>
            </div>
          </div>

          <div className="ip-contact-card__stat">
            <span className="ip-contact-card__stat-label"><Server size={12} style={{ display: 'inline', marginRight: 6, color: 'var(--ip-blue-hi)' }} />Urządzenia</span>
            <span className="ip-contact-card__stat-val">{devicesOnline}/{devicesTotal} online</span>
          </div>
          <div className="ip-contact-card__stat">
            <span className="ip-contact-card__stat-label"><Shield size={12} style={{ display: 'inline', marginRight: 6, color: 'var(--ip-blue-hi)' }} />Bezpieczeństwo</span>
            <span className="ip-contact-card__stat-val">{score}/100</span>
          </div>
          <div className="ip-contact-card__stat">
            <span className="ip-contact-card__stat-label"><Wifi size={12} style={{ display: 'inline', marginRight: 6, color: 'var(--ip-blue-hi)' }} />Zgłoszenia</span>
            <span className="ip-contact-card__stat-val">{pulse?.metrics.openTickets ?? 0} otwarte</span>
          </div>
          <div className="ip-contact-card__stat">
            <span className="ip-contact-card__stat-label"><Globe size={12} style={{ display: 'inline', marginRight: 6, color: 'var(--ip-blue-hi)' }} />Alerty</span>
            <span className="ip-contact-card__stat-val" style={{ color: activeAlerts > 0 ? 'var(--ip-warn)' : 'var(--ip-text)' }}>{activeAlerts}</span>
          </div>
        </section>
      </div>

      {/* ═════ BOTTOM ROW: Szybkie akcje / Aktywność / Bezpieczeństwo ═════ */}
      <div className="ip-grid-bot">
        {/* SZYBKIE AKCJE */}
        <section className="ip-card ip-fade ip-fade-4">
          <div className="ip-card__head">
            <div>
              <div className="ip-card__title">Szybkie akcje</div>
              <div className="ip-card__subtitle">Najczęstsze operacje</div>
            </div>
          </div>
          <div className="ip-actions-grid">
            <Link to="/panel/ido" className="ip-action-tile">
              <div className="ip-action-tile__icon"><HardDrive size={16} strokeWidth={2} /></div>
              <div className="ip-action-tile__title">Miejsce na dysku</div>
              <div className="ip-action-tile__sub">Sprawdź i zwolnij</div>
            </Link>
            <Link to="/panel/ido" className="ip-action-tile">
              <div className="ip-action-tile__icon"><RefreshCw size={16} strokeWidth={2} /></div>
              <div className="ip-action-tile__title">Aktualizacje</div>
              <div className="ip-action-tile__sub">Status Windows</div>
            </Link>
            <Link to="/panel/ido" className="ip-action-tile">
              <div className="ip-action-tile__icon"><Printer size={16} strokeWidth={2} /></div>
              <div className="ip-action-tile__title">Drukarka</div>
              <div className="ip-action-tile__sub">Nie drukuje? Przywróć</div>
            </Link>
            <Link to="/panel/vault" className="ip-action-tile">
              <div className="ip-action-tile__icon"><KeyRound size={16} strokeWidth={2} /></div>
              <div className="ip-action-tile__title">Hasła</div>
              <div className="ip-action-tile__sub">Mój vault</div>
            </Link>
          </div>
        </section>

        {/* AKTYWNOŚĆ AI */}
        <section className="ip-card ip-fade ip-fade-5">
          <div className="ip-card__head">
            <div>
              <div className="ip-card__title">Aktywność AI</div>
              <div className="ip-card__subtitle">Ostatnie operacje systemu</div>
            </div>
            <Link to="/panel/activity" className="ip-btn ip-btn--ghost ip-btn--sm">Wszystkie</Link>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {activity.length === 0 ? (
              <div className="ip-feed-empty">
                <div className="ip-feed-empty__dots">
                  <span className="ip-feed-empty__dot" />
                  <span className="ip-feed-empty__dot" />
                  <span className="ip-feed-empty__dot" />
                </div>
                <div className="ip-feed-empty__text">AI monitoruje system</div>
                <div className="ip-feed-empty__sub">Skanowanie w tle — zdarzenia pojawią się tutaj</div>
              </div>
            ) : (
              activity.slice(0, 6).map(a => (
                <div key={a.id} className="ip-feed-item">
                  <div className="ip-feed-item__icon">
                    <Bot size={14} strokeWidth={2} />
                  </div>
                  <div className="ip-feed-item__body">
                    <div className="ip-feed-item__title">{a.description}</div>
                    <div className="ip-feed-item__meta">
                      {a.by ? `${a.by} · ` : ''}{fmt(a.at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* BEZPIECZEŃSTWO */}
        <section className="ip-card ip-sec-card ip-fade ip-fade-6">
          <div className="ip-card__head" style={{ width: '100%' }}>
            <div>
              <div className="ip-card__title">Bezpieczeństwo</div>
              <div className="ip-card__subtitle">Ocena kondycji systemu</div>
            </div>
            <Link to="/panel/security" className="ip-btn ip-btn--ghost ip-btn--sm">Szczegóły</Link>
          </div>

          <div className="ip-sec-ring-wrap">
            <SecurityRing score={score} status={status} />
            <div className="ip-sec-ring-val">
              <div>{score}<span style={{ fontSize: 14, color: 'var(--ip-text-3)', fontWeight: 500 }}>/100</span></div>
              <small>score</small>
            </div>
          </div>

          <div className="ip-sec-stats">
            <div className="ip-sec-stat">
              <span className="ip-sec-stat__label"><CheckCircle2 size={11} style={{ display: 'inline', marginRight: 4, color: 'var(--ip-ok)' }} />Urządzeń online</span>
              <span className="ip-sec-stat__val">{devicesOnline}/{devicesTotal}</span>
            </div>
            <div className="ip-sec-stat">
              <span className="ip-sec-stat__label"><AlertTriangle size={11} style={{ display: 'inline', marginRight: 4, color: activeAlerts > 0 ? 'var(--ip-warn)' : 'var(--ip-text-3)' }} />Aktywne alerty</span>
              <span className="ip-sec-stat__val" style={{ color: activeAlerts > 0 ? 'var(--ip-warn)' : 'var(--ip-text)' }}>{activeAlerts}</span>
            </div>
            <div className="ip-sec-stat">
              <span className="ip-sec-stat__label"><Shield size={11} style={{ display: 'inline', marginRight: 4, color: 'var(--ip-blue-hi)' }} />Zgłoszenia</span>
              <span className="ip-sec-stat__val">{pulse?.metrics.openTickets ?? 0}</span>
            </div>
            <div className="ip-sec-stat">
              <span className="ip-sec-stat__label"><MonitorUp size={11} style={{ display: 'inline', marginRight: 4, color: 'var(--ip-blue-hi)' }} />Ost. skan</span>
              <span className="ip-sec-stat__val">{fmt(lastUpdate?.toISOString())}</span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function SecurityRing({ score, status }: { score: number; status: IdCoreStatus }) {
  const color = status === 'critical' ? '#EF4444' : status === 'warning' ? '#F59E0B' : status === 'offline' ? '#6B7280' : '#3B82F6';
  const pct = Math.max(0, Math.min(100, score));
  const C = 2 * Math.PI * 56;
  const dash = `${(C * pct) / 100} ${C}`;
  return (
    <svg width={140} height={140} viewBox="0 0 140 140">
      <circle cx={70} cy={70} r={56} stroke="currentColor" strokeOpacity="0.08" strokeWidth={8} fill="none" style={{ color: 'var(--ip-text-3)' }} />
      <circle
        cx={70} cy={70} r={56}
        stroke={color} strokeWidth={8} strokeLinecap="round"
        fill="none"
        strokeDasharray={dash}
        transform="rotate(-90 70 70)"
        style={{ filter: `drop-shadow(0 0 6px ${color}66)`, transition: 'stroke-dasharray 500ms ease' }}
      />
    </svg>
  );
}
