import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import { useWorkspace } from '../../store/workspaceStore';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { VoiceAssistant } from '../VoiceAssistant';
import { NoWorkspacePage } from '../../pages/auth/NoWorkspacePage';
import { ErrorBoundary } from '../ui/ErrorBoundary';

export function OperationsLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { isAdmin, isMember, isViewer, workspace } = useWorkspaceContext();
  const { isLoading: wsLoading, resolved: wsResolved } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auth still loading
  if (isLoading) return (
    <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="animate-spin h-7 w-7 border-2 border-violet-500 border-t-transparent rounded-full" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Workspace still loading (not yet resolved)
  if (!wsResolved) return (
    <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="animate-spin h-7 w-7 border-2 border-violet-500 border-t-transparent rounded-full" />
    </div>
  );
  // Workspace resolved but empty — no workspace assigned (superadmin bypasses)
  if (!workspace && !user?.isSuperAdmin) return <NoWorkspacePage />;
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
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </div>

      {isAdmin && <VoiceAssistant />}
    </div>
  );
}
