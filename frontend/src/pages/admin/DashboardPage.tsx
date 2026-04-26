import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import {
  Building2, Monitor, Ticket, Plus,
  ChevronRight, Play, Pause, Square, Loader2,
  Clock, CheckCircle2, Zap, FileText, HardDrive, AlertTriangle,
  TrendingUp, TrendingDown, Minus, Settings2,
  AlertCircle, UserX, ServerCrash, WifiOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { dashboardApi } from '../../api/dashboard';
import { operatorApi } from '../../api/operator';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import { useAuth } from '../../store/authStore';
import { OnboardingWizard } from '../../components/onboarding/OnboardingWizard';
import { HelpPanel } from '../../components/ui/HelpPanel';
import { helpContent } from '../../config/helpContent';
import { useTheme } from '../../store/themeStore';
import { TicketStatusBadge } from '../../components/ui/StatusBadge';
import { ticketsApi } from '../../api/tickets';
import { tasksApi } from '../../api/tasks';
import { sessionsApi, calcWorkSeconds, type TimeEntry } from '../../api/sessions';
import { agentsApi } from '../../api/agents';
import type { Ticket as ITicket } from '../../types';

/* ── Canvas Ring ─────────────────────────────────────────────── */
function useRing(canvasRef: React.RefObject<HTMLCanvasElement | null>, pct: number, dark: boolean) {
  useEffect(() => {
    let frame = 0;
    let current = 0;
    const target = Math.max(0, Math.min(100, pct || 0));

    const draw = () => {
      const c = canvasRef.current;
      if (!c) return;

      const dpr = window.devicePixelRatio || 1;
      const size = 150;
      // Set drawing buffer only if it changed (avoid clearing during animation)
      if (c.width !== size * dpr) {
        c.width = size * dpr;
        c.height = size * dpr;
        c.style.width = size + 'px';
        c.style.height = size + 'px';
      }
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cx = size / 2, cy = size / 2, r = 58, lw = 8;
      ctx.clearRect(0, 0, size, size);

      // ── Track (background circle) ──
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
      ctx.lineWidth = lw;
      ctx.stroke();

      // ── Progress arc ──
      if (current > 0.5) {
        const angle = (current / 100) * Math.PI * 2;

        // Linear gradient — broadly supported, no conic needed
        let strokeStyle: string | CanvasGradient;
        try {
          const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
          grad.addColorStop(0, dark ? '#4F8CFF' : '#6366F1');
          grad.addColorStop(0.5, dark ? '#8B5CF6' : '#818CF8');
          grad.addColorStop(1, dark ? '#4F8CFF' : '#6366F1');
          strokeStyle = grad;
        } catch {
          strokeStyle = dark ? '#8B5CF6' : '#6366F1';
        }

        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + angle);
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Endpoint dot
        const ex = cx + r * Math.cos(-Math.PI / 2 + angle);
        const ey = cy + r * Math.sin(-Math.PI / 2 + angle);
        ctx.beginPath();
        ctx.arc(ex, ey, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.shadowColor = dark ? '#8B5CF6' : '#818CF8';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    const step = () => {
      current += (target - current) * 0.08;
      if (Math.abs(target - current) < 0.5) current = target;
      try { draw(); } catch { /* canvas not ready — retry next frame */ }
      if (current < target) frame = requestAnimationFrame(step);
    };

    // Draw immediately at 0 so track ring is always visible, then animate
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [pct, dark, canvasRef]);
}

/* ── Timer ────────────────────────────────────────────────────── */
function Timer({ entries = [], paused = false }: { entries?: TimeEntry[]; paused?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (paused) return;
    const i = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(i);
  }, [paused]);

  const total = calcWorkSeconds(entries);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <span className="font-mono text-[26px] font-bold tracking-tight text-ids-t">
      {h > 0 ? `${pad(h)}:` : ''}{pad(m)}:{pad(ss)}
    </span>
  );
}

/* ── Priority colors ─────────────────────────────────────────── */
const P: Record<string, string> = { CRITICAL: '#EF4444', HIGH: '#F59E0B', MEDIUM: '#6366F1', LOW: '#22D3EE' };

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/* ════════════════════════════════════════════════════════════════
   DASHBOARD
   ════════════════════════════════════════════════════════════════ */
export function DashboardPage() {
  const { user } = useAuth();
  const { resolved } = useTheme();
  const { wsType } = useWorkspaceContext();
  const isMsp = wsType === 'msp';
  const dark = resolved === 'dark';
  const qc = useQueryClient();
  const ringRef = useRef<HTMLCanvasElement>(null);

  const { data: stats, isLoading, refetch: refetchDashboard } = useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.getStats });

  // MSP-only: aggregate stats across all client workspaces
  const { data: opStats } = useQuery({
    queryKey: ['operator-stats'],
    queryFn: () => operatorApi.getStats(),
    enabled: isMsp,
    refetchInterval: 60_000,
  });

  // Onboarding wizard
  const [showWizard, setShowWizard] = useState(false);
  const [wizardDismissed, setWizardDismissed] = useState(() => localStorage.getItem('infradesk_onboarding_dismissed') === 'true');

  useEffect(() => {
    if (stats?.onboarding && !stats.onboarding.completed && !wizardDismissed) {
      setShowWizard(true);
    }
  }, [stats?.onboarding, wizardDismissed]);
  const { data: myTasks = [] } = useQuery({ queryKey: ['dashboard-tasks'], queryFn: () => tasksApi.getAll({ all: false }), refetchInterval: 30_000 });
  const { data: pendingTickets = [] } = useQuery({ queryKey: ['dashboard-pending'], queryFn: () => ticketsApi.getAll({ status: 'PENDING' }), refetchInterval: 30_000 });
  const { data: ses, refetch: rSes } = useQuery({ queryKey: ['desktop-active-session'], queryFn: () => sessionsApi.getActive(), refetchInterval: 30_000 });
  const { data: rdActive = [] } = useQuery({ queryKey: ['rustdesk-active'], queryFn: () => agentsApi.getRustdeskActive(), refetchInterval: 15_000 });

  const activeTasks = myTasks.filter(t => t.status !== 'DONE');
  const { widgets, toggle: toggleWidget, reset: resetWidgets } = useDashboardWidgets();
  const [showWidgetConfig, setShowWidgetConfig] = useState(false);
  const overdue = isMsp ? (opStats?.overdueTickets ?? 0) : (stats?.overdueTickets ?? 0);
  const openNow = isMsp ? (opStats?.openTickets ?? 0) : (stats?.openTickets ?? 0);

  // ─── Ring 1: SLA — historical (30d) or live fallback ─────────
  const slaHistoricalAvailable = isMsp && (opStats?.slaSampleSize ?? 0) > 0;
  const slaHistorical = opStats?.slaCompliance ?? 0;
  const slaLive = openNow === 0 ? 100 : Math.max(0, Math.round(((openNow - overdue) / openNow) * 100));
  const slaPct = slaHistoricalAvailable ? slaHistorical : slaLive;
  const slaLabel = slaHistoricalAvailable ? 'W TERMINIE (30 DNI)' : 'W TERMINIE';
  const slaFootnote = slaHistoricalAvailable
    ? `z ${opStats?.slaSampleSize} rozwiązanych`
    : openNow > 0 ? `${openNow - overdue}/${openNow} zgłoszeń` : 'brak otwartych zgłoszeń';

  // ─── Ring 2: Weekly resolved/created ratio ───────────────────
  const weeklyHasData = isMsp && ((opStats?.weeklyCreated ?? 0) > 0 || (opStats?.weeklyResolved ?? 0) > 0);
  const ratioRaw = opStats?.weeklyRatio ?? 0;
  const ratioPct = Math.min(100, ratioRaw);

  useRing(ringRef, slaPct, dark);

  const [ld, setLd] = useState('');
  const act = async (a: 'pause' | 'resume' | 'end') => {
    if (!ses) return;
    setLd(a);
    try {
      if (a === 'pause') await sessionsApi.pause(ses.id);
      if (a === 'resume') await sessionsApi.resume(ses.id);
      if (a === 'end') await sessionsApi.end(ses.id);
      rSes();
      qc.invalidateQueries({ queryKey: ['dashboard-tasks'] });
    } catch {
      toast.error('Błąd');
    }
    setLd('');
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-7 w-7 border-2 border-indigo-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="ids-v3">

      {helpContent.dashboard && <HelpPanel {...helpContent.dashboard} />}

      {/* Widget config drawer */}
      {showWidgetConfig && (
        <WidgetConfigDrawer widgets={widgets} toggle={toggleWidget} reset={resetWidgets} onClose={() => setShowWidgetConfig(false)} />
      )}

      {/* Onboarding Wizard */}
      {showWizard && (
        <OnboardingWizard
          onComplete={() => { setShowWizard(false); setWizardDismissed(true); localStorage.setItem('infradesk_onboarding_dismissed', 'true'); refetchDashboard(); }}
          onSkip={() => { setShowWizard(false); setWizardDismissed(true); localStorage.setItem('infradesk_onboarding_dismissed', 'true'); }}
        />
      )}

      {/* ═══ HERO ═══ */}
      <section className="ids-v3-hero fade-in">
        <div className="ids-v3-hero-hl" />
        <div className="ids-v3-hero-left">
          <span className="ids-v3-hero-greeting">Witaj ponownie</span>
          <h1 className="ids-v3-hero-title">{user?.firstName}, oto Twój panel</h1>
          <div className="ids-v3-hero-status">
            <span className={`ids-v3-hero-dot ${overdue > 0 ? 'warn' : ''}`} />
            <span className="ids-v3-hero-stxt">
              {isMsp
                ? `${opStats?.clientCount ?? 0} firm · ${opStats?.openTickets ?? 0} otwartych · ${overdue} przeterminowanych${(opStats?.activeSessions ?? 0) > 0 ? ` · ${opStats?.activeSessions} aktywnych sesji` : ''}`
                : (overdue > 0 ? `${overdue} przeterminowanych zgłoszeń` : 'Wszystkie systemy sprawne')}
            </span>
          </div>
          <div className="ids-v3-hero-actions">
            <Link to="/tickets" className="ids-v3-btn primary"><Plus className="h-3.5 w-3.5" /> Nowe zgłoszenie</Link>
            {isMsp ? (
              <Link to="/operator/clients" className="ids-v3-btn ghost hidden sm:inline-flex"><Building2 className="h-3.5 w-3.5" /> Klienci</Link>
            ) : (
              <Link to="/devices" className="ids-v3-btn ghost hidden sm:inline-flex"><Monitor className="h-3.5 w-3.5" /> Urządzenia</Link>
            )}
            <button onClick={() => setShowWidgetConfig(true)} className="ids-v3-btn ghost" title="Konfiguruj dashboard">
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="ids-v3-hero-right hidden lg:flex">
          {/* ── Ring 1: SLA ── */}
          <div className="ids-v3-ring-wrap">
            <div className="ids-v3-ring-glow" />
            <div className="ids-v3-ring">
              <canvas ref={ringRef} />
              <div className="ids-v3-ring-center">
                <span className="ids-v3-ring-val">{slaPct}%</span>
                <span className="ids-v3-ring-lbl">{isMsp ? slaLabel : 'W TERMINIE'}</span>
              </div>
            </div>
            <div className="ids-v3-ring-stat">
              <span className="ids-v3-ring-stat-lbl">Jakość obsługi</span>
              <span className={`ids-v3-ring-stat-val ${
                (isMsp ? slaPct < 85 : overdue > 0) ? 'warn' : 'good'
              }`}>
                {isMsp
                  ? (slaPct >= 95 ? 'ŚWIETNIE' : slaPct >= 85 ? 'W NORMIE' : 'UWAGA')
                  : (overdue > 0 ? 'UWAGA' : 'ŚWIETNIE')}
              </span>
              {isMsp && (
                <span style={{ fontSize: 9, color: 'var(--td)', marginTop: 4, maxWidth: 100 }}>
                  {slaFootnote}
                </span>
              )}
            </div>
          </div>

          {/* ── Ring 2: Backupy (MSP only) — SVG ── */}
          {isMsp && (() => {
            const bTotal = opStats?.backupTotal ?? 0;
            const bOk = opStats?.backupSuccess ?? 0;
            const bPct = bTotal > 0 ? Math.round((bOk / bTotal) * 100) : 0;
            const r2 = 58;
            const circ2 = 2 * Math.PI * r2;
            const dash2 = circ2 - (bPct / 100) * circ2;
            const bProblems = (opStats?.backupFailed ?? 0) + (opStats?.backupStale ?? 0);
            return (
              <div className="ids-v3-ring-wrap" style={{ opacity: bTotal > 0 ? 1 : 0.45 }}>
                <div className="ids-v3-ring-glow" />
                <div className="ids-v3-ring">
                  <svg width="150" height="150" viewBox="0 0 150 150" style={{ display: 'block' }}>
                    <defs>
                      <linearGradient id="ids-ring-backup" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={bProblems > 0 ? '#F59E0B' : '#22C55E'} />
                        <stop offset="100%" stopColor={bProblems > 0 ? '#EF4444' : '#4ADE80'} />
                      </linearGradient>
                    </defs>
                    <circle cx="75" cy="75" r={r2} fill="none" stroke={dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} strokeWidth="8" />
                    {bTotal > 0 && bPct > 0 && (
                      <circle cx="75" cy="75" r={r2} fill="none" stroke="url(#ids-ring-backup)" strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={circ2} strokeDashoffset={dash2} transform="rotate(-90 75 75)"
                        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
                    )}
                  </svg>
                  <div className="ids-v3-ring-center">
                    <span className="ids-v3-ring-val">{bTotal > 0 ? `${bPct}%` : '—'}</span>
                    <span className="ids-v3-ring-lbl">BACKUPY</span>
                  </div>
                </div>
                <div className="ids-v3-ring-stat">
                  <span className="ids-v3-ring-stat-lbl">Sukces backupów</span>
                  <span className={`ids-v3-ring-stat-val ${bProblems > 0 ? 'warn' : 'good'}`}>
                    {bTotal === 0 ? 'BRAK' : bProblems > 0 ? 'PROBLEMY' : 'OK'}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--td)', marginTop: 4 }}>
                    {bTotal > 0 ? `${bOk}/${bTotal} poprawnych` : 'Skonfiguruj backup'}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* ── Ring 3: Weekly ratio (MSP only) — SVG ── */}
          {isMsp && (() => {
            const r = 58;
            const circumference = 2 * Math.PI * r;
            const dashOffset = circumference - (ratioPct / 100) * circumference;
            const gradId = 'ids-ring2-grad';
            return (
              <div className="ids-v3-ring-wrap" style={{ opacity: weeklyHasData ? 1 : 0.45 }}>
                <div className="ids-v3-ring-glow" />
                <div className="ids-v3-ring">
                  <svg width="150" height="150" viewBox="0 0 150 150" style={{ display: 'block' }}>
                    <defs>
                      <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={dark ? '#4F8CFF' : '#6366F1'} />
                        <stop offset="50%" stopColor={dark ? '#8B5CF6' : '#818CF8'} />
                        <stop offset="100%" stopColor={dark ? '#4F8CFF' : '#6366F1'} />
                      </linearGradient>
                    </defs>
                    {/* Track */}
                    <circle
                      cx="75" cy="75" r={r}
                      fill="none"
                      stroke={dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
                      strokeWidth="8"
                    />
                    {/* Progress arc */}
                    {weeklyHasData && ratioPct > 0 && (
                      <circle
                        cx="75" cy="75" r={r}
                        fill="none"
                        stroke={`url(#${gradId})`}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        transform="rotate(-90 75 75)"
                        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)' }}
                      />
                    )}
                  </svg>
                  <div className="ids-v3-ring-center">
                    <span className="ids-v3-ring-val">{weeklyHasData ? `${ratioRaw}%` : '—'}</span>
                    <span className="ids-v3-ring-lbl">W TYM TYGODNIU</span>
                  </div>
                </div>
                <div className="ids-v3-ring-stat">
                  <span className="ids-v3-ring-stat-lbl">Tempo pracy</span>
                  <span className={`ids-v3-ring-stat-val ${
                    !weeklyHasData ? '' : ratioRaw >= 100 ? 'good' : 'warn'
                  }`}>
                    {!weeklyHasData ? 'BRAK DANYCH' : ratioRaw >= 100 ? 'NADĄŻASZ' : 'NIE NADĄŻASZ'}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--td)', marginTop: 4, maxWidth: 110 }}>
                    {weeklyHasData
                      ? `Rozwiązane: ${opStats?.weeklyResolved ?? 0} · Nowe: ${opStats?.weeklyCreated ?? 0}`
                      : 'W tym tygodniu brak zgłoszeń'}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* ═══ SESSION (conditional) ═══ */}
      {ses && (() => {
        const on = ses.status === 'ACTIVE';
        return (
          <section className="ids-v3-session fade-in fade-in-1">
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ids-tm">
                {on ? 'Sesja aktywna' : 'Wstrzymana'}
              </span>
            </div>
            <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>
                <Timer entries={ses.timeEntries} paused={!on} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate text-ids-t">{ses.location?.name || ses.device?.name || 'Sesja'}</p>
                {ses.ticket && <p className="text-[11px] mt-0.5 truncate text-ids-tm">{ses.ticket.ticketNumber}: {ses.ticket.title}</p>}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {on ? (<>
                  <button onClick={() => act('pause')} disabled={!!ld} className="ids-v3-btn ghost text-amber-500">
                    {ld === 'pause' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />} Wstrzymaj
                  </button>
                  <button onClick={() => act('end')} disabled={!!ld} className="ids-v3-btn ghost text-red-400">
                    <Square className="h-3.5 w-3.5" /> Zakończ
                  </button>
                </>) : (<>
                  <button onClick={() => act('resume')} disabled={!!ld} className="ids-v3-btn primary">
                    {ld === 'resume' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Wznów
                  </button>
                  <button onClick={() => act('end')} disabled={!!ld} className="ids-v3-btn ghost text-red-400">
                    <Square className="h-3.5 w-3.5" /> Zakończ
                  </button>
                </>)}
              </div>
            </div>
          </section>
        );
      })()}

      {/* ═══ RUSTDESK ACTIVE SESSIONS ═══ */}
      {rdActive.length > 0 && (
        <section className="rounded-2xl p-5 fade-in fade-in-1" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>
              RustDesk — {rdActive.length} aktywn{rdActive.length === 1 ? 'a' : rdActive.length < 5 ? 'e' : 'ych'} sesj{rdActive.length === 1 ? 'a' : rdActive.length < 5 ? 'e' : 'i'}
            </span>
          </div>
          <div className="space-y-2">
            {rdActive.map((s: any) => {
              const h = Math.floor(s.durationMin / 60);
              const m = s.durationMin % 60;
              const timeStr = h > 0 ? `${h}h ${m}min` : `${m}min`;
              return (
                <div key={s.connGuid} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(16,185,129,0.1)' }}>
                    <Monitor className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--t)' }}>{s.remoteName}</span>
                      {s.deviceName && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.1)', color: '#818CF8' }}>{s.deviceName}</span>}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--tm)' }}>
                      {s.techName} → {s.rustdeskId} {s.remoteIp ? `(${s.remoteIp.replace('::ffff:','')})` : ''}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono text-sm font-bold" style={{ color: '#4ADE80' }}>{timeStr}</div>
                    <div className="text-[10px]" style={{ color: 'var(--td)' }}>≈ {s.billedMin}min naliczenia</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══ KPI STRIP — compact inline ═══ */}
      {widgets.kpi && (() => {
        const t = isMsp ? opStats?.trends : stats?.trends;
        const createdToday = t?.createdToday ?? 0;
        const createdYest = t?.createdYesterday ?? 0;
        const closedToday = t?.closedToday ?? 0;
        const closedYest = t?.closedYesterday ?? 0;
        const avgResp = isMsp ? opStats?.avgResponseHours : null;
        const openNowVal = isMsp ? (opStats?.openTickets ?? 0) : (stats?.openTickets ?? 0);
        const critVal = isMsp ? (opStats?.criticalTickets ?? 0) : 0;
        const unassVal = isMsp ? (opStats?.unassignedTickets ?? 0) : (stats?.unassignedTickets ?? 0);
        const agOn = isMsp ? (opStats?.agentsOnline ?? 0) : 0;
        const agAll = isMsp ? (opStats?.agentCount ?? 0) : 0;
        const devCount = isMsp ? (opStats?.deviceCount ?? 0) : (stats?.totalDevices ?? 0);

        const items: { label: string; value: React.ReactNode; sub?: React.ReactNode; color: string; to: string }[] = [
          { label: 'Otwarte', value: openNowVal, sub: overdue > 0 ? <span style={{ color: '#F87171' }}>{overdue} przeter.</span> : critVal > 0 ? <span style={{ color: '#F87171' }}>{critVal} kryt.</span> : null, color: '#818CF8', to: '/tickets' },
          { label: 'Nowe dziś', value: createdToday, sub: <><TrendArrow current={createdToday} previous={createdYest} invert /> <span style={{ color: 'var(--td)', marginLeft: 2 }}>wcz. {createdYest}</span></>, color: '#4F8CFF', to: '/tickets' },
          { label: 'Zamknięte', value: closedToday, sub: <><TrendArrow current={closedToday} previous={closedYest} /> <span style={{ color: 'var(--td)', marginLeft: 2 }}>wcz. {closedYest}</span></>, color: '#4ADE80', to: '/tickets' },
          ...(isMsp ? [
            { label: 'Śr. reakcja', value: avgResp != null ? `${avgResp}h` : '—', sub: <span style={{ color: (avgResp ?? 99) <= 4 ? '#4ADE80' : '#FBBF24' }}>{(avgResp ?? 99) <= 2 ? 'szybko' : (avgResp ?? 99) <= 4 ? 'OK' : 'wolno'}</span>, color: '#A78BFA', to: '/tickets' },
            { label: 'Nieprzypisane', value: unassVal, sub: null, color: '#FBBF24', to: '/tickets?status=PENDING' },
            { label: 'Asystenci', value: `${agOn}/${agAll}`, sub: agAll - agOn > 0 ? <span style={{ color: '#F87171' }}>{agAll - agOn} off</span> : <span style={{ color: '#4ADE80' }}>online</span>, color: '#5EEAD4', to: '/agents' },
          ] : [
            { label: 'Urządzenia', value: devCount, sub: <span style={{ color: '#4ADE80' }}>{slaPct}% SLA</span>, color: '#5EEAD4', to: '/devices' },
            { label: 'Oczekujące', value: unassVal, sub: null, color: '#FBBF24', to: '/tickets?status=PENDING' },
          ]),
        ];

        return (
          <section className="fade-in fade-in-1" style={{
            display: 'flex', gap: 0, borderRadius: 14, overflow: 'hidden',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            flexWrap: 'wrap',
          }}>
            {items.map((it, i) => (
              <Link key={i} to={it.to} style={{
                flex: '1 1 0', minWidth: 100, padding: '14px 16px',
                borderRight: i < items.length - 1 ? '1px solid var(--border)' : 'none',
                textDecoration: 'none', transition: 'background .15s', display: 'flex', flexDirection: 'column', gap: 2,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: it.color, flexShrink: 0, boxShadow: `0 0 6px ${it.color}40` }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{it.label}</span>
                </div>
                <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--t)', letterSpacing: '-0.03em', lineHeight: 1 }}>{it.value}</span>
                {it.sub && <span style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>{it.sub}</span>}
              </Link>
            ))}
          </section>
        );
      })()}

      {/* ═══ ATTENTION BAR ═══ */}
      {widgets.attention && (() => {
        const alerts: { icon: React.ReactNode; label: string; color: string; to: string }[] = [];
        const od = isMsp ? (opStats?.overdueTickets ?? 0) : (stats?.overdueTickets ?? 0);
        const unassigned = isMsp ? (opStats?.unassignedTickets ?? 0) : (stats?.unassignedTickets ?? 0);
        const bFailed = isMsp ? ((opStats?.backupFailed ?? 0) + (opStats?.backupStale ?? 0)) : 0;
        const agOff = isMsp ? Math.max(0, (opStats?.agentCount ?? 0) - (opStats?.agentsOnline ?? 0)) : 0;

        if (od > 0) alerts.push({ icon: <AlertCircle className="h-3.5 w-3.5" />, label: `${od} przeterminowanych SLA`, color: '#EF4444', to: '/tickets?status=overdue' });
        if (unassigned > 0) alerts.push({ icon: <UserX className="h-3.5 w-3.5" />, label: `${unassigned} nieprzypisanych`, color: '#F59E0B', to: '/tickets?status=PENDING' });
        if (bFailed > 0) alerts.push({ icon: <ServerCrash className="h-3.5 w-3.5" />, label: `${bFailed} backupów z problemem`, color: '#F97316', to: '/backups' });
        if (agOff > 0) alerts.push({ icon: <WifiOff className="h-3.5 w-3.5" />, label: `${agOff} asystentów offline`, color: '#8B5CF6', to: '/agents' });

        if (!alerts.length) return (
          <div className="fade-in fade-in-1" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)' }}>
            <CheckCircle2 className="h-4 w-4" style={{ color: '#4ADE80' }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: '#4ADE80' }}>Wszystko pod kontrolą — brak alertów</span>
          </div>
        );

        return (
          <div className="fade-in fade-in-1" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {alerts.map((a, i) => (
              <Link key={i} to={a.to} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 500,
                color: a.color, background: `${a.color}0A`, border: `1px solid ${a.color}1A`,
                transition: 'transform .15s, box-shadow .15s', textDecoration: 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 4px 12px ${a.color}20`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
              >
                {a.icon} {a.label}
              </Link>
            ))}
          </div>
        );
      })()}

      {/* ═══ LOWER GRID ═══ */}
      <div className="ids-v3-grid fade-in fade-in-2">

        {/* ── LEFT column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap, 16px)' }}>
          {widgets.tickets && <TicketTableSection isMsp={isMsp} opStats={opStats} stats={stats} pendingTickets={pendingTickets} />}

          {/* 7-day chart */}
          {widgets.chart && (
            <section className="ids-v3-card">
              <div className="ids-v3-card-head">
                <h2 className="ids-v3-card-title"><TrendingUp className="h-4 w-4 text-ids-accent" /> Ostatnie 7 dni</h2>
              </div>
              <WeekChart data={isMsp ? opStats?.chartData : stats?.chartData} />
            </section>
          )}
        </div>

        {/* ── RIGHT: Aside stack ── */}
        <div className="ids-v3-aside">

          {/* Health grid */}
          {widgets.health && (
            <section className="ids-v3-card">
              <div className="ids-v3-card-head">
                <h3 className="ids-v3-card-title"><Zap className="h-4 w-4 text-amber-400" /> Status systemu</h3>
              </div>
              <div className="ids-v3-health">
                <HealthItem color="#4ADE80" label="Asystenci online" value={isMsp ? `${opStats?.agentsOnline ?? 0}/${opStats?.agentCount ?? 0}` : `${slaPct}%`} />
                <HealthItem color={overdue > 0 ? '#FB923C' : '#4ADE80'} label="Przeterminowane" value={overdue} />
                <HealthItem color="#22D3EE" label="Oczekujące" value={pendingTickets.length} />
                <HealthItem color="#8B5CF6" label="Moje zadania" value={activeTasks.length} />
              </div>
            </section>
          )}

          {/* Upcoming deadlines */}
          {widgets.deadlines && <section className="ids-v3-card">
            <div className="ids-v3-card-head">
              <h3 className="ids-v3-card-title"><AlertTriangle className="h-4 w-4 text-amber-400" /> Nadchodzące terminy</h3>
            </div>
            <div className="ids-v3-tasks">
              {(() => {
                const deadlines: any[] = isMsp ? (opStats?.upcomingDeadlines ?? []) : (stats?.upcomingDeadlines ?? []);
                if (!deadlines.length) return <p className="ids-v3-empty">Brak nadchodzących terminów</p>;
                return deadlines.slice(0, 5).map((tk: any) => {
                  const hoursLeft = Math.max(0, Math.round((new Date(tk.dueAt).getTime() - Date.now()) / 3600000));
                  const urgent = hoursLeft < 24;
                  return (
                    <Link key={tk.id} to={`/tickets/${tk.id}`} className="ids-v3-task-row">
                      <div className="ids-v3-task-bar" style={{ background: urgent ? '#EF4444' : '#F59E0B' }} />
                      <div className="ids-v3-task-body">
                        <div className="ids-v3-task-title">{tk.title}</div>
                        <div className="ids-v3-task-meta">
                          {tk.ticketNumber} · za {hoursLeft < 24 ? `${hoursLeft}h` : `${Math.round(hoursLeft / 24)}d`}
                          {isMsp && tk.workspace?.name ? ` · ${tk.workspace.name}` : ''}
                        </div>
                      </div>
                    </Link>
                  );
                });
              })()}
            </div>
          </section>}

          {/* My tasks */}
          {widgets.tasks && <section className="ids-v3-card">
            <div className="ids-v3-card-head">
              <h3 className="ids-v3-card-title"><CheckCircle2 className="h-4 w-4 text-indigo-400" /> Moje zadania</h3>
              <span className="ids-v3-badge indigo">{activeTasks.length}</span>
            </div>
            <div className="ids-v3-tasks">
              {activeTasks.slice(0, 4).map(tk => (
                <Link key={tk.id} to={tk.ticketId ? `/tickets/${tk.ticketId}` : '/tasks'} className="ids-v3-task-row">
                  <div className="ids-v3-task-bar" style={{ background: P[tk.ticket?.priority ?? 'MEDIUM'] ?? '#6366F1' }} />
                  <div className="ids-v3-task-body">
                    <div className="ids-v3-task-title">{tk.title}</div>
                    <div className="ids-v3-task-meta">{tk.ticket?.location?.name || '—'} · {tk.taskNumber}</div>
                  </div>
                </Link>
              ))}
              {!activeTasks.length && <p className="ids-v3-empty">Brak aktywnych zadań</p>}
            </div>
          </section>}
          {/* Activity feed */}
          {widgets.activity && <section className="ids-v3-card">
            <div className="ids-v3-card-head">
              <h3 className="ids-v3-card-title"><Zap className="h-4 w-4 text-emerald-400" /> Ostatnio zamknięte</h3>
            </div>
            <div className="ids-v3-tasks">
              {(() => {
                const acts: any[] = isMsp ? (opStats?.recentActivity ?? []) : (stats?.recentActivity ?? []);
                if (!acts.length) return <p className="ids-v3-empty">Brak aktywności</p>;
                return acts.slice(0, 5).map((a: any) => (
                  <Link key={a.id} to={`/tickets/${a.id}`} className="ids-v3-task-row">
                    <div className="ids-v3-task-bar" style={{ background: '#4ADE80' }} />
                    <div className="ids-v3-task-body">
                      <div className="ids-v3-task-title">{a.title}</div>
                      <div className="ids-v3-task-meta">
                        {a.assignedTo ? `${a.assignedTo.firstName} ${a.assignedTo.lastName}` : '—'}
                        {' · '}{timeAgo(a.resolvedAt)}
                        {isMsp && a.workspace?.name ? ` · ${a.workspace.name}` : ''}
                      </div>
                    </div>
                  </Link>
                ));
              })()}
            </div>
          </section>}
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard widget config ── */
const WIDGET_DEFS = [
  { key: 'kpi', label: 'Kafelki KPI', default: true },
  { key: 'attention', label: 'Pasek alertów', default: true },
  { key: 'tickets', label: 'Tabela zgłoszeń', default: true },
  { key: 'chart', label: 'Wykres 7 dni', default: true },
  { key: 'health', label: 'Status systemu', default: true },
  { key: 'deadlines', label: 'Nadchodzące terminy', default: true },
  { key: 'tasks', label: 'Moje zadania', default: true },
  { key: 'activity', label: 'Ostatnio zamknięte', default: true },
] as const;

type WidgetKey = typeof WIDGET_DEFS[number]['key'];

function useDashboardWidgets() {
  const [widgets, setWidgets] = useState<Record<WidgetKey, boolean>>(() => {
    try {
      const saved = localStorage.getItem('infradesk_dashboard_widgets');
      if (saved) return JSON.parse(saved);
    } catch {}
    return Object.fromEntries(WIDGET_DEFS.map(w => [w.key, w.default])) as Record<WidgetKey, boolean>;
  });

  const toggle = (key: WidgetKey) => {
    setWidgets(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('infradesk_dashboard_widgets', JSON.stringify(next));
      return next;
    });
  };

  const reset = () => {
    const defaults = Object.fromEntries(WIDGET_DEFS.map(w => [w.key, w.default])) as Record<WidgetKey, boolean>;
    setWidgets(defaults);
    localStorage.removeItem('infradesk_dashboard_widgets');
  };

  return { widgets, toggle, reset };
}

function WidgetConfigDrawer({ widgets, toggle, reset, onClose }: {
  widgets: Record<WidgetKey, boolean>; toggle: (k: WidgetKey) => void; reset: () => void; onClose: () => void;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 320, maxWidth: '90vw',
        background: 'var(--bg-card, #1a1a2e)', borderLeft: '1px solid var(--border)',
        zIndex: 51, padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
        boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>Konfiguracja dashboardu</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--td)', cursor: 'pointer', fontSize: 18 }}>&times;</button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--td)', margin: 0 }}>Włącz lub wyłącz widgety na dashboardzie.</p>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {WIDGET_DEFS.map(w => (
            <label key={w.key} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              borderRadius: 10, cursor: 'pointer', transition: 'background .15s',
              background: widgets[w.key] ? 'rgba(99,102,241,0.06)' : 'transparent',
              border: '1px solid ' + (widgets[w.key] ? 'rgba(99,102,241,0.15)' : 'var(--border)'),
            }}>
              <div onClick={(e) => { e.preventDefault(); toggle(w.key); }} style={{
                width: 36, height: 20, borderRadius: 10, padding: 2,
                background: widgets[w.key] ? '#6366F1' : 'var(--hover-bg)',
                transition: 'background .2s', cursor: 'pointer', flexShrink: 0,
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transform: widgets[w.key] ? 'translateX(16px)' : 'translateX(0)',
                  transition: 'transform .2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ts)' }}>{w.label}</span>
            </label>
          ))}
        </div>
        <button onClick={reset} style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--td)', fontSize: 11, cursor: 'pointer',
          fontWeight: 500, transition: 'all .15s',
        }}>
          Resetuj do domyślnych
        </button>
      </div>
    </>
  );
}

/* ── Mini 7-day chart ── */
function WeekChart({ data }: { data?: { date: string; created: number; closed: number }[] }) {
  if (!data?.length) return null;
  const max = Math.max(1, ...data.map(d => Math.max(d.created, d.closed)));
  const w = 100, h = 40, pad = 2;
  const dayNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];

  const toPath = (vals: number[]) => {
    const step = (w - pad * 2) / (vals.length - 1);
    return vals.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v / max) * (h - pad * 2));
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  };

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, fontSize: 10, color: 'var(--td)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 2, borderRadius: 1, background: '#818CF8' }} /> Nowe
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 2, borderRadius: 1, background: '#4ADE80' }} /> Zamknięte
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 80 }} preserveAspectRatio="none">
        <path d={toPath(data.map(d => d.created))} fill="none" stroke="#818CF8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={toPath(data.map(d => d.closed))} fill="none" stroke="#4ADE80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => {
          const step = (w - pad * 2) / (data.length - 1);
          const x = pad + i * step;
          return <circle key={`c${i}`} cx={x} cy={h - pad - ((d.created / max) * (h - pad * 2))} r="1.5" fill="#818CF8" />;
        })}
        {data.map((d, i) => {
          const step = (w - pad * 2) / (data.length - 1);
          const x = pad + i * step;
          return <circle key={`r${i}`} cx={x} cy={h - pad - ((d.closed / max) * (h - pad * 2))} r="1.5" fill="#4ADE80" />;
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--td)', marginTop: 2, padding: '0 2px' }}>
        {data.map(d => {
          const day = new Date(d.date + 'T00:00:00');
          return <span key={d.date}>{dayNames[day.getDay()]}</span>;
        })}
      </div>
    </div>
  );
}

/* ── Ticket table with tabs ── */
function TicketTableSection({ isMsp, opStats, stats, pendingTickets }: { isMsp: boolean; opStats: any; stats: any; pendingTickets: any[] }) {
  const [tab, setTab] = useState<'action' | 'recent'>('action');
  const navigate = useNavigate();

  const recentTickets: any[] = isMsp ? (opStats?.recentTickets ?? []) : (stats?.recentTickets ?? []);

  // "Wymaga akcji" — overdue + unassigned + pending
  const actionTickets = (() => {
    const all = recentTickets;
    const now = Date.now();
    // Sort: overdue first, then by priority
    const prioOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...all].filter(tk =>
      ['NEW', 'PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(tk.status)
    ).sort((a, b) => {
      const aOver = a.dueAt && new Date(a.dueAt).getTime() < now ? 0 : 1;
      const bOver = b.dueAt && new Date(b.dueAt).getTime() < now ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      return (prioOrder[a.priority] ?? 2) - (prioOrder[b.priority] ?? 2);
    });
  })();

  const tickets = tab === 'action' ? actionTickets : recentTickets;

  const thStyle: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' };
  const tdStyle: React.CSSProperties = { padding: '9px 10px', whiteSpace: 'nowrap', fontSize: 12 };

  return (
    <section className="ids-v3-card">
      <div className="ids-v3-card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {(['action', 'recent'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 14px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: tab === t ? 'var(--accent, #6366F1)' : 'transparent',
              color: tab === t ? '#fff' : 'var(--td)',
              transition: 'all .15s',
            }}>
              {t === 'action' ? 'Wymaga akcji' : 'Ostatnie'}
              {t === 'action' && actionTickets.length > 0 && (
                <span style={{ marginLeft: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>
                  {actionTickets.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <Link to="/tickets" className="ids-v3-link" style={{ marginLeft: 'auto' }}>Wszystkie <ChevronRight className="h-3 w-3" /></Link>
      </div>
      {!tickets.length ? <p className="ids-v3-empty">{tab === 'action' ? 'Brak zgłoszeń wymagających uwagi' : 'Brak zgłoszeń'}</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...thStyle, paddingLeft: 16 }}>Nr</th>
                {isMsp && <th style={thStyle}>Firma</th>}
                <th style={thStyle}>Tytuł</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Priorytet</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Technik</th>
                {tab === 'action' && <th style={{ ...thStyle, textAlign: 'center' }}>SLA</th>}
                <th style={{ ...thStyle, textAlign: 'right', paddingRight: 16 }}>Czas</th>
              </tr>
            </thead>
            <tbody>
              {tickets.slice(0, 10).map((tk: any) => {
                const now = Date.now();
                const isOverdue = tk.dueAt && new Date(tk.dueAt).getTime() < now;
                const slaLeft = tk.dueAt ? Math.max(0, new Date(tk.dueAt).getTime() - now) : null;
                const slaHours = slaLeft != null ? Math.round(slaLeft / 3600000 * 10) / 10 : null;

                return (
                  <tr key={tk.id} onClick={() => navigate(`/tickets/${tk.id}`)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg, rgba(255,255,255,0.02))')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ ...tdStyle, paddingLeft: 16, color: 'var(--td)', fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
                      {tk.ticketNumber}
                    </td>
                    {isMsp && (
                      <td style={{ ...tdStyle, color: 'var(--ts)', fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tk.workspace?.name ?? '—'}
                      </td>
                    )}
                    <td style={{ ...tdStyle, color: 'var(--ts)', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {tk.title}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: P[tk.priority] ?? '#6366F1',
                        boxShadow: `0 0 6px ${P[tk.priority] ?? '#6366F1'}40`,
                      }} title={tk.priority} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <TicketStatusBadge status={tk.status} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontSize: 11, color: tk.assignedTo ? 'var(--ts)' : 'var(--td)' }}>
                      {tk.assignedTo ? `${tk.assignedTo.firstName?.[0] ?? ''}${tk.assignedTo.lastName?.[0] ?? ''}` : '—'}
                    </td>
                    {tab === 'action' && (
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {tk.dueAt ? (
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                            background: isOverdue ? 'rgba(239,68,68,0.1)' : slaHours != null && slaHours < 4 ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.08)',
                            color: isOverdue ? '#F87171' : slaHours != null && slaHours < 4 ? '#FBBF24' : '#4ADE80',
                          }}>
                            {isOverdue ? 'PRZETER.' : `${slaHours}h`}
                          </span>
                        ) : <span style={{ fontSize: 10, color: 'var(--td)' }}>—</span>}
                      </td>
                    )}
                    <td style={{ ...tdStyle, textAlign: 'right', paddingRight: 16, color: 'var(--td)', fontSize: 11 }}>
                      {timeAgo(tk.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── Trend arrow component ── */
function TrendArrow({ current, previous, invert }: { current: number; previous: number; invert?: boolean }) {
  const diff = current - previous;
  if (diff === 0 || previous === 0) return <span style={{ fontSize: 10, color: 'var(--td)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><Minus className="h-3 w-3" /> —</span>;
  const up = diff > 0;
  const good = invert ? !up : up;
  const color = good ? '#4ADE80' : '#F87171';
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <Icon className="h-3 w-3" /> {up ? '+' : ''}{diff}
    </span>
  );
}

/* ── Reusable health item ── */
function HealthItem({ color, label, value }: { color: string; label: string; value: string | number }) {
  return (
    <div className="ids-v3-health-item">
      <div className="ids-v3-health-dot" style={{ background: color, boxShadow: `0 0 6px ${color}66` }} />
      <div>
        <div className="ids-v3-health-lbl">{label}</div>
        <div className="ids-v3-health-val">{value}</div>
      </div>
    </div>
  );
}
