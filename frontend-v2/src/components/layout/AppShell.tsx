import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
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
