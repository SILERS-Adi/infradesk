import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { VoiceAssistant } from '../VoiceAssistant';

export function OperationsLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { isAdmin, isMember, isViewer } = useWorkspaceContext();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isLoading) return (
    <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="animate-spin h-7 w-7 border-2 border-violet-500 border-t-transparent rounded-full" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // MEMBER/VIEWER without admin/tech role go to portal (superadmin bypasses)
  if ((isMember || isViewer) && !user?.isSuperAdmin) return <Navigate to="/portal" replace />;

  return (
    <div className="app app-shell">
      {/* Sidebar desktop */}
      <div className="hidden md:flex flex-shrink-0 relative z-[2]">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      </div>

      {/* Sidebar mobile */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 flex h-full" style={{ width: 210 }}>
            <Sidebar collapsed={false} onToggle={() => {}} mobile onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="main">
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        <div className="content">
          {children}
        </div>
      </div>

      {isAdmin && <VoiceAssistant />}
    </div>
  );
}
