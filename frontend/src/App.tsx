import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth, getStoredToken } from './store/authStore';
import { authApi } from './api/auth';

// Layouts
import { OperationsLayout } from './components/layout/OperationsLayout';
import { PortalLayout } from './components/layout/PortalLayout';

// Auth
import { LoginPage } from './pages/auth/LoginPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';

// Admin pages
import { DashboardPage } from './pages/admin/DashboardPage';
import { LocationsListPage } from './pages/admin/locations/LocationsListPage';
import { LocationDetailPage } from './pages/admin/locations/LocationDetailPage';
import { DevicesListPage } from './pages/admin/devices/DevicesListPage';
import { DeviceDetailPage } from './pages/admin/devices/DeviceDetailPage';
import { TicketsListPage } from './pages/admin/tickets/TicketsListPage';
import { TicketDetailPage } from './pages/admin/tickets/TicketDetailPage';
import { TicketsQueuePage } from './pages/admin/tickets/TicketsQueuePage';
import { CredentialsPage } from './pages/admin/credentials/CredentialsPage';
import { UsersPage } from './pages/admin/users/UsersPage';
import { WorkspaceMembersPage } from './pages/admin/WorkspaceMembersPage';
import { ActivityLogsPage } from './pages/admin/activity/ActivityLogsPage';
import { CrmPage } from './pages/admin/crm/CrmPage';
import { WaitingRoomPage } from './pages/admin/agents/WaitingRoomPage';
import { MyCompanyPage } from './pages/admin/company/MyCompanyPage';
import { EmployeesPage } from './pages/admin/company/EmployeesPage';
import { TasksPage } from './pages/admin/tasks/TasksPage';
import { OrdersPage } from './pages/admin/orders/OrdersPage';
import { DelegationsPage } from './pages/admin/delegations/DelegationsPage';
import { SessionsPage } from './pages/admin/sessions/SessionsPage';
import { BillingPage } from './pages/admin/billing/BillingPage';
import { CalendarPage } from './pages/admin/tasks/CalendarPage';

// Portal pages
import { PortalDashboardPage } from './pages/portal/PortalDashboardPage';
import { PortalLocationsPage } from './pages/portal/PortalLocationsPage';
import { PortalDevicesPage } from './pages/portal/PortalDevicesPage';
import { PortalTicketsPage } from './pages/portal/PortalTicketsPage';
import { PortalNewRequestPage } from './pages/portal/PortalNewRequestPage';
import { PortalTicketDetailPage } from './pages/portal/PortalTicketDetailPage';
import { PortalOrdersPage } from './pages/portal/PortalOrdersPage';
import { PortalBillingPage } from './pages/portal/PortalBillingPage';
import { PortalVaultPage } from './pages/portal/PortalVaultPage';

// QR
import { QrPage } from './pages/qr/QrPage';

// TV
import { TvDashboardPage } from './pages/tv/TvDashboardPage';

// Downloads & Settings
import { DownloadsPage } from './pages/admin/DownloadsPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { BackupPage } from './pages/admin/BackupPage';
import { PublicDownloadsPage } from './pages/public/PublicDownloadsPage';
import LandingPage from './pages/public/LandingPage';
import LegalPage from './pages/public/LegalPage';
import ContactPage from './pages/public/ContactPage';
import AiPanelPage from './pages/public/AiPanelPage';
import MonitoringPage from './pages/admin/MonitoringPage';
import AiCommandsPage from './pages/admin/AiCommandsPage';
import ModuleTemplatePreviewPage from './pages/admin/ModuleTemplatePreviewPage';
import SADashboardPage from './pages/superadmin/SADashboardPage';
import SATenantsPage from './pages/superadmin/SATenantsPage';
import SAUsersPage from './pages/superadmin/SAUsersPage';
import SAConfigPage from './pages/superadmin/SAConfigPage';
import SAEmailPage from './pages/superadmin/SAEmailPage';

// Invoicing module (IDS 1.0)
import { InvoicingDashboardPage } from './pages/admin/invoicing/InvoicingDashboardPage';
import { DocumentsListPage } from './pages/admin/invoicing/DocumentsListPage';
import { DocumentNewPage } from './pages/admin/invoicing/DocumentNewPage';
import { DocumentEditPage } from './pages/admin/invoicing/DocumentEditPage';
import { DocumentViewPage } from './pages/admin/invoicing/DocumentViewPage';
import { ContractorsPage } from './pages/admin/invoicing/ContractorsPage';
import { ContractorFormPage } from './pages/admin/invoicing/ContractorFormPage';
import { ProductsPage } from './pages/admin/invoicing/ProductsPage';
import { ProductFormPage } from './pages/admin/invoicing/ProductFormPage';
import { ReportsPage } from './pages/admin/invoicing/ReportsPage';
import { PaymentsPage } from './pages/admin/invoicing/PaymentsPage';
import { WarehousesPage, ImportPage } from './pages/admin/invoicing/PlaceholderPage';

// Packaging module (IDS 1.0)
import { PackagingDashboardPage } from './pages/admin/packaging/PackagingDashboardPage';
import { ShipmentsListPage } from './pages/admin/packaging/ShipmentsListPage';
import { ShipmentDetailPage } from './pages/admin/packaging/ShipmentDetailPage';
import { ShipmentNewPage } from './pages/admin/packaging/ShipmentNewPage';
import { ShipmentEditPage } from './pages/admin/packaging/ShipmentEditPage';
import { PackagingReportsPage } from './pages/admin/packaging/PackagingReportsPage';
import { PackagingBoardPage } from './pages/admin/packaging/PackagingBoardPage';

// Mobile pages
import { MobileLayout } from './components/layout/MobileLayout';
import { MobileDashboardPage } from './pages/mobile/MobileDashboardPage';
import { MobileTicketsPage } from './pages/mobile/MobileTicketsPage';
import { MobileTicketDetailPage } from './pages/mobile/MobileTicketDetailPage';
import { MobileScanPage } from './pages/mobile/MobileScanPage';
import { MobileDevicesPage } from './pages/mobile/MobileDevicesPage';
import { MobileOrdersPage } from './pages/mobile/MobileOrdersPage';
import { MobileSearchPage } from './pages/mobile/MobileSearchPage';
import { MobileTasksPage } from './pages/mobile/MobileTasksPage';
import { MobileAgentsPage } from './pages/mobile/MobileAgentsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function AdminRoutes() {
  return (
    <OperationsLayout>
      <Routes>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="locations" element={<LocationsListPage />} />
        <Route path="locations/:id" element={<LocationDetailPage />} />
        <Route path="devices" element={<DevicesListPage />} />
        <Route path="devices/:id" element={<DeviceDetailPage />} />
        <Route path="tickets" element={<TicketsListPage />} />
        <Route path="tickets/queue" element={<TicketsQueuePage />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />
        <Route path="credentials" element={<CredentialsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="workspace-members" element={<WorkspaceMembersPage />} />
        <Route path="activity-logs" element={<ActivityLogsPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="delegations" element={<DelegationsPage />} />
        <Route path="crm" element={<CrmPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="agents" element={<WaitingRoomPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="my-company" element={<MyCompanyPage />} />
        <Route path="my-company/employees" element={<EmployeesPage />} />
        <Route path="backups" element={<BackupPage />} />
        <Route path="downloads" element={<DownloadsPage />} />
        <Route path="ai" element={<AiCommandsPage />} />
        {/* ids-preview moved to public routes */}
        {/* Invoicing module */}
        <Route path="invoicing" element={<InvoicingDashboardPage />} />
        <Route path="invoicing/documents" element={<DocumentsListPage />} />
        <Route path="invoicing/documents/new" element={<DocumentNewPage />} />
        <Route path="invoicing/documents/:id/edit" element={<DocumentEditPage />} />
        <Route path="invoicing/documents/:id" element={<DocumentViewPage />} />
        <Route path="invoicing/contractors" element={<ContractorsPage />} />
        <Route path="invoicing/contractors/new" element={<ContractorFormPage />} />
        <Route path="invoicing/contractors/:id/edit" element={<ContractorFormPage />} />
        <Route path="invoicing/products" element={<ProductsPage />} />
        <Route path="invoicing/products/new" element={<ProductFormPage />} />
        <Route path="invoicing/products/:id/edit" element={<ProductFormPage />} />
        <Route path="invoicing/warehouses" element={<WarehousesPage />} />
        <Route path="invoicing/payments" element={<PaymentsPage />} />
        <Route path="invoicing/reports" element={<ReportsPage />} />
        <Route path="invoicing/import" element={<ImportPage />} />
        {/* Packaging module */}
        <Route path="packaging" element={<PackagingDashboardPage />} />
        <Route path="packaging/shipments" element={<ShipmentsListPage />} />
        <Route path="packaging/shipments/new" element={<ShipmentNewPage />} />
        <Route path="packaging/shipments/:id/edit" element={<ShipmentEditPage />} />
        <Route path="packaging/shipments/:id" element={<ShipmentDetailPage />} />
        <Route path="packaging/board" element={<PackagingBoardPage />} />
        <Route path="packaging/reports" element={<PackagingReportsPage />} />
        <Route path="superadmin" element={<RequireSuperAdmin><SADashboardPage /></RequireSuperAdmin>} />
        <Route path="superadmin/tenants" element={<RequireSuperAdmin><SATenantsPage /></RequireSuperAdmin>} />
        <Route path="superadmin/users" element={<RequireSuperAdmin><SAUsersPage /></RequireSuperAdmin>} />
        <Route path="superadmin/pricing" element={<RequireSuperAdmin><SAConfigPage /></RequireSuperAdmin>} />
        <Route path="superadmin/email" element={<RequireSuperAdmin><SAEmailPage /></RequireSuperAdmin>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </OperationsLayout>
  );
}

function PortalRoutes() {
  return (
    <PortalLayout>
      <Routes>
        <Route index element={<PortalDashboardPage />} />
        <Route path="locations" element={<PortalLocationsPage />} />
        <Route path="devices" element={<PortalDevicesPage />} />
        <Route path="tickets" element={<PortalTicketsPage />} />
        <Route path="tickets/:id" element={<PortalTicketDetailPage />} />
        <Route path="new-request" element={<PortalNewRequestPage />} />
        <Route path="vault" element={<PortalVaultPage />} />
        <Route path="orders" element={<PortalOrdersPage />} />
        <Route path="billing" element={<PortalBillingPage />} />
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    </PortalLayout>
  );
}

function MobileRoutes() {
  return (
    <MobileLayout>
      <Routes>
        <Route index element={<MobileDashboardPage />} />
        <Route path="tasks" element={<MobileTasksPage />} />
        <Route path="tickets" element={<MobileTicketsPage />} />
        <Route path="tickets/:id" element={<MobileTicketDetailPage />} />
        <Route path="devices" element={<MobileDevicesPage />} />
        <Route path="orders" element={<MobileOrdersPage />} />
        <Route path="search" element={<MobileSearchPage />} />
        <Route path="scan" element={<MobileScanPage />} />
        <Route path="agents" element={<MobileAgentsPage />} />
        <Route path="*" element={<Navigate to="/m" replace />} />
      </Routes>
    </MobileLayout>
  );
}

function AutoLoginHandler() {
  const { setTokens, setUser } = useAuth();
  const processed = React.useRef(false);
  React.useEffect(() => {
    if (processed.current) return;
    const hash = window.location.hash;
    if (hash.startsWith('#autologin=')) {
      processed.current = true;
      try {
        const data = JSON.parse(decodeURIComponent(hash.slice('#autologin='.length)));
        if (data.accessToken && data.refreshToken && data.user) {
          setTokens(data.accessToken, data.refreshToken);
          setUser(data.user);
          window.location.hash = '';
        }
      } catch (e) { console.error('Auto-login parse error:', e); }
    }
  }, [setTokens, setUser]);
  return null;
}

/** Refreshes user from /auth/me on mount to keep localStorage in sync with DB */
function UserRefresher() {
  const { setUser } = useAuth();
  const done = React.useRef(false);
  React.useEffect(() => {
    if (done.current || !getStoredToken()) return;
    done.current = true;
    authApi.me().then(setUser).catch(() => {});
  }, [setUser]);
  return null;
}

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!(user as any)?.isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
      <h1 className="text-4xl font-bold" style={{ color: 'var(--t, #fff)' }}>404</h1>
      <p className="text-sm" style={{ color: 'var(--tm, rgba(255,255,255,0.5))' }}>Strona nie została znaleziona</p>
      <a href="/dashboard" className="text-sm font-medium px-4 py-2 rounded-lg" style={{ background: 'var(--accent-g, rgba(79,140,255,0.12))', color: 'var(--accent, #4F8CFF)' }}>
        Wróć do panelu
      </a>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: { fontSize: '14px' },
            }}
          />
          <AutoLoginHandler />
          <UserRefresher />
          <Routes>
            {/* Auth */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Public */}
            <Route path="/regulamin" element={<LegalPage />} />
            <Route path="/prywatnosc" element={<LegalPage />} />
            <Route path="/rodo" element={<LegalPage />} />
            <Route path="/kontakt" element={<ContactPage />} />
            <Route path="/pobieranie" element={<PublicDownloadsPage />} />
            <Route path="/ai-panel" element={<AiPanelPage />} />
            <Route path="/tv" element={<TvDashboardPage />} />
            <Route path="/qr/:qrCodeValue" element={<QrPage />} />

            {/* IDS Preview — public, no auth */}
            <Route path="/ids-preview" element={<ModuleTemplatePreviewPage />} />

            {/* Redirects — old duplicate routes */}
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/downloads" element={<Navigate to="/pobieranie" replace />} />
            <Route path="/o-nas" element={<Navigate to="/kontakt" replace />} />
            <Route path="/platnosci" element={<Navigate to="/regulamin" replace />} />

            {/* Portal (CLIENT) */}
            <Route path="/portal/*" element={<PortalRoutes />} />

            {/* Mobile (ADMIN / TECHNICIAN) */}
            <Route path="/m/*" element={<MobileRoutes />} />

            {/* Landing */}
            <Route path="/" element={<LandingPage />} />

            {/* Operations panel (ADMIN / TECHNICIAN) — catch-all last */}
            <Route path="/*" element={<AdminRoutes />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
