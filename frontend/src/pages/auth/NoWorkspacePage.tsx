import { LogOut, Building2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../store/workspaceStore';
import { workspacesApi } from '../../api/workspaces';
import { useState } from 'react';

export function NoWorkspacePage() {
  const { user, logout } = useAuth();
  const { setWorkspaces, markResolved } = useWorkspace();
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const ws = await workspacesApi.getMyWorkspaces();
      if (ws && ws.length > 0) {
        setWorkspaces(ws);
        navigate('/dashboard');
      } else {
        markResolved();
      }
    } catch {
      markResolved();
    } finally {
      setRetrying(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg, #040a16)' }}>
      <div className="w-full max-w-md text-center">
        <div
          className="mx-auto mb-6 w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(251,146,60,0.12)' }}
        >
          <Building2 className="h-8 w-8" style={{ color: '#fb923c' }} />
        </div>

        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--t, #fff)' }}>
          Brak przypisanego workspace
        </h1>

        <p className="text-sm mb-1" style={{ color: 'var(--tm, rgba(255,255,255,0.5))' }}>
          Twoje konto <strong style={{ color: 'var(--t, #fff)' }}>{user?.email}</strong> nie jest przypisane do
          {' '}zadnej organizacji ani workspace.
        </p>

        <p className="text-sm mb-8" style={{ color: 'var(--td, rgba(255,255,255,0.3))' }}>
          Skontaktuj sie z administratorem, aby uzyskac dostep do organizacji.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'var(--accent-g, rgba(79,140,255,0.12))',
              color: 'var(--accent, #4F8CFF)',
              border: '1px solid rgba(79,140,255,0.15)',
            }}
          >
            <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Sprawdzam...' : 'Sprawdz ponownie'}
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'rgba(239,68,68,0.08)',
              color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.12)',
            }}
          >
            <LogOut className="h-4 w-4" />
            Wyloguj sie
          </button>
        </div>
      </div>
    </div>
  );
}
