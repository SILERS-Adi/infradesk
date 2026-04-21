import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { TicketsPage } from '@/features/tickets/TicketsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/tickets/:id" element={<Placeholder title="Szczegóły zgłoszenia" />} />
            <Route path="/devices" element={<Placeholder title="Urządzenia" />} />
            <Route path="/locations" element={<Placeholder title="Lokalizacje" />} />
            <Route path="/clients" element={<Placeholder title="Klienci (CRM)" />} />
            <Route path="/orders" element={<Placeholder title="Zakupy" />} />
            <Route path="/vault" element={<Placeholder title="Sejf haseł" />} />
            <Route path="/monitoring" element={<Placeholder title="Monitoring" />} />
            <Route path="/ai" element={<Placeholder title="AI (Iris)" />} />
            <Route path="/settings" element={<Placeholder title="Ustawienia" />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" toastOptions={{ style: { background: 'hsl(var(--surface))', color: 'hsl(var(--t))', border: '1px solid hsl(var(--border))' } }} />
    </QueryClientProvider>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-tx mb-2">{title}</h1>
        <p className="text-sm text-tx3">Wkrótce — moduł zgodny z dual-view (wizualnie/tabelarycznie) + 3-tryby dodawania.</p>
      </div>
    </div>
  );
}
