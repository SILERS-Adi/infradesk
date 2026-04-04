import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Sun, Moon, SunMoon } from 'lucide-react';
import { useTheme } from '../../store/themeStore';
import { useMenuStore } from '../../store/menuStore';
import { clsx } from 'clsx';
import { SidebarNav } from './sidebar/SidebarNav';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobile?: boolean;
  onClose?: () => void;
}

export function Sidebar({ collapsed, onToggle, mobile, onClose }: SidebarProps) {
  const { resolved: themeResolved } = useTheme();
  const isEditMode = useMenuStore(s => s.isEditMode);
  const cancelEditMode = useMenuStore(s => s.cancelEditMode);

  // Auto-exit edit mode when sidebar collapses or on mobile
  useEffect(() => {
    if (isEditMode && (collapsed || mobile)) {
      cancelEditMode();
    }
  }, [collapsed, mobile, isEditMode, cancelEditMode]);

  return (
    <aside className={clsx('sidebar', collapsed && 'collapsed')}
      style={collapsed ? { width: 64 } : undefined}>

      {/* Logo */}
      <div className="sidebar-header">
        {mobile && (
          <button onClick={onClose} className="absolute top-2 right-2 p-1 rounded z-10"
            style={{ color: 'var(--tm)' }}>
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="sidebar-logo">
          <img src={collapsed ? "/logo-icon.png" : themeResolved === 'light' ? "/logo-dark.png" : "/logo.png"} alt="InfraDesk"
            style={collapsed ? { height: 40, width: 40, objectFit: 'contain' } : { height: 90, objectFit: 'contain' }} />
        </div>
      </div>

      {/* Nav — registry-driven with customization support */}
      <SidebarNav collapsed={collapsed} mobile={mobile} onMobileClose={onClose} />

      {/* Theme switcher */}
      <ThemeSwitcher collapsed={collapsed} />

      {/* Footer */}
      <div className="sidebar-footer">
        {!collapsed && (
          <div className="mode-switch" onClick={onToggle}>
            <span className="mode-label">Zwiń panel</span>
            <ChevronLeft style={{ width: 12, height: 12, color: 'var(--tm)' }} />
          </div>
        )}
        {collapsed && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 8 }}>
              <ChevronRight style={{ width: 14, height: 14 }} />
            </button>
          </div>
        )}
        <div className="sidebar-version">InfraDesk v5.0.0 · © SILERS</div>
      </div>
    </aside>
  );
}

function ThemeSwitcher({ collapsed }: { collapsed: boolean }) {
  const { mode, setMode } = useTheme();

  if (collapsed) {
    return (
      <div style={{ padding: '8px 6px', borderTop: '1px solid var(--border)' }}>
        <button onClick={() => setMode(mode === 'dark' ? 'light' : mode === 'light' ? 'auto' : 'dark')}
          className="theme-toggle" style={{ margin: '0 auto', display: 'flex' }}>
          {mode === 'light' ? <Sun style={{ width: 14, height: 14 }} /> : <Moon style={{ width: 14, height: 14 }} />}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', borderRadius: 8, background: 'var(--glass-bg, rgba(255,255,255,0.04))', border: '1px solid var(--border)', padding: 2 }}>
        {(['light', 'auto', 'dark'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 500, border: 'none', cursor: 'pointer',
              color: mode === m ? 'var(--accent, #4F8CFF)' : 'var(--td)',
              background: mode === m ? 'var(--accent-g, rgba(79,140,255,0.12))' : 'transparent',
              transition: 'all .2s',
            }}>
            {m === 'light' && <Sun style={{ width: 12, height: 12 }} />}
            {m === 'auto' && <SunMoon style={{ width: 12, height: 12 }} />}
            {m === 'dark' && <Moon style={{ width: 12, height: 12 }} />}
            {m === 'light' ? 'Jasny' : m === 'auto' ? 'Auto' : 'Ciemny'}
          </button>
        ))}
      </div>
    </div>
  );
}
