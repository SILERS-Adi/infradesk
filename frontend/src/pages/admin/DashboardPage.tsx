import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Building2, Monitor, Ticket, Plus,
  ChevronRight, Play, Pause, Square, Loader2,
  Clock, CheckCircle2, Zap, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { dashboardApi } from '../../api/dashboard';
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
    const target = pct;

    const step = () => {
      current += (target - current) * 0.06;
      if (Math.abs(target - current) < 0.5) current = target;

      const c = canvasRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const size = 150;
      c.width = size * dpr;
      c.height = size * dpr;
      c.style.width = size + 'px';
      c.style.height = size + 'px';
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      const cx = size / 2, cy = size / 2, r = 58, lw = 6;
      ctx.clearRect(0, 0, size, size);

      // track
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      ctx.lineWidth = lw;
      ctx.stroke();

      // arc
      const angle = (current / 100) * Math.PI * 2;
      const grad = ctx.createConicGradient(-Math.PI / 2, cx, cy);
      grad.addColorStop(0, dark ? '#4F8CFF' : '#6366F1');
      grad.addColorStop(0.5, dark ? '#8B5CF6' : '#818CF8');
      grad.addColorStop(1, dark ? '#4F8CFF' : '#6366F1');
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + angle);
      ctx.strokeStyle = grad;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.stroke();

      // glow
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + angle);
      ctx.strokeStyle = dark ? 'rgba(79,140,255,0.4)' : 'rgba(99,102,241,0.3)';
      ctx.lineWidth = lw + 4;
      ctx.filter = `blur(${dark ? 6 : 4}px)`;
      ctx.stroke();
      ctx.filter = 'none';

      // endpoint dot
      if (angle > 0.01) {
        const ex = cx + r * Math.cos(-Math.PI / 2 + angle);
        const ey = cy + r * Math.sin(-Math.PI / 2 + angle);
        ctx.beginPath();
        ctx.arc(ex, ey, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }

      if (current < target) frame = requestAnimationFrame(step);
    };

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
  const dark = resolved === 'dark';
  const qc = useQueryClient();
  const ringRef = useRef<HTMLCanvasElement>(null);

  const { data: stats, isLoading, refetch: refetchDashboard } = useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.getStats });

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
  const totalDevices = stats?.totalDevices ?? 0;
  const onlinePct = totalDevices > 0 ? Math.min(100, Math.round((totalDevices / Math.max(totalDevices, 1)) * 76)) : 0;
  const overdue = stats?.overdueTickets ?? 0;

  useRing(ringRef, onlinePct, dark);

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
              {overdue > 0 ? `${overdue} przeterminowanych zgłoszeń` : 'Wszystkie systemy sprawne'}
            </span>
          </div>
          <div className="ids-v3-hero-actions">
            <Link to="/tickets" className="ids-v3-btn primary"><Plus className="h-3.5 w-3.5" /> Nowe zgłoszenie</Link>
            <Link to="/devices" className="ids-v3-btn ghost hidden sm:inline-flex"><Monitor className="h-3.5 w-3.5" /> Urządzenia</Link>
          </div>
        </div>
        <div className="ids-v3-hero-right hidden lg:flex">
          <div className="ids-v3-ring-wrap">
            <div className="ids-v3-ring-glow" />
            <div className="ids-v3-ring">
              <canvas ref={ringRef} />
              <div className="ids-v3-ring-center">
                <span className="ids-v3-ring-val">{onlinePct}%</span>
                <span className="ids-v3-ring-lbl">ONLINE</span>
              </div>
            </div>
            <div className="ids-v3-ring-stat">
              <span className="ids-v3-ring-stat-lbl">Status</span>
              <span className={`ids-v3-ring-stat-val ${overdue > 0 ? 'warn' : 'good'}`}>
                {overdue > 0 ? 'UWAGA' : 'DOBRY'}
              </span>
            </div>
          </div>
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

      {/* ═══ KPI STRIP ═══ */}
      <section className="ids-v3-kpi fade-in fade-in-1">
        <Link to="/locations" className="ids-v3-kpi-card">
          <div className="ids-v3-kpi-head">
            <div className="ids-v3-kpi-icon blue"><Building2 className="h-4 w-4" /></div>
            <span className="ids-v3-kpi-badge blue">{stats?.totalLocations ?? 0} lok.</span>
          </div>
          <div className="ids-v3-kpi-val">{stats?.totalLocations ?? '—'}</div>
          <div className="ids-v3-kpi-title">Lokalizacje</div>
          <div className="ids-v3-kpi-desc">Lokalizacje w workspace</div>
        </Link>

        <Link to="/devices" className="ids-v3-kpi-card">
          <div className="ids-v3-kpi-head">
            <div className="ids-v3-kpi-icon teal"><Monitor className="h-4 w-4" /></div>
            <span className="ids-v3-kpi-badge teal">{onlinePct}% online</span>
          </div>
          <div className="ids-v3-kpi-val">{stats?.totalDevices ?? '—'}</div>
          <div className="ids-v3-kpi-title">Urządzenia</div>
          <div className="ids-v3-kpi-desc">Monitorowane urządzenia</div>
        </Link>

        <Link to="/tickets" className="ids-v3-kpi-card">
          <div className="ids-v3-kpi-head">
            <div className="ids-v3-kpi-icon indigo"><Ticket className="h-4 w-4" /></div>
            <span className="ids-v3-kpi-badge indigo">{stats?.unassignedTickets ?? 0} oczek.</span>
          </div>
          <div className="ids-v3-kpi-val">{stats?.openTickets ?? '—'}</div>
          <div className="ids-v3-kpi-title">Otwarte zgłoszenia</div>
          <div className="ids-v3-kpi-desc">{overdue > 0 ? `${overdue} przeterminowanych` : 'Brak przeterminowanych'}</div>
        </Link>
      </section>

      {/* ═══ LOWER GRID ═══ */}
      <div className="ids-v3-grid fade-in fade-in-2">

        {/* ── LEFT: Recent tickets timeline ── */}
        <section className="ids-v3-card">
          <div className="ids-v3-card-head">
            <h2 className="ids-v3-card-title"><Ticket className="h-4 w-4 text-ids-accent" /> Ostatnie zgłoszenia</h2>
            <Link to="/tickets" className="ids-v3-link">Wszystkie <ChevronRight className="h-3 w-3" /></Link>
          </div>
          <div className="ids-v3-tl">
            {stats?.recentTickets?.length ? stats.recentTickets.slice(0, 7).map((tk: ITicket) => (
              <Link key={tk.id} to={`/tickets/${tk.id}`} className="ids-v3-tl-row">
                <div className="ids-v3-tl-dot" style={{ background: P[tk.priority] ?? '#6366F1' }} />
                <div className="ids-v3-tl-body">
                  <div className="ids-v3-tl-title">{tk.title}</div>
                  <div className="ids-v3-tl-meta">{tk.location?.name || '—'} · {tk.ticketNumber}</div>
                </div>
                <div className="ids-v3-tl-right">
                  <TicketStatusBadge status={tk.status} />
                  <span className="ids-v3-tl-time">{timeAgo(tk.createdAt)}</span>
                </div>
              </Link>
            )) : <p className="ids-v3-empty">Brak zgłoszeń</p>}
          </div>
        </section>

        {/* ── RIGHT: Aside stack ── */}
        <div className="ids-v3-aside">

          {/* Health grid */}
          <section className="ids-v3-card">
            <div className="ids-v3-card-head">
              <h3 className="ids-v3-card-title"><Zap className="h-4 w-4 text-amber-400" /> Status systemu</h3>
            </div>
            <div className="ids-v3-health">
              <HealthItem color="#4ADE80" label="Agenci online" value={`${onlinePct}%`} />
              <HealthItem color={overdue > 0 ? '#FB923C' : '#4ADE80'} label="Przeterminowane" value={overdue} />
              <HealthItem color="#22D3EE" label="Oczekujące" value={pendingTickets.length} />
              <HealthItem color="#8B5CF6" label="Moje zadania" value={activeTasks.length} />
            </div>
          </section>

          {/* Quick actions */}
          <section className="ids-v3-card">
            <div className="ids-v3-card-head">
              <h3 className="ids-v3-card-title"><Zap className="h-4 w-4 text-ids-accent" /> Szybkie akcje</h3>
            </div>
            <div className="ids-v3-actions">
              <Link to="/tickets" className="ids-v3-action">
                <div className="ids-v3-action-icon" style={{ background: 'rgba(99,102,241,0.08)', color: '#818CF8' }}><FileText className="h-4 w-4" /></div>
                <span className="ids-v3-action-lbl">Zgłoszenia</span>
              </Link>
              <Link to="/devices" className="ids-v3-action">
                <div className="ids-v3-action-icon" style={{ background: 'rgba(20,184,166,0.08)', color: '#5EEAD4' }}><Monitor className="h-4 w-4" /></div>
                <span className="ids-v3-action-lbl">Urządzenia</span>
              </Link>
              <Link to="/tasks" className="ids-v3-action">
                <div className="ids-v3-action-icon" style={{ background: 'rgba(139,92,246,0.08)', color: '#A78BFA' }}><CheckCircle2 className="h-4 w-4" /></div>
                <span className="ids-v3-action-lbl">Zadania</span>
              </Link>
            </div>
          </section>

          {/* Pending tickets */}
          <section className="ids-v3-card">
            <div className="ids-v3-card-head">
              <h3 className="ids-v3-card-title"><Clock className="h-4 w-4 text-amber-500" /> Oczekujące</h3>
              <span className="ids-v3-badge red">{pendingTickets.length}</span>
            </div>
            <div className="ids-v3-tasks">
              {pendingTickets.slice(0, 4).map(tk => (
                <Link key={tk.id} to={`/tickets/${tk.id}`} className="ids-v3-task-row">
                  <div className="ids-v3-task-bar" style={{ background: '#FB923C' }} />
                  <div className="ids-v3-task-body">
                    <div className="ids-v3-task-title">{tk.title}</div>
                    <div className="ids-v3-task-meta">{tk.location?.name || '—'}</div>
                  </div>
                </Link>
              ))}
              {!pendingTickets.length && <p className="ids-v3-empty">Brak oczekujących</p>}
            </div>
          </section>

          {/* My tasks */}
          <section className="ids-v3-card">
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
          </section>
        </div>
      </div>
    </div>
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
