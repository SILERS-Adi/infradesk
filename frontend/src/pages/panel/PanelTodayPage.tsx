/**
 * PanelTodayPage — migrated to foundation primitives.
 * Uses: Card, CardHeader, StatCard, ListRow, EmptyState, IconContainer,
 *       Badge, Button, IdoAvatar (all from ui/primitives).
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import { useWorkspace } from '../../store/workspaceStore';
import { panelApi, type PanelPulse, type PanelTiles, type PanelActivityItem } from '../../api/panel';
import { devicesApi } from '../../api/devices';
import apiClient from '../../api/client';
import { IdCore, idCoreMessage, type IdCoreStatus } from '../../components/panel/IdCore';
import {
  Card, CardHeader, StatCard, ListRow, EmptyState, IconContainer, Badge, IdoAvatar,
} from '../../ui/primitives';
import {
  Ticket, MonitorUp, HardDrive, RefreshCw, Printer, KeyRound, Zap, Bot,
  CheckCircle2, AlertTriangle, Shield, Wifi, Globe, Server, Activity,
} from 'lucide-react';

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

  const statusTone: 'ok' | 'warn' | 'bad' | 'gray' =
    status === 'critical' ? 'bad' : status === 'warning' ? 'warn' : status === 'offline' ? 'gray' : 'ok';

  return (
    <>
      {/* ═════ TOP ROW ═════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr 0.9fr', gap: 24 }} className="panel-grid-top">
        {/* Status Systemu */}
        <Card>
          <CardHeader
            title="Status systemu"
            subtitle="Przegląd infrastruktury IT"
            action={<Badge tone={statusTone} live>{status === 'critical' ? 'Critical' : status === 'warning' ? 'Warning' : status === 'offline' ? 'Offline' : 'OK'}</Badge>}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--ip-text)', marginBottom: 8 }}>
                {status === 'critical' ? 'Wymagana interwencja' : status === 'warning' ? 'Wykryto uwagi' : 'System działa poprawnie'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ip-text-2)', lineHeight: 1.55 }}>
                {status === 'ok' && `Wszystkie systemy stabilne. Ostatnia synchronizacja ${fmt(lastUpdate?.toISOString())}`}
                {status === 'warning' && `Wykryto ${activeAlerts} alertów wymagających sprawdzenia.`}
                {status === 'critical' && `Krytyczne problemy (${activeAlerts}). Skontaktuj się z IT.`}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <StatCard
                label="Urządzenia"
                value={devicesOnline}
                unit={` / ${devicesTotal}`}
                sub="online teraz"
              />
              <StatCard
                label="Online"
                value={`${onlinePercent}%`}
                valueTone={onlinePercent === 100 ? 'ok' : onlinePercent >= 80 ? 'default' : 'warn'}
                sub={`${pulse?.metrics.openTickets ?? 0} aktywnych zgłoszeń`}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
              <Link to="/panel/tickets?new=1" className="ui-btn ui-btn--primary ui-btn--lg" style={{ flex: 1 }}>
                <Ticket size={14} strokeWidth={2.2} /> Zgłoś problem
              </Link>
              <Link to="/panel/ido" className="ui-btn ui-btn--secondary ui-btn--lg" style={{ flex: 1 }}>
                <Zap size={14} strokeWidth={2.2} /> Pomoc zdalna
              </Link>
            </div>
          </div>
        </Card>

        {/* ID CORE */}
        <Card hero style={{ alignItems: 'center', textAlign: 'center', minHeight: 360 }}>
          <CardHeader
            title="ID CORE"
            subtitle={status === 'offline' ? 'Stan systemu offline' : 'Stan systemu online'}
            action={<Badge tone={aiActive ? 'blue' : 'gray'} live={aiActive}>AI {aiActive ? 'Active' : 'Idle'}</Badge>}
          />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 0' }}>
            <IdCore score={score} status={status} aiActive={aiActive} alerts={activeAlerts} devicesOnline={devicesOnline} size={280} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--ip-text)', fontWeight: 500, marginTop: 10 }}>{coreMessage}</div>
          <div style={{ fontSize: 11, color: 'var(--ip-text-3)', marginTop: 4, fontFamily: 'var(--ip-font-mono)', letterSpacing: '0.08em' }}>
            {status === 'ok' && (aiActive ? 'Skanowanie w toku…' : 'Ochrona aktywna · monitoring 24/7')}
            {status === 'warning' && `${activeAlerts} alertów do sprawdzenia`}
            {status === 'critical' && 'Natychmiastowa uwaga wymagana'}
          </div>
        </Card>

        {/* Informacje */}
        <Card>
          <CardHeader title="Informacje" subtitle="Twoja firma" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            <div style={{ padding: '12px 14px', background: 'var(--ip-surface-tile)', border: 'var(--ip-border)', borderRadius: 'var(--ip-r-md)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ip-text)', marginBottom: 4 }}>{currentWs?.name ?? '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--ip-text-3)' }}>
                {((currentWs as any) ?? {}).taxId ? `NIP: ${(currentWs as any).taxId} · ` : ''}
                Zalogowany: <strong style={{ color: 'var(--ip-text)', fontWeight: 600 }}>{user?.firstName} {user?.lastName}</strong>
              </div>
            </div>
            {[
              { icon: <Server size={12} />, label: 'Urządzenia', val: `${devicesOnline}/${devicesTotal} online` },
              { icon: <Shield size={12} />, label: 'Bezpieczeństwo', val: `${score}/100` },
              { icon: <Wifi size={12} />, label: 'Zgłoszenia', val: `${pulse?.metrics.openTickets ?? 0} otwarte` },
              { icon: <Globe size={12} />, label: 'Alerty', val: activeAlerts, tone: activeAlerts > 0 ? 'warn' : undefined },
            ].map(r => (
              <div key={r.label as string} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', background: 'var(--ip-surface-tile)', border: 'var(--ip-border)',
                borderRadius: 'var(--ip-r-md)', fontSize: 12,
              }}>
                <span style={{ color: 'var(--ip-text-3)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--ip-blue-hi)' }}>{r.icon}</span>{r.label}
                </span>
                <span style={{
                  color: r.tone === 'warn' ? 'var(--ip-warn)' : 'var(--ip-text)',
                  fontWeight: 600, fontFamily: 'var(--ip-font-mono)',
                }}>{r.val}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ═════ BOTTOM ROW ═════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }} className="panel-grid-bot">
        {/* Szybkie akcje */}
        <Card>
          <CardHeader title="Szybkie akcje" subtitle="Najczęstsze operacje" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1 }}>
            {[
              { to: '/panel/ido', icon: <HardDrive size={18} />, title: 'Miejsce na dysku', sub: 'Sprawdź i zwolnij' },
              { to: '/panel/ido', icon: <RefreshCw size={18} />, title: 'Aktualizacje',     sub: 'Status Windows' },
              { to: '/panel/ido', icon: <Printer size={18} />,   title: 'Drukarka',         sub: 'Nie drukuje? Przywróć' },
              { to: '/panel/vault', icon: <KeyRound size={18} />, title: 'Hasła',           sub: 'Mój vault' },
            ].map(a => (
              <Link key={a.title} to={a.to} className="ui-card ui-card--sm ui-card--interactive" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <IconContainer size="sm">{a.icon}</IconContainer>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ip-text)' }}>{a.title}</div>
                <div style={{ fontSize: 11, color: 'var(--ip-text-3)' }}>{a.sub}</div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Aktywność AI */}
        <Card>
          <CardHeader
            title="Aktywność AI"
            subtitle="Ostatnie operacje systemu"
            action={<Link to="/panel/activity" className="ui-btn ui-btn--ghost ui-btn--sm">Wszystkie</Link>}
          />
          <div style={{ flex: 1 }}>
            {activity.length === 0 ? (
              <EmptyState
                icon={<Activity size={28} strokeWidth={1.8} />}
                title="System stabilny"
                sub="AI monitoruje workspace 24/7"
              />
            ) : (
              <div>
                {activity.slice(0, 6).map(a => (
                  <div key={a.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--ip-border)', alignItems: 'flex-start' }}>
                    <IconContainer size="sm"><Bot size={14} strokeWidth={2} /></IconContainer>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ip-text)', lineHeight: 1.35 }}>{a.description}</div>
                      <div style={{ fontSize: 11, color: 'var(--ip-text-3)', marginTop: 3, fontFamily: 'var(--ip-font-mono)' }}>
                        {a.by ? `${a.by} · ` : ''}{fmt(a.at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Bezpieczeństwo */}
        <Card style={{ alignItems: 'center', textAlign: 'center' }}>
          <CardHeader
            title="Bezpieczeństwo"
            subtitle="Ocena kondycji systemu"
            action={<Link to="/panel/security" className="ui-btn ui-btn--ghost ui-btn--sm">Szczegóły</Link>}
          />
          <div style={{ position: 'relative', width: 140, height: 140, margin: '12px auto' }}>
            <SecurityRing score={score} status={status} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--ip-text)', letterSpacing: '-0.025em' }}>
                {score}<span style={{ fontSize: 14, color: 'var(--ip-text-3)', fontWeight: 500 }}>/100</span>
              </div>
              <small style={{ fontSize: 10, color: 'var(--ip-text-3)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--ip-font-mono)', marginTop: 4 }}>score</small>
            </div>
          </div>
          <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
            {[
              { icon: <CheckCircle2 size={11} />, tone: 'ok', label: 'Urządzeń online', val: `${devicesOnline}/${devicesTotal}` },
              { icon: <AlertTriangle size={11} />, tone: activeAlerts > 0 ? 'warn' : 'gray', label: 'Aktywne alerty', val: activeAlerts },
              { icon: <Shield size={11} />, tone: 'blue', label: 'Zgłoszenia', val: pulse?.metrics.openTickets ?? 0 },
              { icon: <MonitorUp size={11} />, tone: 'blue', label: 'Ost. skan', val: fmt(lastUpdate?.toISOString()) },
            ].map(r => (
              <div key={r.label as string} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', background: 'var(--ip-surface-tile)',
                border: 'var(--ip-border)', borderRadius: 'var(--ip-r-md)', fontSize: 12,
              }}>
                <span style={{ color: 'var(--ip-text-3)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: r.tone === 'ok' ? 'var(--ip-ok)' : r.tone === 'warn' ? 'var(--ip-warn)' : 'var(--ip-blue-hi)' }}>{r.icon}</span>
                  {r.label}
                </span>
                <span style={{
                  color: r.tone === 'warn' ? 'var(--ip-warn)' : 'var(--ip-text)',
                  fontWeight: 600, fontFamily: 'var(--ip-font-mono)',
                }}>{r.val}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <style>{`
        @media (max-width: 1200px) { .panel-grid-top { grid-template-columns: 1fr 1fr !important; } .panel-grid-bot { grid-template-columns: 1fr 1fr !important; } }
        @media (max-width: 768px)  { .panel-grid-top, .panel-grid-bot { grid-template-columns: 1fr !important; } }
      `}</style>

      {/* Idle IDO avatar demonstration — shows the new 3-layer orb in context */}
      <div style={{ display: 'none' }}><IdoAvatar size="lg" /></div>
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
      <circle cx={70} cy={70} r={56} stroke={color} strokeWidth={8} strokeLinecap="round" fill="none" strokeDasharray={dash} transform="rotate(-90 70 70)" style={{ filter: `drop-shadow(0 0 6px ${color}66)`, transition: 'stroke-dasharray 500ms ease' }} />
    </svg>
  );
}
