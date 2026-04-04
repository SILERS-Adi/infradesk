import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Ticket, Monitor, ShoppingCart, ChevronRight, Shield, HardDrive,
  Plus, Phone, Mail, MessageCircle, Send, User, Loader2,
  CheckCircle2, AlertTriangle, Wifi, Zap, AlertCircle, ScreenShare,
  Activity, Database, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { dashboardApi } from '../../api/dashboard';
import { useAuth } from '../../store/authStore';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import { TicketStatusBadge } from '../../components/ui/StatusBadge';
import { formatDate } from '../../utils/helpers';
import type { Ticket as ITicket } from '../../types';
import apiClient from '../../api/client';

/* ── Shared styles ─────────────────────────────────────────────────────────── */
const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 18,
  backdropFilter: 'blur(12px)',
  ...extra,
});

/* ── CSS keyframes (injected once) ─────────────────────────────────────────── */
const styleId = 'portal-dash-anims';
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes pdFadeUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes pdPulseGlow {
      0%, 100% { box-shadow: 0 0 20px rgba(34,197,94,0.08); }
      50%      { box-shadow: 0 0 32px rgba(34,197,94,0.16); }
    }
    @keyframes pdPulseGlowRed {
      0%, 100% { box-shadow: 0 0 20px rgba(239,68,68,0.08); }
      50%      { box-shadow: 0 0 32px rgba(239,68,68,0.16); }
    }
    @keyframes pdShimmer {
      from { background-position: -200% 0; }
      to   { background-position: 200% 0; }
    }
    .pd-fade-up { animation: pdFadeUp 0.5s ease-out both; }
    .pd-fade-up-1 { animation-delay: 0.05s; }
    .pd-fade-up-2 { animation-delay: 0.1s; }
    .pd-fade-up-3 { animation-delay: 0.15s; }
    .pd-fade-up-4 { animation-delay: 0.2s; }
    .pd-fade-up-5 { animation-delay: 0.25s; }
    .pd-fade-up-6 { animation-delay: 0.3s; }
    .pd-shimmer {
      background: linear-gradient(90deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%);
      background-size: 200% 100%;
      animation: pdShimmer 2s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}

/* ── Main component ────────────────────────────────────────────────────────── */
export function PortalDashboardPage() {
  const { user } = useAuth();
  const { workspace } = useWorkspaceContext();
  const [showChat, setShowChat] = useState(false);
  const [message, setMessage] = useState('');

  const { data: resp, isLoading } = useQuery({ queryKey: ['dashboard-client'], queryFn: dashboardApi.getClientStats });
  const { data: contactInfo } = useQuery({
    queryKey: ['portal-contact'],
    queryFn: async () => { try { const { data } = await apiClient.get('/settings/contact'); return data; } catch { return null; } },
  });

  const sendMsg = useMutation({
    mutationFn: async (msg: string) => {
      await apiClient.post('/tickets', { title: 'Wiadomość do opiekuna', description: msg, type: 'REQUEST', priority: 'LOW', source: 'MESSAGE' });
    },
    onSuccess: () => { setMessage(''); setShowChat(false); toast.success('Wiadomość wysłana'); },
    onError: () => toast.error('Nie udało się wysłać'),
  });

  /* ── Loading state ─────────────────────────────────────────────────────── */
  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-8 w-8 border-2 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );

  // Support both server shapes: { stats: {...}, recentTickets } and flat { openTickets, recentTickets, ... }
  const raw = resp ?? ({} as any);
  const s = raw.stats ?? raw;
  const recentTickets: ITicket[] = raw.recentTickets ?? s.recentTickets ?? [];
  const openTickets: number = s.openTickets ?? 0;
  const totalDevices: number = s.totalDevices ?? s.myDevices ?? 0;

  // Manager assigned to this workspace (from dashboard response)
  const manager = raw.manager ?? raw.client?.manager ?? null;
  // Company-level contact info (fallback)
  const firmContact = contactInfo?.value ? (() => { try { return JSON.parse(contactInfo.value); } catch { return null; } })() : null;
  // If client has a dedicated manager, use their data; otherwise fallback to company info
  const hasManager = !!(manager?.firstName);
  const opiekunName = hasManager ? `${manager.firstName} ${manager.lastName}` : null;
  const opiekunAvatar: string | null = manager?.avatarUrl ?? null;
  const opiekunTel = hasManager ? manager.phone : firmContact?.infolinia ?? firmContact?.opiekunTel ?? null;
  const opiekunEmail = hasManager ? manager.email : firmContact?.email ?? firmContact?.opiekunEmail ?? null;

  const hasCritical = recentTickets.some(t => t.priority === 'CRITICAL' && (t.status === 'PENDING' || t.status === 'ASSIGNED'));
  const systemOk = openTickets === 0 || !hasCritical;

  return (
    <div className="space-y-5">

      {/* ═══════════════════════════════════════════════════════════════════════
          1. SYSTEM STATUS — hero card
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="pd-fade-up pd-fade-up-1 rounded-[22px] p-6 md:p-8 relative overflow-hidden" style={{
        background: systemOk
          ? 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(16,185,129,0.03) 60%, rgba(96,165,250,0.04) 100%)'
          : 'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(245,158,11,0.04) 60%, rgba(239,68,68,0.03) 100%)',
        border: `1px solid ${systemOk ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
        animation: systemOk ? 'pdPulseGlow 4s ease-in-out infinite' : 'pdPulseGlowRed 3s ease-in-out infinite',
        backdropFilter: 'blur(16px)',
      }}>
        {/* Decorative glow orbs */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${systemOk ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)'}, transparent 70%)` }} />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${systemOk ? 'rgba(96,165,250,0.06)' : 'rgba(245,158,11,0.05)'}, transparent 70%)` }} />

        <div className="relative z-10">
          {/* Status header */}
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: systemOk ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
                boxShadow: systemOk ? '0 0 24px rgba(34,197,94,0.12)' : '0 0 24px rgba(239,68,68,0.1)',
              }}>
              {systemOk
                ? <CheckCircle2 className="h-7 w-7 md:h-8 md:w-8" style={{ color: '#22C55E' }} />
                : <AlertTriangle className="h-7 w-7 md:h-8 md:w-8" style={{ color: '#EF4444' }} />}
            </div>
            <div>
              <h2 className="text-[20px] md:text-[24px] font-bold tracking-tight" style={{ color: systemOk ? '#4ADE80' : '#F87171' }}>
                {systemOk ? 'SYSTEM BEZPIECZNY' : 'WYMAGA UWAGI'}
              </h2>
              <p className="text-[13px] md:text-[14px] mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {systemOk
                  ? 'Wszystkie usługi działają prawidłowo'
                  : `${openTickets} otwartych zgłoszeń wymaga Twojej uwagi`}
              </p>
            </div>
          </div>

          {/* Status checklist */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Backup działa', ok: true, icon: Database },
              { label: `Urządzenia online (${totalDevices})`, ok: totalDevices > 0, icon: Wifi },
              { label: 'Monitoring aktywny', ok: systemOk, icon: Activity },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{
                background: item.ok ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
                border: `1px solid ${item.ok ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)'}`,
              }}>
                <item.icon className="h-4 w-4 flex-shrink-0" style={{ color: item.ok ? '#4ADE80' : '#FBBF24' }} />
                <span className="text-[13px] font-medium" style={{ color: item.ok ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.6)' }}>
                  {item.label}
                </span>
                {item.ok
                  ? <CheckCircle2 className="h-4 w-4 ml-auto flex-shrink-0" style={{ color: '#4ADE80' }} />
                  : <AlertCircle className="h-4 w-4 ml-auto flex-shrink-0" style={{ color: '#FBBF24' }} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="pd-fade-up pd-fade-up-2">
        <h1 className="text-[22px] md:text-[26px] font-bold text-white/90 tracking-tight">Witaj, {user?.firstName}!</h1>
        <p className="text-[13px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{workspace?.name}</p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          2. STAT CARDS + OPIEKUN
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="pd-fade-up pd-fade-up-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.5fr] gap-3">

        {/* Otwarte Zgłoszenia */}
        <Link to="/portal/tickets"
          className="group relative overflow-hidden rounded-[18px] p-5 transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 active:scale-[0.98]"
          style={{
            background: 'linear-gradient(145deg, rgba(249,115,22,0.08), rgba(249,115,22,0.02) 80%)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(249,115,22,0.12)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 0 0 0 rgba(249,115,22,0)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.2), 0 0 24px rgba(249,115,22,0.1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.15), 0 0 0 0 rgba(249,115,22,0)'; }}>
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none transition-transform duration-300 group-hover:scale-125"
            style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.15), transparent 70%)' }} />
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(249,115,22,0.12)', boxShadow: '0 0 16px rgba(249,115,22,0.1)' }}>
              <Ticket className="h-6 w-6" style={{ color: '#FB923C' }} />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Zgłoszenia</span>
          </div>
          <div className="text-[40px] font-extrabold text-white leading-none tracking-tight">{openTickets}</div>
          <div className="text-[12px] mt-1.5 font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>otwartych</div>
        </Link>

        {/* Zamówienia */}
        <Link to="/portal/orders"
          className="group relative overflow-hidden rounded-[18px] p-5 transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 active:scale-[0.98]"
          style={{
            background: 'linear-gradient(145deg, rgba(139,92,246,0.07), rgba(139,92,246,0.02) 80%)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(139,92,246,0.12)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.2), 0 0 24px rgba(139,92,246,0.1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)'; }}>
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none transition-transform duration-300 group-hover:scale-125"
            style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%)' }} />
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(139,92,246,0.1)', boxShadow: '0 0 16px rgba(139,92,246,0.08)' }}>
              <ShoppingCart className="h-6 w-6" style={{ color: '#A78BFA' }} />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Zamówienia</span>
          </div>
          <div className="text-[40px] font-extrabold text-white leading-none tracking-tight">0</div>
          <div className="text-[12px] mt-1.5 font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>aktywnych</div>
        </Link>

        {/* Urządzenia */}
        <Link to="/portal/devices"
          className="group relative overflow-hidden rounded-[18px] p-5 transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 active:scale-[0.98]"
          style={{
            background: 'linear-gradient(145deg, rgba(34,197,94,0.07), rgba(34,197,94,0.02) 80%)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(34,197,94,0.12)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.2), 0 0 24px rgba(34,197,94,0.1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)'; }}>
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none transition-transform duration-300 group-hover:scale-125"
            style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.12), transparent 70%)' }} />
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(34,197,94,0.1)', boxShadow: '0 0 16px rgba(34,197,94,0.08)' }}>
              <Monitor className="h-6 w-6" style={{ color: '#4ADE80' }} />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Urządzenia</span>
          </div>
          <div className="text-[40px] font-extrabold text-white leading-none tracking-tight">{totalDevices}</div>
          <div className="text-[12px] mt-1.5 font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>monitorowanych</div>
        </Link>

        {/* ── Twój opiekun — rozbudowana karta ───────────────────────────── */}
        <div className="rounded-[18px] p-5 flex flex-col relative overflow-hidden transition-all duration-300 hover:-translate-y-1"
          style={{
            background: 'linear-gradient(160deg, rgba(234,88,12,0.07), rgba(255,255,255,0.02) 70%)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(234,88,12,0.12)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          }}>
          <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(234,88,12,0.1), transparent 70%)' }} />

          <div className="text-[11px] font-bold uppercase tracking-[0.08em] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>Twój opiekun</div>

          <div className="flex items-center gap-3.5 mb-4">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {opiekunAvatar ? (
                <img src={opiekunAvatar} alt={opiekunName ?? ''}
                  className="w-20 h-20 rounded-2xl object-cover"
                  style={{ boxShadow: '0 6px 24px rgba(234,88,12,0.25)', border: '2px solid rgba(234,88,12,0.2)' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
              ) : null}
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center ${opiekunAvatar ? 'hidden' : ''}`}
                style={{ background: hasManager ? 'linear-gradient(145deg, #EA580C, #F97316)' : 'linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))', boxShadow: hasManager ? '0 6px 24px rgba(234,88,12,0.25)' : '0 4px 16px rgba(0,0,0,0.2)' }}>
                <User className="h-10 w-10" style={{ color: hasManager ? '#fff' : 'rgba(255,255,255,0.25)' }} />
              </div>
              {hasManager && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: '#040a16', border: '2.5px solid #040a16' }}>
                  <div className="w-3.5 h-3.5 rounded-full bg-green-400 animate-pulse" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              {hasManager ? (
                <>
                  <p className="text-[15px] font-bold text-white/90 truncate">{opiekunName}</p>
                  <p className="text-[11px] mt-0.5 font-medium" style={{ color: 'rgba(34,197,94,0.8)' }}>Twój dedykowany opiekun</p>
                </>
              ) : (
                <>
                  <p className="text-[14px] font-semibold text-white/50">Brak przydzielonego opiekuna</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Kontakt z firmą</p>
                </>
              )}
            </div>
          </div>

          {/* Contact info */}
          {(opiekunTel || opiekunEmail) && (
            <div className="space-y-1.5 mb-4">
              {opiekunTel && (
                <a href={`tel:${opiekunTel}`} className="flex items-center gap-2.5 text-[12px] hover:text-orange-300 transition-colors" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  <Phone className="h-3.5 w-3.5" /> {opiekunTel}
                </a>
              )}
              {opiekunEmail && (
                <a href={`mailto:${opiekunEmail}`} className="flex items-center gap-2.5 text-[12px] hover:text-orange-300 transition-colors" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  <Mail className="h-3.5 w-3.5" /> {opiekunEmail}
                </a>
              )}
            </div>
          )}

          {/* Action buttons — 3 buttons */}
          <div className="grid grid-cols-3 gap-2 mt-auto">
            {opiekunTel ? (
              <a href={`tel:${opiekunTel}`}
                className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[10px] font-semibold transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
                style={{ background: 'rgba(34,197,94,0.08)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.12)' }}>
                <Phone className="h-4 w-4" /> Zadzwoń
              </a>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[10px] font-semibold opacity-30"
                style={{ background: 'rgba(34,197,94,0.05)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.06)' }}>
                <Phone className="h-4 w-4" /> Zadzwoń
              </div>
            )}
            <button onClick={() => setShowChat(!showChat)}
              className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[10px] font-semibold text-white transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
              style={{ background: 'linear-gradient(145deg, #EA580C, #F97316)', boxShadow: '0 2px 12px rgba(234,88,12,0.15)' }}>
              <MessageCircle className="h-4 w-4" /> Napisz
            </button>
            <a href={firmContact?.remoteUrl || '#'}
              className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[10px] font-semibold transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
              style={{ background: 'rgba(96,165,250,0.08)', color: '#60A5FA', border: '1px solid rgba(96,165,250,0.12)' }}
              target="_blank" rel="noopener noreferrer">
              <ScreenShare className="h-4 w-4" /> Zdalna pomoc
            </a>
          </div>
        </div>
      </div>

      {/* ── Chat panel ────────────────────────────────────────────────────── */}
      {showChat && (
        <div className="pd-fade-up rounded-[18px] p-5" style={glass({ boxShadow: '0 4px 24px rgba(0,0,0,0.2)' })}>
          <h3 className="text-[14px] font-semibold text-white/75 mb-3">Wiadomość do opiekuna</h3>
          <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Napisz wiadomość..." rows={3}
            className="w-full rounded-xl px-4 py-3 text-[13px] resize-none focus:outline-none transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }} />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setShowChat(false)} className="px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all hover:bg-white/[0.06]"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>Anuluj</button>
            <button onClick={() => message.trim() && sendMsg.mutate(message.trim())} disabled={!message.trim() || sendMsg.isPending}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[12px] font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-50"
              style={{ background: 'linear-gradient(145deg, #EA580C, #F97316)', boxShadow: '0 2px 12px rgba(234,88,12,0.15)' }}>
              {sendMsg.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Wyślij
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          3. MIDDLE SECTION — Zgłoszenia + Bezpieczeństwo IT
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="pd-fade-up pd-fade-up-4 grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Zgłoszenia serwisowe ─────────────────────────────────────── */}
        <div className="rounded-[18px] overflow-hidden" style={{ ...glass(), boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-2.5">
              <Ticket className="h-4.5 w-4.5" style={{ color: '#FB923C' }} />
              <h3 className="text-[14px] font-semibold text-white/80">Zgłoszenia serwisowe</h3>
            </div>
            <Link to="/portal/tickets" className="text-[11px] font-semibold flex items-center gap-1 transition-colors hover:text-orange-300" style={{ color: 'rgba(249,115,22,0.6)' }}>
              Wszystkie <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="px-5 py-2">
            {recentTickets.length ? (
              <div className="space-y-0.5">
                {recentTickets.slice(0, 5).map((t: ITicket) => (
                  <Link key={t.id} to={`/portal/tickets/${t.id}`}
                    className="flex items-center justify-between py-3 px-3 -mx-3 rounded-xl transition-all duration-200 hover:bg-white/[0.04]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{
                        background: t.priority === 'CRITICAL' ? '#EF4444' : t.priority === 'HIGH' ? '#F97316' : t.priority === 'MEDIUM' ? '#FB923C' : '#60A5FA',
                        boxShadow: t.priority === 'CRITICAL' ? '0 0 8px rgba(239,68,68,0.4)' : 'none',
                      }} />
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-white/80 truncate">{t.title}</div>
                        <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{t.ticketNumber} · {formatDate(t.reportedAt ?? t.createdAt)}</div>
                      </div>
                    </div>
                    <TicketStatusBadge status={t.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-center py-8" style={{ color: 'rgba(255,255,255,0.25)' }}>Brak zgłoszeń</p>
            )}
          </div>
        </div>

        {/* ── Twoje bezpieczeństwo IT ──────────────────────────────────── */}
        <div className="rounded-[18px] overflow-hidden" style={{
          ...glass({
            background: 'linear-gradient(160deg, rgba(139,92,246,0.05), rgba(255,255,255,0.02) 70%)',
            border: '1px solid rgba(139,92,246,0.1)',
          }),
          boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-2.5">
              <Shield className="h-5 w-5" style={{ color: '#A78BFA' }} />
              <h3 className="text-[14px] font-semibold text-white/80">Twoje bezpieczeństwo IT</h3>
            </div>
          </div>
          <div className="p-5 space-y-3">
            {/* Security items */}
            {[
              { label: 'Backup danych', status: 'Aktywny', ok: true, desc: 'Ostatnia kopia: dziś 02:00', icon: Database, color: '#4ADE80' },
              { label: 'Stan dysków', status: 'Zdrowe', ok: true, desc: 'Brak ostrzeżeń S.M.A.R.T.', icon: HardDrive, color: '#60A5FA' },
              { label: 'Aktualizacje systemu', status: 'Aktualne', ok: true, desc: 'Wszystkie systemy zaktualizowane', icon: RefreshCw, color: '#A78BFA' },
              { label: 'Ochrona ogólna', status: systemOk ? 'Wszystko OK' : 'Wymaga uwagi', ok: systemOk, desc: systemOk ? 'Brak wykrytych zagrożeń' : `${openTickets} otwartych zgłoszeń`, icon: Shield, color: systemOk ? '#4ADE80' : '#FBBF24' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-4 p-3.5 rounded-[14px] transition-all duration-200 hover:bg-white/[0.02]" style={{
                background: item.ok ? 'rgba(255,255,255,0.015)' : 'rgba(245,158,11,0.04)',
                border: `1px solid ${item.ok ? 'rgba(255,255,255,0.04)' : 'rgba(245,158,11,0.1)'}`,
              }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${item.color}12`, boxShadow: `0 0 12px ${item.color}10` }}>
                  <item.icon className="h-5 w-5" style={{ color: item.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-white/80">{item.label}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{
                      background: item.ok ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                      color: item.ok ? '#4ADE80' : '#FBBF24',
                    }}>{item.status}</span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          4. QUICK ACTIONS
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="pd-fade-up pd-fade-up-5">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>Szybkie akcje</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <Link to="/portal/new-request?type=INCIDENT"
            className="group flex items-center gap-2.5 px-4 py-3 rounded-[14px] text-[12px] font-semibold text-white transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]"
            style={{ background: 'linear-gradient(145deg, #EA580C, #F97316)', boxShadow: '0 4px 16px rgba(234,88,12,0.15)' }}>
            <Plus className="h-4 w-4" /> Zgłoś problem
          </Link>
          <Link to="/portal/new-request?type=INCIDENT&priority=CRITICAL"
            className="group flex items-center gap-2.5 px-4 py-3 rounded-[14px] text-[12px] font-semibold transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171', border: '1px solid rgba(239,68,68,0.15)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
            <Zap className="h-4 w-4" /> Awaria pilna
          </Link>
          <Link to="/portal/new-request?type=INCIDENT&category=COMPUTER"
            className="group flex items-center gap-2.5 px-4 py-3 rounded-[14px] text-[12px] font-semibold transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]"
            style={{ background: 'rgba(96,165,250,0.08)', color: '#60A5FA', border: '1px solid rgba(96,165,250,0.12)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
            <Monitor className="h-4 w-4" /> Problem z PC
          </Link>
          <Link to="/portal/new-request?type=REQUEST"
            className="group flex items-center gap-2.5 px-4 py-3 rounded-[14px] text-[12px] font-semibold transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]"
            style={{ background: 'rgba(139,92,246,0.08)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.12)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
            <ShoppingCart className="h-4 w-4" /> Zamów towar
          </Link>
          <Link to="/portal/new-request?type=REKLAMACJA"
            className="group flex items-center gap-2.5 px-4 py-3 rounded-[14px] text-[12px] font-medium transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]"
            style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
            <AlertTriangle className="h-4 w-4" /> Reklamacja
          </Link>
        </div>
      </div>

    </div>
  );
}
