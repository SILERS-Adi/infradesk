import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import IrisEmbedPage from './features/iris/IrisEmbedPage';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { TicketsPage } from '@/features/tickets/TicketsPage';
import { TicketDetailPage } from '@/features/tickets/TicketDetailPage';
import { NewTicketPage } from '@/features/tickets/NewTicketPage';
import { SessionsPage } from '@/features/sessions/SessionsPage';
import { TasksPage, TaskNewPage } from '@/features/tasks/TasksPage';
import { AlertsPage } from '@/features/alerts/AlertsPage';
import { OrdersPage, OrderNewPage } from '@/features/orders/OrdersPage';
import { DelegationsPage } from '@/features/delegations/DelegationsPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { BillingPage } from '@/features/billing/BillingPage';
import { ClientsPage, ClientNewPage } from '@/features/clients/ClientsPage';
import { ClientDetailPage } from '@/features/clients/ClientDetailPage';
import { CrmHubPage } from '@/features/crm/CrmHubPage';
import { ContactNewPage } from '@/features/contacts/ContactsPage';
import { LocationsPage, LocationNewPage } from '@/features/locations/LocationsPage';
import { DevicesPage, DeviceNewPage } from '@/features/devices/DevicesPage';
import { AgentsPage } from '@/features/agents/AgentsPage';
import { BackupsPage } from '@/features/backups/BackupsPage';
import { ActivityLogsPage } from '@/features/activity-logs/ActivityLogsPage';
import { MonitoringPage } from '@/features/monitoring/MonitoringPage';
import { VaultPage } from '@/features/vault/VaultPage';
import { MyCompanyPage } from '@/features/my-company/MyCompanyPage';
import { UsersPage } from '@/features/users/UsersPage';
import { MemberFormPage, MemberEditPage } from '@/features/users/MemberForm';
import { PlanAndModulesPage } from '@/features/plan-and-modules/PlanAndModulesPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { IrisChatPage } from '@/features/ai/IrisChatPage';
import { ShadowModePage } from '@/features/ai/ShadowModePage';
import { AiInsightsPage } from '@/features/ai/AiInsightsPage';
import { AiUsagePage } from '@/features/ai/AiUsagePage';
import { PortalSettingsPage } from '@/features/portal-settings/PortalSettingsPage';
import { DownloadsPage, DownloadNewPage } from '@/features/downloads/DownloadsPage';
import { StoragePage } from '@/features/storage/StoragePage';
import { ComingSoon } from "@/components/ui/ComingSoon";
import { IdCoreShowcasePage } from "@/features/design/IdCoreShowcasePage";
import { IdCorePublicPreview } from "@/features/design/IdCorePublicPreview";
import { DesignIndexPage } from "@/features/design/DesignIndexPage";
import { UiSystemPage } from "@/features/design/UiSystemPage";

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
          <Route path="/iris-embed" element={<IrisEmbedPage />} />
          <Route path="/public/design/id-core-preview" element={<IdCorePublicPreview />} />
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
            <Route path="/tickets/new" element={<NewTicketPage />} />
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/tasks/new" element={<TaskNewPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/new" element={<OrderNewPage />} />
            <Route path="/delegations" element={<DelegationsPage />} />
            <Route path="/portal-settings" element={<PortalSettingsPage />} />
            <Route path="/downloads" element={<DownloadsPage />} />
            <Route path="/downloads/new" element={<DownloadNewPage />} />
            <Route path="/storage" element={<StoragePage />} />

            {/* KLIENCI */}
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/new" element={<ClientNewPage />} />
            <Route path="/clients/:id" element={<ClientDetailPage />} />
            <Route path="/crm" element={<CrmHubPage />} />
            <Route path="/contacts" element={<Navigate to="/crm" replace />} />
            <Route path="/contacts/new" element={<ContactNewPage />} />
            <Route path="/locations" element={<LocationsPage />} />
            <Route path="/locations/new" element={<LocationNewPage />} />
            <Route path="/partners" element={<ComingSoon title="Partnerzy IT" sprint="Phase 2 (post-launch)" />} />

            {/* INFRASTRUKTURA */}
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/devices/new" element={<DeviceNewPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/monitoring" element={<MonitoringPage />} />
            <Route path="/backups" element={<BackupsPage />} />
            <Route path="/activity-logs" element={<ActivityLogsPage />} />

            {/* VAULT */}
            <Route path="/vault" element={<VaultPage />} />
            <Route path="/vault/:scope" element={<VaultPage />} />

            {/* AI */}
            <Route path="/ai" element={<IrisChatPage />} />
            <Route path="/ai/shadow" element={<ShadowModePage />} />
            <Route path="/ai/insights" element={<AiInsightsPage />} />
            <Route path="/ai/time" element={<ComingSoon title="Invisible Time Tracking" sprint="Sprint 7 (pionier)" />} />
            <Route path="/ai/usage" element={<AiUsagePage />} />

            {/* MOJA FIRMA */}
            <Route path="/my-company" element={<MyCompanyPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/new" element={<MemberFormPage />} />
            <Route path="/users/:id/edit" element={<MemberEditPage />} />
            <Route path="/plan-and-modules" element={<PlanAndModulesPage />} />
            <Route path="/settings" element={<SettingsPage />} />

            {/* DESIGN SYSTEM */}
            <Route path="/design" element={<DesignIndexPage />} />
            <Route path="/design/ui" element={<UiSystemPage />} />
            <Route path="/design/id-core" element={<IdCoreShowcasePage />} />
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
