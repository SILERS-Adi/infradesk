import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { AuthBootstrap } from '@/features/auth/AuthBootstrap';
import { RequireRole, type Role } from '@/features/auth/RequireRole';
import { CookieBanner } from '@/components/ui/CookieBanner';
import { ForceTwoFactorSetup } from '@/features/auth/ForceTwoFactorSetup';

const ADMIN_ONLY: readonly Role[] = ['OWNER', 'ADMIN'];
const SUPER_ADMIN_ONLY: readonly Role[] = []; // empty = require isSuperAdmin shortcut in RequireRole
import { AppShell } from '@/components/layout/AppShell';
import { ComingSoon } from '@/components/ui/ComingSoon';
import { NotFoundPage } from '@/components/ui/NotFoundPage';

// ─── helper: lazy-load a named export ──────────────────────────────────────
function lazyNamed<P>(
  loader: () => Promise<Record<string, unknown>>,
  exportName: string,
) {
  return lazy(async () => {
    const mod = await loader();
    return { default: mod[exportName] as ComponentType<P> };
  });
}

// ─── Auth pages ────────────────────────────────────────────────────────────
const LoginPage          = lazyNamed(() => import('@/features/auth/LoginPage'),          'LoginPage');
const RegisterPage       = lazyNamed(() => import('@/features/auth/RegisterPage'),       'RegisterPage');
const ForgotPasswordPage = lazyNamed(() => import('@/features/auth/ForgotPasswordPage'), 'ForgotPasswordPage');
const ResetPasswordPage  = lazyNamed(() => import('@/features/auth/ResetPasswordPage'),  'ResetPasswordPage');
const VerifyEmailPage    = lazyNamed(() => import('@/features/auth/VerifyEmailPage'),    'VerifyEmailPage');
const AcceptInvitePage   = lazyNamed(() => import('@/features/auth/AcceptInvitePage'),   'AcceptInvitePage');
const PartnerSharePage   = lazyNamed(() => import('@/features/public/PartnerSharePage'), 'PartnerSharePage');
const PartnerSharesPage  = lazyNamed(() => import('@/features/partner-shares/PartnerSharesPage'), 'PartnerSharesPage');

// ─── Public marketing pages ────────────────────────────────────────────────
const PublicLayout    = lazyNamed(() => import('@/features/public/PublicLayout'),    'PublicLayout');
const LandingPage     = lazyNamed(() => import('@/features/public/LandingPage'),     'LandingPage');
const JakToDzialaPage = lazyNamed(() => import('@/features/public/JakToDzialaPage'), 'JakToDzialaPage');
const CennikPage      = lazyNamed(() => import('@/features/public/CennikPage'),      'CennikPage');
const PobieraniePage  = lazyNamed(() => import('@/features/public/PobieraniePage'),  'PobieraniePage');
const KontaktPage     = lazyNamed(() => import('@/features/public/KontaktPage'),     'KontaktPage');
const ChangelogPage   = lazyNamed(() => import('@/features/public/ChangelogPage'),   'ChangelogPage');
const LegalPage       = lazyNamed(() => import('@/features/public/LegalPage'),       'LegalPage');
const PressPage       = lazyNamed(() => import('@/features/public/PressPage'),       'PressPage');

// ─── Iris embed (standalone, used in iframes) ──────────────────────────────
const IrisEmbedPage      = lazy(() => import('./features/iris/IrisEmbedPage'));
const IdCorePublicPreview = lazyNamed(() => import('@/features/design/IdCorePublicPreview'), 'IdCorePublicPreview');

// ─── Panel pages (auth-required) ───────────────────────────────────────────
const DashboardPage     = lazyNamed(() => import('@/features/dashboard/DashboardPage'),     'DashboardPage');
const TicketsPage       = lazyNamed(() => import('@/features/tickets/TicketsPage'),         'TicketsPage');
const TicketDetailPage  = lazyNamed(() => import('@/features/tickets/TicketDetailPage'),    'TicketDetailPage');
const NewTicketPage     = lazyNamed(() => import('@/features/tickets/NewTicketPage'),       'NewTicketPage');
const SessionsPage      = lazyNamed(() => import('@/features/sessions/SessionsPage'),       'SessionsPage');
const TasksPage         = lazyNamed(() => import('@/features/tasks/TasksPage'),             'TasksPage');
const TaskNewPage       = lazyNamed(() => import('@/features/tasks/TasksPage'),             'TaskNewPage');
const TaskDetailPage    = lazyNamed(() => import('@/features/tasks/TaskDetailPage'),        'TaskDetailPage');
const PortalPage        = lazyNamed(() => import('@/features/portal/PortalPage'),           'PortalPage');
const AlertsPage        = lazyNamed(() => import('@/features/alerts/AlertsPage'),           'AlertsPage');
const OrdersPage        = lazyNamed(() => import('@/features/orders/OrdersPage'),           'OrdersPage');
const OrderNewPage      = lazyNamed(() => import('@/features/orders/OrdersPage'),           'OrderNewPage');
const OrderDetailPage   = lazyNamed(() => import('@/features/orders/OrderDetailPage'),      'OrderDetailPage');
const DelegationsPage   = lazyNamed(() => import('@/features/delegations/DelegationsPage'), 'DelegationsPage');
const CalendarPage      = lazyNamed(() => import('@/features/calendar/CalendarPage'),       'CalendarPage');
const BillingPage       = lazyNamed(() => import('@/features/billing/BillingPage'),         'BillingPage');
const InvoicePage       = lazyNamed(() => import('@/features/billing/InvoicePage'),         'InvoicePage');
const ClientsPage       = lazyNamed(() => import('@/features/clients/ClientsPage'),         'ClientsPage');
const ClientNewPage     = lazyNamed(() => import('@/features/clients/ClientsPage'),         'ClientNewPage');
const ClientDetailPage  = lazyNamed(() => import('@/features/clients/ClientDetailPage'),    'ClientDetailPage');
const CrmHubPage        = lazyNamed(() => import('@/features/crm/CrmHubPage'),              'CrmHubPage');
const ContactNewPage    = lazyNamed(() => import('@/features/contacts/ContactsPage'),       'ContactNewPage');
const LocationsPage     = lazyNamed(() => import('@/features/locations/LocationsPage'),     'LocationsPage');
const LocationNewPage   = lazyNamed(() => import('@/features/locations/LocationsPage'),     'LocationNewPage');
const DevicesPage       = lazyNamed(() => import('@/features/devices/DevicesPage'),         'DevicesPage');
const DeviceNewPage     = lazyNamed(() => import('@/features/devices/DevicesPage'),         'DeviceNewPage');
const DeviceDetailPage  = lazy(() => import('@/features/devices/DeviceDetailPage'));
const AgentsPage        = lazyNamed(() => import('@/features/agents/AgentsPage'),           'AgentsPage');
const BackupsPage       = lazyNamed(() => import('@/features/backups/BackupsPage'),         'BackupsPage');
const ActivityLogsPage  = lazyNamed(() => import('@/features/activity-logs/ActivityLogsPage'), 'ActivityLogsPage');
const MonitoringPage    = lazyNamed(() => import('@/features/monitoring/MonitoringPage'),   'MonitoringPage');
const VaultPage         = lazyNamed(() => import('@/features/vault/VaultPage'),             'VaultPage');
const MyCompanyPage     = lazyNamed(() => import('@/features/my-company/MyCompanyPage'),    'MyCompanyPage');
const UsersPage         = lazyNamed(() => import('@/features/users/UsersPage'),             'UsersPage');
const MemberFormPage    = lazyNamed(() => import('@/features/users/MemberForm'),            'MemberFormPage');
const MemberEditPage    = lazyNamed(() => import('@/features/users/MemberForm'),            'MemberEditPage');
const PlanAndModulesPage = lazyNamed(() => import('@/features/plan-and-modules/PlanAndModulesPage'), 'PlanAndModulesPage');
const SettingsPage      = lazyNamed(() => import('@/features/settings/SettingsPage'),       'SettingsPage');
const IrisChatPage      = lazyNamed(() => import('@/features/ai/IrisChatPage'),             'IrisChatPage');
const ShadowModePage    = lazyNamed(() => import('@/features/ai/ShadowModePage'),           'ShadowModePage');
const AiInsightsPage    = lazyNamed(() => import('@/features/ai/AiInsightsPage'),           'AiInsightsPage');
const AiUsagePage       = lazyNamed(() => import('@/features/ai/AiUsagePage'),              'AiUsagePage');
const PortalSettingsPage = lazyNamed(() => import('@/features/portal-settings/PortalSettingsPage'), 'PortalSettingsPage');
const DownloadsPage     = lazyNamed(() => import('@/features/downloads/DownloadsPage'),     'DownloadsPage');
const DownloadNewPage   = lazyNamed(() => import('@/features/downloads/DownloadsPage'),     'DownloadNewPage');
const StoragePage       = lazyNamed(() => import('@/features/storage/StoragePage'),         'StoragePage');
const IdCoreShowcasePage = lazyNamed(() => import('@/features/design/IdCoreShowcasePage'),  'IdCoreShowcasePage');
const DesignIndexPage   = lazyNamed(() => import('@/features/design/DesignIndexPage'),      'DesignIndexPage');
const UiSystemPage      = lazyNamed(() => import('@/features/design/UiSystemPage'),         'UiSystemPage');
// Faza 2D Batch 1: /dashboard-pilot usunięty — produkcyjny /dashboard ma teraz wbudowany
// DS variant kontrolowany feature flagą ?ui=new (patrz @/lib/uiFlag).

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

function FullPageSpinner() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--bg)' }}
    >
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--tx3)' }} />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthBootstrap>
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
        <CookieBanner />
        <ForceTwoFactorSetup />
        <Suspense fallback={<FullPageSpinner />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/password-reset" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
            <Route path="/share/:token" element={<PartnerSharePage />} />
            <Route path="/iris-embed" element={<IrisEmbedPage />} />
            <Route path="/public/design/id-core-preview" element={<IdCorePublicPreview />} />

            {/* PUBLIC marketing site */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/jak-to-dziala" element={<JakToDzialaPage />} />
              <Route path="/cennik" element={<CennikPage />} />
              <Route path="/pobieranie" element={<PobieraniePage />} />
              <Route path="/kontakt" element={<KontaktPage />} />
              <Route path="/changelog" element={<ChangelogPage />} />
              <Route path="/regulamin" element={<LegalPage />} />
              <Route path="/prywatnosc" element={<LegalPage />} />
              <Route path="/rodo" element={<LegalPage />} />
              <Route path="/press" element={<PressPage />} />
            </Route>

            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />

              {/* OPERACJE */}
              <Route path="/tickets" element={<TicketsPage />} />
              <Route path="/tickets/new" element={<NewTicketPage />} />
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/tasks/new" element={<TaskNewPage />} />
              <Route path="/tasks/:id" element={<TaskDetailPage />} />
              <Route path="/portal" element={<PortalPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/billing/invoices/:id" element={<InvoicePage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/new" element={<OrderNewPage />} />
              <Route path="/orders/:id" element={<OrderDetailPage />} />
              <Route path="/delegations" element={<DelegationsPage />} />
              <Route path="/portal-settings" element={<PortalSettingsPage />} />
              <Route path="/downloads" element={<DownloadsPage />} />
              <Route path="/downloads/new" element={<DownloadNewPage />} />
              <Route path="/storage" element={<RequireRole roles={ADMIN_ONLY}><StoragePage /></RequireRole>} />

              {/* KLIENCI */}
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/clients/new" element={<ClientNewPage />} />
              <Route path="/clients/:id" element={<ClientDetailPage />} />
              <Route path="/crm" element={<CrmHubPage />} />
              <Route path="/contacts" element={<Navigate to="/crm" replace />} />
              <Route path="/contacts/new" element={<ContactNewPage />} />
              <Route path="/locations" element={<LocationsPage />} />
              <Route path="/locations/new" element={<LocationNewPage />} />
              <Route path="/partners" element={<PartnerSharesPage />} />

              {/* INFRASTRUKTURA */}
              <Route path="/devices" element={<DevicesPage />} />
              <Route path="/devices/new" element={<DeviceNewPage />} />
              <Route path="/devices/:id" element={<DeviceDetailPage />} />
              <Route path="/agents" element={<RequireRole roles={ADMIN_ONLY}><AgentsPage /></RequireRole>} />
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
              <Route path="/users" element={<RequireRole roles={ADMIN_ONLY}><UsersPage /></RequireRole>} />
              <Route path="/users/new" element={<RequireRole roles={ADMIN_ONLY}><MemberFormPage /></RequireRole>} />
              <Route path="/users/:id/edit" element={<RequireRole roles={ADMIN_ONLY}><MemberEditPage /></RequireRole>} />
              <Route path="/plan-and-modules" element={<RequireRole roles={ADMIN_ONLY}><PlanAndModulesPage /></RequireRole>} />
              <Route path="/settings" element={<SettingsPage />} />

              {/* Design system — internal showcase. Empty roles[] + isSuperAdmin shortcut = super-admin only. */}
              <Route path="/design" element={<RequireRole roles={SUPER_ADMIN_ONLY}><DesignIndexPage /></RequireRole>} />
              <Route path="/design/ui" element={<RequireRole roles={SUPER_ADMIN_ONLY}><UiSystemPage /></RequireRole>} />
              <Route path="/design/id-core" element={<RequireRole roles={SUPER_ADMIN_ONLY}><IdCoreShowcasePage /></RequireRole>} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
        </AuthBootstrap>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
