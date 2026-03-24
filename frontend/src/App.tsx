import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './store/authStore';

// Layouts
import { AppLayout } from './components/layout/AppLayout';
import { PortalLayout } from './components/layout/PortalLayout';

// Auth
import { LoginPage } from './pages/auth/LoginPage';

// Admin pages
import { DashboardPage } from './pages/admin/DashboardPage';
import { ClientsListPage } from './pages/admin/clients/ClientsListPage';
import { ClientDetailPage } from './pages/admin/clients/ClientDetailPage';
import { LocationsListPage } from './pages/admin/locations/LocationsListPage';
import { LocationDetailPage } from './pages/admin/locations/LocationDetailPage';
import { DevicesListPage } from './pages/admin/devices/DevicesListPage';
import { DeviceDetailPage } from './pages/admin/devices/DeviceDetailPage';
import { TicketsListPage } from './pages/admin/tickets/TicketsListPage';
import { TicketDetailPage } from './pages/admin/tickets/TicketDetailPage';
import { TicketsQueuePage } from './pages/admin/tickets/TicketsQueuePage';
import { CredentialsPage } from './pages/admin/credentials/CredentialsPage';
import { UsersPage } from './pages/admin/users/UsersPage';
import { ActivityLogsPage } from './pages/admin/activity/ActivityLogsPage';
import { CrmPage } from './pages/admin/crm/CrmPage';
import { WaitingRoomPage } from './pages/admin/agents/WaitingRoomPage';
import { FaqPage } from './pages/admin/agents/FaqPage';
import { RustDeskPage } from './pages/admin/RustDeskPage';
import { MyCompanyPage } from './pages/admin/company/MyCompanyPage';
import { EmployeesPage } from './pages/admin/company/EmployeesPage';
import { TasksPage } from './pages/admin/tasks/TasksPage';
import { OrdersPage } from './pages/admin/orders/OrdersPage';
import { DelegationsPage } from './pages/admin/delegations/DelegationsPage';

// Portal pages
import { PortalDashboardPage } from './pages/portal/PortalDashboardPage';
import { PortalLocationsPage } from './pages/portal/PortalLocationsPage';
import { PortalDevicesPage } from './pages/portal/PortalDevicesPage';
import { PortalTicketsPage } from './pages/portal/PortalTicketsPage';
import { PortalNewRequestPage } from './pages/portal/PortalNewRequestPage';
import { PortalTicketDetailPage } from './pages/portal/PortalTicketDetailPage';

// QR
import { QrPage } from './pages/qr/QrPage';

// TV
import { TvDashboardPage } from './pages/tv/TvDashboardPage';

// Downloads
import { DownloadsPage } from './pages/admin/DownloadsPage';

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
    <AppLayout>
      <Routes>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="clients" element={<ClientsListPage />} />
        <Route path="clients/:id" element={<ClientDetailPage />} />
        <Route path="locations" element={<LocationsListPage />} />
        <Route path="locations/:id" element={<LocationDetailPage />} />
        <Route path="devices" element={<DevicesListPage />} />
        <Route path="devices/:id" element={<DeviceDetailPage />} />
        <Route path="tickets" element={<TicketsListPage />} />
        <Route path="tickets/queue" element={<TicketsQueuePage />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />
        <Route path="credentials" element={<CredentialsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="activity-logs" element={<ActivityLogsPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="delegations" element={<DelegationsPage />} />
        <Route path="crm" element={<CrmPage />} />
        <Route path="agents" element={<WaitingRoomPage />} />
        <Route path="faq" element={<FaqPage />} />
        <Route path="rustdesk" element={<RustDeskPage />} />
        <Route path="settings" element={<div className="text-sm text-gray-500 p-6">Ustawienia — wkrótce dostępne</div>} />
        <Route path="my-company" element={<MyCompanyPage />} />
        <Route path="my-company/employees" element={<EmployeesPage />} />
        <Route path="downloads" element={<DownloadsPage />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </AppLayout>
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
        <Route path="account" element={<div className="text-sm text-gray-500">Moje konto — wkrótce</div>} />
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    </PortalLayout>
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
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/tv" element={<TvDashboardPage />} />
            <Route path="/qr/:qrCodeValue" element={<QrPage />} />
            <Route path="/portal/*" element={<PortalRoutes />} />
            <Route path="/*" element={<AdminRoutes />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
