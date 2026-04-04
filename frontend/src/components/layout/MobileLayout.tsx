import { ReactNode, useState, useCallback } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, ListChecks, Monitor, ShoppingCart,
  Plus, X, Ticket, Phone, QrCode, LogOut, MapPin, Search, Settings, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../store/authStore';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import { useWorkspace } from '../../store/workspaceStore';
import { useGeolocation } from '../../hooks/useGeolocation';
import { sessionsApi } from '../../api/sessions';
import { GeofencePrompt } from '../mobile/GeofencePrompt';
import { NoWorkspacePage } from '../../pages/auth/NoWorkspacePage';

interface Props { children: ReactNode }

const TABS = [
  { path: '/m', label: 'Panel', icon: LayoutDashboard, exact: true },
  { path: '/m/tasks', label: 'Zadania', icon: ListChecks },
  { key: 'add' },
  { path: '/m/devices', label: 'Urządzenia', icon: Monitor },
  { path: '/m/orders', label: 'Zamówienia', icon: ShoppingCart },
];

const ADD_ACTIONS = [
  { label: 'Lokalizację', desc: 'Nowa lokalizacja', icon: MapPin, path: '/locations', color: '#8B5CF6' },
  { label: 'Zgłoszenie', desc: 'Nowy serwis', icon: Ticket, path: '/m/tickets/new', color: '#22D3EE' },
  { label: 'Zamówienie', desc: 'Towar / sprzęt', icon: ShoppingCart, path: '/orders', color: '#FBBF24' },
  { label: 'CRM', desc: 'Telefon, email, spotkanie', icon: Phone, path: '/crm', color: '#34D399' },
];

export function MobileLayout({ children }: Props) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showProfile, setShowProfile] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const { isAdmin: wsIsAdmin, isTechnician: wsIsTech, isMember, isViewer, workspace } = useWorkspaceContext();
  const { isLoading: wsLoading, resolved: wsResolved } = useWorkspace();
  const isAdminOrTech = wsIsAdmin || wsIsTech;
  const geo = useGeolocation(isAdminOrTech ?? false);
  const [showPrompt, setShowPrompt] = useState(true);

  const handleStartSession = useCallback(async (clientId: string, ticketId?: string, locationId?: string) => {
    try { await sessionsApi.startMobile({ clientId, ticketId, locationId }); qc.invalidateQueries({ queryKey: ['mobile-active-session'] }); toast.success('Sesja rozpoczęta'); geo.clearEvents(); setShowPrompt(false); } catch { toast.error('Nie udało się rozpocząć sesji'); }
  }, [qc, geo]);
  const handlePauseSession = useCallback(async () => {
    try { const s = await sessionsApi.getActive(); if (s) { await sessionsApi.pause(s.id); qc.invalidateQueries({ queryKey: ['mobile-active-session'] }); } geo.clearEvents(); setShowPrompt(false); } catch { toast.error('Błąd'); }
  }, [qc, geo]);
  const handleResumeSession = useCallback(async () => {
    try { const s = await sessionsApi.getActive(); if (s) { await sessionsApi.resume(s.id); qc.invalidateQueries({ queryKey: ['mobile-active-session'] }); } geo.clearEvents(); setShowPrompt(false); } catch { toast.error('Błąd'); }
  }, [qc, geo]);
  const handleDismissPrompt = useCallback(() => { geo.clearEvents(); setShowPrompt(false); setTimeout(() => setShowPrompt(true), 120_000); }, [geo]);
  if (geo.lastEvents && !showPrompt && (geo.lastEvents.entered.length > 0 || geo.lastEvents.exited.length > 0)) setShowPrompt(true);

  if (isLoading) return (<div className="min-h-screen flex items-center justify-center" style={{ background: '#040a16' }}><div className="animate-spin h-7 w-7 border-2 border-violet-500 border-t-transparent rounded-full" /></div>);
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (!wsResolved) return (<div className="min-h-screen flex items-center justify-center" style={{ background: '#040a16' }}><div className="animate-spin h-7 w-7 border-2 border-violet-500 border-t-transparent rounded-full" /></div>);
  if (!workspace && !user?.isSuperAdmin) return <NoWorkspacePage />;
  if (isMember || isViewer) return <Navigate to="/portal" replace />;

  const isActiveTab = (tab: any) => tab.path && (tab.exact ? location.pathname === tab.path : location.pathname.startsWith(tab.path));
  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen flex flex-col relative" style={{ background: '#040a16', overflowX: 'hidden', maxWidth: '100vw' }}>

      {/* ── BG: CSS recreation of background.png ──────────────────────── */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Base image layer — very subtle */}
        <div className="absolute inset-0" style={{ backgroundImage: 'url(/bg-mobile.png)', backgroundSize: 'cover', backgroundPosition: 'center top', opacity: 0.3 }} />
        {/* CSS gradient overlays to deepen and control */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 50% at 30% 20%, rgba(99,102,241,0.08), transparent)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 40% at 70% 30%, rgba(124,58,237,0.06), transparent)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,13,25,0.15) 0%, rgba(8,13,25,0.6) 35%, rgba(8,13,25,0.95) 100%)' }} />
      </div>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="relative z-10 px-5 pb-2 flex items-center justify-between safe-area-pt" style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 16px))' }}>
        {/* Logo: [icon] InfraDesk — icon 20-25% larger */}
        <div className="flex items-center gap-[7px]">
          <img src="/logo.png" alt="InfraDesk" className="h-[70px] w-auto" />
        </div>
        {/* Right: search, GPS, avatar — compact */}
        <div className="flex items-center gap-2">
          <button onClick={() => { qc.invalidateQueries(); window.location.reload(); }}
            className="w-8 h-8 rounded-[10px] flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <RefreshCw className="h-[14px] w-[14px] text-white/25" />
          </button>
          <button onClick={() => navigate('/m/search')}
            className="w-8 h-8 rounded-[10px] flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <Search className="h-[15px] w-[15px] text-white/25" />
          </button>
          {geo.isTracking && (
            <div className="flex items-center gap-[3px] px-[7px] py-[3px] rounded-full" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.1)' }}>
              <div className="w-[5px] h-[5px] rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[8px] font-bold text-emerald-400/70 uppercase tracking-widest">GPS</span>
            </div>
          )}
          <button onClick={() => setShowProfile(!showProfile)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white active:scale-95 transition-transform"
            style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)', boxShadow: '0 0 0 1.5px rgba(255,255,255,0.06)' }}>
            {initials}
          </button>
        </div>
      </header>

      {/* ── Profile dropdown ────────────────────────────────────────────── */}
      {showProfile && (<>
        <div className="fixed inset-0 z-30" onClick={() => setShowProfile(false)} />
        <div className="absolute right-4 top-[58px] z-40 w-[250px] rounded-[18px] overflow-hidden safe-area-pt"
          style={{ background: 'rgba(12,17,30,0.97)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
          <div className="p-3.5 flex items-center gap-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>{initials}</div>
            <div className="min-w-0"><p className="text-[12px] font-semibold text-white/80 truncate">{user.firstName} {user.lastName}</p><p className="text-[10px] text-white/30 truncate">{user.email}</p></div>
          </div>
          <div className="py-0.5">
            {[
              { icon: Settings, label: 'Wersja desktopowa', act: () => { setShowProfile(false); navigate('/dashboard'); } },
              { icon: QrCode, label: 'Skanuj QR', act: () => { setShowProfile(false); navigate('/m/scan'); } },
              { icon: Ticket, label: 'Zgłoszenia', act: () => { setShowProfile(false); navigate('/m/tickets'); } },
            ].map(it => (
              <button key={it.label} onClick={it.act} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left active:bg-white/[0.02] transition-colors">
                <it.icon className="h-[14px] w-[14px] text-white/18" /><span className="text-[12px] text-white/55">{it.label}</span>
              </button>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left active:bg-white/[0.02]">
              <LogOut className="h-[14px] w-[14px] text-red-400/40" /><span className="text-[12px] text-red-400/60">Wyloguj się</span>
            </button>
          </div>
        </div>
      </>)}

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto relative z-10" style={{ paddingBottom: 'calc(92px + env(safe-area-inset-bottom, 0px))', overflowX: 'hidden' }}>{children}</main>

      {/* ── ADD overlay ─────────────────────────────────────────────────── */}
      {showAdd && (<>
        <div className="fixed inset-0 z-40" onClick={() => setShowAdd(false)} style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)' }} />
        <div className="fixed bottom-[92px] left-4 right-4 z-50 safe-area-pb">
          <div className="rounded-[20px] overflow-hidden" style={{ background: 'rgba(12,17,30,0.97)', backdropFilter: 'blur(28px)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 -8px 40px rgba(0,0,0,0.35)' }}>
            <div className="px-5 pt-4 pb-1 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-white/80">Dodaj nowy</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 rounded-lg active:bg-white/5"><X className="h-4 w-4 text-white/20" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4 pt-2">
              {ADD_ACTIONS.map(a => (
                <button key={a.label} onClick={() => { setShowAdd(false); navigate(a.path); }}
                  className="flex items-center gap-2.5 p-3 rounded-[14px] text-left active:scale-[0.97] transition-all duration-200"
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: `${a.color}10` }}>
                    <a.icon className="h-4 w-4" style={{ color: a.color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-white/75">{a.label}</p>
                    <p className="text-[9px] text-white/25 leading-tight">{a.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </>)}

      {/* Geofence */}
      {showPrompt && geo.lastEvents && (geo.lastEvents.entered.length > 0 || geo.lastEvents.exited.length > 0) && (
        <GeofencePrompt entered={geo.lastEvents.entered} exited={geo.lastEvents.exited}
          hasActiveSession={false} activeSessionPaused={false}
          onStartSession={handleStartSession} onPauseSession={handlePauseSession}
          onResumeSession={handleResumeSession} onDismiss={handleDismissPrompt} />
      )}

      {/* ── Bottom Nav — floating glass bar ─────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pointer-events-none" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}>
        <nav className="pointer-events-auto rounded-[20px]"
          style={{
            background: 'rgba(13,18,32,0.88)',
            backdropFilter: 'blur(32px) saturate(1.6)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 -1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.35)',
          }}>
          <div className="flex items-center justify-around h-[62px] px-1">
            {TABS.map((tab) => {
              if (tab.key === 'add') {
                return (
                  <button key="add" onClick={() => setShowAdd(!showAdd)}
                    className="flex items-center justify-center -mt-3 transition-all duration-250">
                    <div className="w-[44px] h-[44px] rounded-[15px] flex items-center justify-center transition-all duration-300"
                      style={{
                        background: showAdd ? 'rgba(248,113,113,0.12)' : 'linear-gradient(145deg, #7C3AED, #2563EB)',
                        boxShadow: showAdd ? 'none' : '0 2px 12px rgba(124,58,237,0.2)',
                        transform: showAdd ? 'rotate(45deg)' : 'none',
                        border: `1px solid ${showAdd ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.12)'}`,
                      }}>
                      <Plus className={`h-5 w-5 ${showAdd ? 'text-red-400/80' : 'text-white'}`} strokeWidth={2.2} />
                    </div>
                  </button>
                );
              }
              const active = isActiveTab(tab);
              const Icon = tab.icon!;
              return (
                <button key={tab.path} onClick={() => navigate(tab.path!)}
                  className="flex flex-col items-center justify-center gap-[4px] min-w-[50px] py-1 transition-all duration-200 active:scale-95">
                  <Icon
                    className={`h-[20px] w-[20px] transition-all duration-200 ${active ? 'text-violet-400' : 'text-white/40'}`}
                    strokeWidth={active ? 2.2 : 1.6} />
                  <span className={`text-[9px] font-semibold leading-none transition-all duration-200 ${active ? 'text-violet-300' : 'text-white/35'}`}>
                    {tab.label}
                  </span>
                  <div className={`w-[5px] h-[5px] rounded-full transition-all duration-200 ${active ? 'bg-violet-400' : 'bg-transparent'}`}
                    style={active ? { boxShadow: '0 0 6px rgba(167,139,250,0.6)' } : {}} />
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
