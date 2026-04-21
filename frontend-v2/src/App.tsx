import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { TicketsPage } from '@/features/tickets/TicketsPage';
import { ComingSoon } from '@/components/ui/ComingSoon';

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
            <Route path="/" element={<DashboardPage />} />

            {/* OPERACJE */}
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/tickets/:id" element={<ComingSoon title="Szczegóły zgłoszenia" sprint="Sprint 2" />} />
            <Route path="/tasks" element={<ComingSoon title="Zadania" sprint="Sprint 2" />} />
            <Route path="/calendar" element={<ComingSoon title="Kalendarz" sprint="Sprint 2" />} />
            <Route path="/sessions" element={<ComingSoon title="Sesje pracy" sprint="Sprint 2" />} />
            <Route path="/billing" element={<ComingSoon title="Rozliczenia" sprint="Sprint 2" />} />
            <Route path="/alerts" element={<ComingSoon title="Alerty i asystenci" sprint="Sprint 2" />} />
            <Route path="/orders" element={<ComingSoon title="Zamówienia klientów" sprint="Sprint 2" />} />
            <Route path="/delegations" element={<ComingSoon title="Delegacje" sprint="Sprint 2" />} />
            <Route path="/portal-settings" element={<ComingSoon title="Portal i obsługa" sprint="Sprint 5" />} />

            {/* KLIENCI */}
            <Route path="/clients" element={<ComingSoon title="Firmy klientów" sprint="Sprint 3" />} />
            <Route path="/clients/:id" element={<ComingSoon title="Szczegóły klienta" sprint="Sprint 3" />} />
            <Route path="/contacts" element={<ComingSoon title="Kontakty" sprint="Sprint 3" />} />
            <Route path="/locations" element={<ComingSoon title="Lokalizacje" sprint="Sprint 3" />} />
            <Route path="/partners" element={<ComingSoon title="Partnerzy IT" sprint="Phase 2 (post-launch)" />} />

            {/* INFRASTRUKTURA */}
            <Route path="/devices" element={<ComingSoon title="Urządzenia" sprint="Sprint 3" />} />
            <Route path="/agents" element={<ComingSoon title="Asystenci" sprint="Sprint 3" />} />
            <Route path="/monitoring" element={<ComingSoon title="Audyt i sieć" sprint="Sprint 3" />} />
            <Route path="/backups" element={<ComingSoon title="Kopie zapasowe" sprint="Sprint 3" />} />
            <Route path="/activity-logs" element={<ComingSoon title="Logi aktywności" sprint="Sprint 3" />} />

            {/* VAULT */}
            <Route path="/vault" element={<ComingSoon title="Sejf haseł — Wszystkie" sprint="Sprint 4" />} />
            <Route path="/vault/mine" element={<ComingSoon title="Sejf haseł — Moje" sprint="Sprint 4" />} />
            <Route path="/vault/shared" element={<ComingSoon title="Sejf haseł — Współdzielone" sprint="Sprint 4" />} />

            {/* AI */}
            <Route path="/ai" element={<ComingSoon title="Czat z Iris" sprint="Sprint 4" />} />
            <Route path="/ai/shadow" element={<ComingSoon title="Shadow Mode raport" sprint="Sprint 4" />} />
            <Route path="/ai/insights" element={<ComingSoon title="AI Insights" sprint="Sprint 4" />} />
            <Route path="/ai/time" element={<ComingSoon title="Invisible Time Tracking" sprint="Sprint 7 (pionier)" />} />
            <Route path="/ai/usage" element={<ComingSoon title="Koszty AI" sprint="Sprint 4" />} />

            {/* MOJA FIRMA */}
            <Route path="/my-company" element={<ComingSoon title="Moje dane" sprint="Sprint 4" />} />
            <Route path="/users" element={<ComingSoon title="Użytkownicy" sprint="Sprint 4" />} />
            <Route path="/plan-and-modules" element={<ComingSoon title="Plan i moduły" sprint="Sprint 4" />} />
            <Route path="/settings" element={<ComingSoon title="Ustawienia" sprint="Sprint 4" />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--sf)',
            color: 'var(--tx)',
            border: '1px solid var(--bd)',
            borderRadius: 'var(--r-s)',
            fontSize: 13,
          },
        }}
      />
    </QueryClientProvider>
  );
}
