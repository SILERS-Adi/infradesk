import { useNavigate } from 'react-router-dom';
import { LogOut, Monitor, MapPin, Bell, Shield, Navigation, ChevronRight } from 'lucide-react';
import { useAuth } from '../../store/authStore';
import { useGeolocation } from '../../hooks/useGeolocation';

export function MobileProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const geo = useGeolocation(false);

  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="px-5 py-4 space-y-5">
      {/* User card */}
      <div className="rounded-[22px] p-5 flex items-center gap-4 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(91,95,239,0.2) 0%, rgba(20,30,48,0.72) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(14px)',
        }}>
        <div className="absolute top-0 right-0 w-28 h-28 rounded-full opacity-15 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #5B5FEF, transparent)' }} />
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #5B5FEF, #00C2FF)' }}>
          {initials}
        </div>
        <div className="min-w-0 relative z-10">
          <h1 className="text-lg font-bold" style={{ color: '#E5E7EB' }}>{user?.firstName} {user?.lastName}</h1>
          <p className="text-sm truncate" style={{ color: '#6B7280' }}>{user?.email}</p>
          <span className="inline-block mt-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(91,95,239,0.2)', color: '#818CF8' }}>
            {user?.role === 'ADMIN' ? 'Administrator' : 'Technik'}
          </span>
        </div>
      </div>

      {/* Menu */}
      <div className="space-y-2">
        <button onClick={() => navigate('/dashboard')}
          className="w-full flex items-center gap-4 p-4 rounded-[18px] text-left active:scale-[0.98] transition-all duration-200"
          style={{ background: 'rgba(20,30,48,0.72)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(14px)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(91,95,239,0.15)' }}>
            <Monitor className="h-5 w-5" style={{ color: '#818CF8' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: '#E5E7EB' }}>Wersja desktopowa</p>
            <p className="text-xs" style={{ color: '#6B7280' }}>Przełącz na pełny panel</p>
          </div>
          <ChevronRight className="h-4 w-4" style={{ color: '#4B5563' }} />
        </button>

        {/* GPS Status */}
        <div className="w-full flex items-center gap-4 p-4 rounded-[18px] text-left"
          style={{ background: 'rgba(20,30,48,0.72)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(14px)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: geo.permissionStatus === 'granted' ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)' }}>
            <MapPin className="h-5 w-5" style={{ color: geo.permissionStatus === 'granted' ? '#22C55E' : '#6B7280' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: '#E5E7EB' }}>Geolokalizacja</p>
            <p className="text-xs" style={{ color: '#6B7280' }}>
              {geo.permissionStatus === 'granted' && geo.isTracking && 'Aktywna — śledzenie pozycji'}
              {geo.permissionStatus === 'granted' && !geo.isTracking && 'Uprawnienia OK'}
              {geo.permissionStatus === 'denied' && 'Brak uprawnień — włącz w ustawieniach'}
              {geo.permissionStatus === 'prompt' && 'Oczekuje na zgodę'}
              {geo.permissionStatus === 'unknown' && 'Sprawdzanie...'}
            </p>
            {geo.lastPosition && (
              <div className="flex items-center gap-1 mt-1">
                <Navigation className="h-3 w-3" style={{ color: '#6B7280' }} />
                <span className="text-[10px]" style={{ color: '#6B7280' }}>
                  {geo.lastPosition.lat.toFixed(4)}, {geo.lastPosition.lng.toFixed(4)}
                  {geo.lastPosition.accuracy && ` (±${Math.round(geo.lastPosition.accuracy)}m)`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Nearby */}
        {geo.nearLocations.length > 0 && (
          <div className="p-4 rounded-[18px]"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#22C55E' }}>W pobliżu</p>
            {geo.nearLocations.map(l => (
              <p key={l.id} className="text-sm" style={{ color: '#22C55E' }}>{l.clientName} · {l.name}</p>
            ))}
          </div>
        )}

        <div className="w-full flex items-center gap-4 p-4 rounded-[18px] text-left"
          style={{ background: 'rgba(20,30,48,0.72)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(14px)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,194,255,0.1)' }}>
            <Bell className="h-5 w-5" style={{ color: '#00C2FF' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: '#E5E7EB' }}>Powiadomienia</p>
            <p className="text-xs" style={{ color: '#6B7280' }}>Automatyczne alerty GPS</p>
          </div>
        </div>

        <div className="w-full flex items-center gap-4 p-4 rounded-[18px] text-left"
          style={{ background: 'rgba(20,30,48,0.72)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(14px)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(107,114,128,0.1)' }}>
            <Shield className="h-5 w-5" style={{ color: '#6B7280' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#E5E7EB' }}>Wersja</p>
            <p className="text-xs" style={{ color: '#6B7280' }}>InfraDesk Mobile v2.0</p>
          </div>
        </div>
      </div>

      {/* Logout */}
      <button onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-base active:scale-[0.98] transition-all duration-200"
        style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444' }}>
        <LogOut className="h-5 w-5" />
        Wyloguj się
      </button>
    </div>
  );
}
