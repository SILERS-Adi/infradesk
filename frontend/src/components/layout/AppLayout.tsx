import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';

export function AppLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isLoading) return (
    <div className="h-screen flex items-center justify-center" style={{ background: '#080D19' }}>
      <div className="animate-spin h-7 w-7 border-2 border-violet-500 border-t-transparent rounded-full" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'CLIENT') return <Navigate to="/portal" replace />;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#080D19' }}>
      {/* Sidebar – desktop — z-index above bg layers */}
      <div className="hidden md:flex flex-shrink-0 relative z-[2]">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      </div>

      {/* Sidebar overlay – mobile */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 flex h-full w-[220px]">
            <Sidebar collapsed={false} onToggle={() => {}} mobile onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar onMenuClick={() => setMobileOpen(true)} />

        <main className="flex-1 overflow-y-auto relative">
          {/* Layer 1: Background image */}
          <div className="fixed inset-0 pointer-events-none z-0">
            <div className="absolute inset-0" style={{
              backgroundImage: 'url(/tlo.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.18,
              filter: 'blur(1px)',
            }} />
          </div>

          {/* Layer 2: Dark overlay for readability */}
          <div className="fixed inset-0 pointer-events-none z-0" style={{
            background: 'linear-gradient(180deg, rgba(8,13,25,0.78) 0%, rgba(8,13,25,0.88) 50%, rgba(8,13,25,0.94) 100%)',
          }} />

          {/* Layer 3: Subtle radial glow behind content center */}
          <div className="fixed inset-0 pointer-events-none z-0">
            <div className="absolute top-[10%] left-[30%] w-[50%] h-[40%] rounded-full" style={{
              background: 'radial-gradient(ellipse, rgba(139,92,246,0.04), transparent 70%)',
            }} />
            <div className="absolute bottom-[10%] right-[20%] w-[40%] h-[30%] rounded-full" style={{
              background: 'radial-gradient(ellipse, rgba(37,99,235,0.03), transparent 70%)',
            }} />
          </div>

          {/* Content */}
          <div className="relative z-10 p-4 md:p-6 pb-20 md:pb-6">
            {children}
          </div>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
