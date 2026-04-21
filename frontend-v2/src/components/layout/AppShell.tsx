import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <div style={{ marginLeft: 240 }}>
        <Topbar />
        <main className="p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
