import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { DsShell } from './DsShell';
import { useUiFlag } from '@/lib/uiFlag';

/**
 * AppShell — globalny layout InfraDesk.
 *
 * Faza 2D Batch 1: dwa warianty, sterowane feature flag `?ui=new`:
 *  - 'new'    → DS shell (DsShell.tsx) z Silers Design System primitives
 *  - 'legacy' → istniejący layout (zachowany 1:1, zero zmian behavior)
 *
 * Rollback: dodaj `?ui=legacy` do URL lub wyczyść localStorage["sd-ui"].
 *
 * Logika auth/routing/permissions NIE jest zmieniana — oba warianty czytają te
 * same useQuery z @tanstack/react-query (cache współdzielony).
 */
export function AppShell() {
  const variant = useUiFlag();
  if (variant === 'new') return <DsShell />;
  return <LegacyAppShell />;
}

function LegacyAppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* lg+: fixed sidebar always visible. <lg: off-canvas drawer toggled by Topbar. */}
      <div className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out lg:translate-x-0 ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onNavigate={() => setDrawerOpen(false)} />
      </div>
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}
      <div className="lg:ml-[240px]">
        <Topbar onMenuClick={() => setDrawerOpen((v) => !v)} />
        <main className="p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
