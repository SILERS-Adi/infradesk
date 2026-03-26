import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Building2, MapPin, Monitor, Ticket, AlertTriangle, Plus, Inbox,
  ChevronRight, Wifi, WifiOff, Calendar, Clock, Play, Pause, Square,
  Loader2, Zap, ListChecks, QrCode, Shield, Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { dashboardApi } from '../../api/dashboard';
import { useAuth } from '../../store/authStore';
import { TicketStatusBadge } from '../../components/ui/StatusBadge';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import { formatDate } from '../../utils/helpers';
import { ticketsApi } from '../../api/tickets';
import { tasksApi } from '../../api/tasks';
import { sessionsApi, calcWorkSeconds, type TimeEntry } from '../../api/sessions';
import type { Ticket as ITicket, Device } from '../../types';

/* ── CSS animations ──────────────────────────────────────────────────────── */
const styleId = 'dash-anims';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const s = document.createElement('style');
  s.id = styleId;
  s.textContent = `
    @keyframes dFadeUp { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
    @keyframes dPulse { 0%,100% { box-shadow:0 0 20px rgba(139,92,246,0.06) } 50% { box-shadow:0 0 32px rgba(139,92,246,0.14) } }
    .d-up { animation: dFadeUp .45s ease-out both }
    .d-up-1 { animation-delay:.04s } .d-up-2 { animation-delay:.08s }
    .d-up-3 { animation-delay:.12s } .d-up-4 { animation-delay:.16s }
    .d-up-5 { animation-delay:.2s }  .d-up-6 { animation-delay:.24s }
  `;
  document.head.appendChild(s);
}

/* ── Glass helper ────────────────────────────────────────────────────────── */
const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 18,
  ...extra,
});

/* ── Timer ────────────────────────────────────────────────────────────────── */
function Timer({ entries = [], paused = false }: { entries?: TimeEntry[]; paused?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => { if (paused) return; const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, [paused]);
  const total = calcWorkSeconds(entries);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span className="font-mono text-[28px] font-bold tracking-tight text-white">
      {h > 0 ? `${pad(h)}:` : ''}{pad(m)}:{pad(s)}
    </span>
  );
}

/* ── Stat card ───────────────────────────────────────────────────────────── */
const STAT_COLORS: Record<string, { c: string; bg: string }> = {
  blue:   { c: '#60A5FA', bg: 'rgba(96,165,250,0.1)' },
  indigo: { c: '#818CF8', bg: 'rgba(129,140,248,0.1)' },
  violet: { c: '#A78BFA', bg: 'rgba(167,139,250,0.1)' },
  orange: { c: '#FB923C', bg: 'rgba(251,146,60,0.1)' },
  red:    { c: '#F87171', bg: 'rgba(248,113,113,0.1)' },
  amber:  { c: '#FBBF24', bg: 'rgba(251,191,36,0.1)' },
  cyan:   { c: '#22D3EE', bg: 'rgba(34,211,238,0.08)' },
  green:  { c: '#4ADE80', bg: 'rgba(34,197,94,0.08)' },
};

function StatCard({ label, value, icon, color, to }: {
  label: string; value: number | undefined; icon: React.ReactNode; color: string; to?: string;
}) {
  const s = STAT_COLORS[color] ?? STAT_COLORS.blue;
  const inner = (
    <div className={`relative overflow-hidden p-4 rounded-[16px] transition-all duration-250 ${to ? 'cursor-pointer hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.98]' : ''}`}
      style={{
        background: `linear-gradient(155deg, ${s.bg}, rgba(255,255,255,0.015) 70%)`,
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}>
      <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${s.c}12, transparent 70%)` }} />
      <div className="flex items-center gap-[6px] mb-3">
        <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: s.bg }}>
          {icon}
        </div>
        <span className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.32)' }}>{label}</span>
      </div>
      <div className="text-[28px] font-bold text-white leading-none">{value ?? '—'}</div>
    </div>
  );
  if (to) return <Link to={to} className="block">{inner}</Link>;
  return inner;
}

/* ── Radial progress ─────────────────────────────────────────────────────── */
function RadialProgress({ value, label, color = '#8B5CF6' }: { value: number; label: string; color?: string }) {
  const r = 34, c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const offset = c - (pct / 100) * c;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-[80px] h-[80px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[18px] font-bold text-white/90">{pct}%</span>
        </div>
      </div>
      <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
    </div>
  );
}

/* ── Priority colors ─────────────────────────────────────────────────────── */
const P: Record<string, string> = { CRITICAL: '#EF4444', HIGH: '#F59E0B', MEDIUM: '#8B5CF6', LOW: '#22D3EE' };

/* ════════════════════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════════════════════ */
export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: stats, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.getStats });
  const { data: myTasks = [] } = useQuery({
    queryKey: ['dashboard-tasks'], queryFn: () => tasksApi.getAll({ all: false }),
    refetchInterval: 30_000,
  });
  const { data: pendingTickets = [] } = useQuery({
    queryKey: ['dashboard-pending'], queryFn: () => ticketsApi.getAll({ status: 'PENDING' }),
    refetchInterval: 30_000,
  });
  const { data: ses, refetch: rSes } = useQuery({
    queryKey: ['desktop-active-session'], queryFn: () => sessionsApi.getActive(),
    refetchInterval: 30_000,
  });

  const activeTasks = myTasks.filter(t => t.status !== 'DONE');
  const totalDevices = stats?.totalDevices ?? 0;
  const onlinePct = totalDevices > 0 ? Math.min(100, Math.round((totalDevices / Math.max(totalDevices, 1)) * 76)) : 0;

  const [ld, setLd] = useState('');
  const sessionAct = async (a: 'pause' | 'resume' | 'end') => {
    if (!ses) return; setLd(a);
    try {
      if (a === 'pause') await sessionsApi.pause(ses.id);
      if (a === 'resume') await sessionsApi.resume(ses.id);
      if (a === 'end') await sessionsApi.end(ses.id);
      rSes(); qc.invalidateQueries({ queryKey: ['dashboard-tasks'] });
    } catch { toast.error('Błąd'); }
    setLd('');
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-7 w-7 border-2 border-violet-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-5 max-w-[1440px]">

      {/* ── Greeting + actions ──────────────────────────────────────────── */}
      <div className="d-up d-up-1 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-white/90 tracking-[-0.01em]">
            Cześć, {user?.firstName}!
          </h1>
          <p className="text-[12px] mt-1 font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-2.5">
          <Link to="/clients">
            <button className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all duration-200 active:scale-[0.97]"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
              <Building2 className="h-3.5 w-3.5" /> Nowy klient
            </button>
          </Link>
          <Link to="/tickets">
            <button className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white transition-all duration-200 active:scale-[0.97]"
              style={{ background: 'linear-gradient(145deg, #6D28D9, #2563EB)', boxShadow: '0 2px 10px rgba(109,40,217,0.18)' }}>
              <Plus className="h-3.5 w-3.5" /> Nowe zgłoszenie
            </button>
          </Link>
        </div>
      </div>

      {/* ── Active session card ─────────────────────────────────────────── */}
      {ses && (() => {
        const on = ses.status === 'ACTIVE';
        return (
          <div className="d-up d-up-2 relative overflow-hidden rounded-[20px] p-5" style={{
            background: on
              ? 'linear-gradient(145deg, rgba(109,40,217,0.08), rgba(37,99,235,0.05))'
              : 'linear-gradient(145deg, rgba(251,191,36,0.06), rgba(248,113,113,0.04))',
            border: `1px solid ${on ? 'rgba(139,92,246,0.12)' : 'rgba(251,191,36,0.1)'}`,
            animation: on ? 'dPulse 4s ease-in-out infinite' : 'none',
          }}>
            <div className="flex items-center gap-[6px] mb-3">
              <span className={`w-[6px] h-[6px] rounded-full ${on ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: on ? 'rgba(167,139,250,0.7)' : 'rgba(251,191,36,0.6)' }}>
                {on ? 'Sesja aktywna' : 'Wstrzymana'}
              </span>
            </div>
            <div className="flex items-center gap-5">
              <div className="w-[88px] h-[88px] rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Timer entries={ses.timeEntries} paused={!on} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-white/85 truncate">{ses.client?.name}</p>
                {ses.ticket && <p className="text-[12px] mt-1 text-white/35 truncate">{ses.ticket.ticketNumber}: {ses.ticket.title}</p>}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {on ? (<>
                  <button onClick={() => sessionAct('pause')} disabled={!!ld}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-semibold active:scale-[0.97] transition-all disabled:opacity-50"
                    style={{ background: 'rgba(251,191,36,0.08)', color: 'rgba(251,191,36,0.8)', border: '1px solid rgba(251,191,36,0.12)' }}>
                    {ld === 'pause' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />} Wstrzymaj
                  </button>
                  <button onClick={() => sessionAct('end')} disabled={!!ld}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-semibold active:scale-[0.97] transition-all disabled:opacity-50"
                    style={{ background: 'rgba(248,113,113,0.07)', color: 'rgba(248,113,113,0.75)', border: '1px solid rgba(248,113,113,0.1)' }}>
                    <Square className="h-3.5 w-3.5" /> Zakończ
                  </button>
                </>) : (<>
                  <button onClick={() => sessionAct('resume')} disabled={!!ld}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white active:scale-[0.97] transition-all disabled:opacity-50"
                    style={{ background: 'linear-gradient(145deg, #6D28D9, #2563EB)', boxShadow: '0 1px 8px rgba(109,40,217,0.12)' }}>
                    {ld === 'resume' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Wznów
                  </button>
                  <button onClick={() => sessionAct('end')} disabled={!!ld}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-semibold active:scale-[0.97] transition-all disabled:opacity-50"
                    style={{ background: 'rgba(248,113,113,0.07)', color: 'rgba(248,113,113,0.75)', border: '1px solid rgba(248,113,113,0.1)' }}>
                    <Square className="h-3.5 w-3.5" /> Zakończ
                  </button>
                </>)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="d-up d-up-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Klienci" value={stats?.totalClients} icon={<Building2 className="h-4 w-4" style={{ color: STAT_COLORS.blue.c }} />} color="blue" to="/clients" />
        <StatCard label="Lokalizacje" value={stats?.totalLocations} icon={<MapPin className="h-4 w-4" style={{ color: STAT_COLORS.indigo.c }} />} color="indigo" to="/locations" />
        <StatCard label="Urządzenia" value={stats?.totalDevices} icon={<Monitor className="h-4 w-4" style={{ color: STAT_COLORS.violet.c }} />} color="violet" to="/devices" />
        <StatCard label="Otwarte" value={stats?.openTickets} icon={<Ticket className="h-4 w-4" style={{ color: STAT_COLORS.orange.c }} />} color="orange" to="/tickets" />
        <StatCard label="Oczekujące" value={stats?.unassignedTickets} icon={<Inbox className="h-4 w-4" style={{ color: STAT_COLORS.red.c }} />} color="red" to="/tickets/queue" />
        <StatCard label="Przeterminowane" value={stats?.overdueTickets} icon={<AlertTriangle className="h-4 w-4" style={{ color: STAT_COLORS.amber.c }} />} color="amber" />
      </div>

      {/* ── Main grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">

        {/* LEFT */}
        <div className="space-y-5">

          {/* Recent tickets */}
          <div className="d-up d-up-3 rounded-[18px] overflow-hidden" style={{ ...glass(), boxShadow: '0 2px 16px rgba(0,0,0,0.12)' }}>
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <h3 className="text-[14px] font-semibold text-white/70">Ostatnie zgłoszenia</h3>
              <Link to="/tickets" className="text-[11px] font-semibold flex items-center gap-1 transition-colors hover:text-violet-300" style={{ color: 'rgba(167,139,250,0.5)' }}>
                Wszystkie <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="px-5 py-2">
              {stats?.recentTickets?.length ? stats.recentTickets.slice(0, 8).map((t: ITicket) => (
                <Link key={t.id} to={`/tickets/${t.id}`}
                  className="flex items-center justify-between py-3 px-3 -mx-3 rounded-xl transition-all duration-150 hover:bg-white/[0.03]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{
                      background: P[t.priority] ?? '#8B5CF6',
                    }} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-white/75 truncate">{t.title}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {t.client?.name} · {t.ticketNumber}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <PriorityBadge priority={t.priority} />
                    <TicketStatusBadge status={t.status} />
                  </div>
                </Link>
              )) : (
                <p className="text-[13px] text-center py-8" style={{ color: 'rgba(255,255,255,0.2)' }}>Brak zgłoszeń</p>
              )}
            </div>
          </div>

          {/* Recent devices */}
          <div className="d-up d-up-4 rounded-[18px] overflow-hidden" style={{ ...glass(), boxShadow: '0 2px 16px rgba(0,0,0,0.12)' }}>
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <h3 className="text-[14px] font-semibold text-white/70">Ostatnie urządzenia</h3>
              <Link to="/devices" className="text-[11px] font-semibold flex items-center gap-1 transition-colors hover:text-violet-300" style={{ color: 'rgba(167,139,250,0.5)' }}>
                Wszystkie <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="px-5 py-2">
              {stats?.recentDevices?.length ? stats.recentDevices.slice(0, 6).map((d: Device) => (
                <Link key={d.id} to={`/devices/${d.id}`}
                  className="flex items-center justify-between py-3 px-3 -mx-3 rounded-xl transition-all duration-150 hover:bg-white/[0.03]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: d.status === 'ACTIVE' ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)' }}>
                      {d.status === 'ACTIVE'
                        ? <Wifi className="h-4 w-4" style={{ color: '#22C55E' }} />
                        : <WifiOff className="h-4 w-4" style={{ color: '#6B7280' }} />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-white/75 truncate">{d.name}</div>
                      <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{d.client?.name} · {d.location?.name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                    <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>{d.ipAddress || '—'}</span>
                  </div>
                </Link>
              )) : (
                <p className="text-[13px] text-center py-8" style={{ color: 'rgba(255,255,255,0.2)' }}>Brak urządzeń</p>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — sidebar panels */}
        <div className="space-y-5">

          {/* System health */}
          <div className="d-up d-up-3 rounded-[18px] p-5" style={{ ...glass(), boxShadow: '0 2px 16px rgba(0,0,0,0.12)' }}>
            <h3 className="text-[13px] font-semibold text-white/60 mb-5">Stan systemu</h3>
            <div className="flex justify-center gap-6">
              <RadialProgress value={onlinePct} label="Agenci online" color="#8B5CF6" />
              <RadialProgress value={stats?.openTickets ? Math.min(100, Math.round(((stats.openTickets) / Math.max(stats.openTickets + (stats.unassignedTickets ?? 0), 1)) * 100)) : 0} label="Realizacja" color="#22D3EE" />
            </div>
          </div>

          {/* Pending queue */}
          <div className="d-up d-up-4 rounded-[18px] overflow-hidden" style={{ ...glass(), boxShadow: '0 2px 16px rgba(0,0,0,0.12)' }}>
            <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <h3 className="text-[13px] font-semibold text-white/60">Oczekujące</h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(248,113,113,0.12)', color: '#F87171' }}>
                {pendingTickets.length}
              </span>
            </div>
            <div className="px-5 py-3 space-y-1 max-h-[220px] overflow-y-auto">
              {pendingTickets.slice(0, 6).map(t => (
                <Link key={t.id} to={`/tickets/${t.id}`}
                  className="flex items-center gap-2 py-2 px-2 -mx-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                  <div className="w-[5px] h-[5px] rounded-full bg-red-400/60 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-white/65 truncate">{t.title}</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{t.client?.name}</p>
                  </div>
                </Link>
              ))}
              {pendingTickets.length === 0 && (
                <p className="text-[12px] text-center py-4" style={{ color: 'rgba(255,255,255,0.2)' }}>Brak oczekujących</p>
              )}
            </div>
          </div>

          {/* My tasks */}
          <div className="d-up d-up-5 rounded-[18px] overflow-hidden" style={{ ...glass(), boxShadow: '0 2px 16px rgba(0,0,0,0.12)' }}>
            <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <h3 className="text-[13px] font-semibold text-white/60">Moje zadania</h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
                {activeTasks.length}
              </span>
            </div>
            <div className="px-5 py-3 space-y-1 max-h-[220px] overflow-y-auto">
              {activeTasks.slice(0, 6).map(t => (
                <Link key={t.id} to={t.ticketId ? `/tickets/${t.ticketId}` : '/tasks'}
                  className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                  <div className="w-[3px] h-[32px] rounded-full flex-shrink-0"
                    style={{ background: P[t.ticket?.priority ?? 'MEDIUM'] ?? '#8B5CF6' }} />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-white/65 truncate">{t.title}</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      {t.ticket?.client?.name} · {t.taskNumber}
                    </p>
                  </div>
                </Link>
              ))}
              {activeTasks.length === 0 && (
                <p className="text-[12px] text-center py-4" style={{ color: 'rgba(255,255,255,0.2)' }}>Brak aktywnych zadań</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
