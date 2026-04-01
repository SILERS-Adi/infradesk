import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { devicesApi } from '../../api/devices';
import { useAuth } from '../../store/authStore';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import { DeviceStatusBadge } from '../../components/ui/StatusBadge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Shield, Monitor, AlertTriangle, ExternalLink } from 'lucide-react';

export function QrPage() {
  const { qrCodeValue } = useParams<{ qrCodeValue: string }>();
  const { isAuthenticated, user } = useAuth();
  const { isMember, isViewer } = useWorkspaceContext();
  const isPortalUser = isMember || isViewer;

  const { data: device, isLoading, isError } = useQuery({
    queryKey: ['qr', qrCodeValue],
    queryFn: () => devicesApi.getByQrValue(qrCodeValue!),
    enabled: !!qrCodeValue,
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-600 rounded-xl mb-3">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div className="text-lg font-bold text-gray-900">InfraDesk</div>
        </div>

        {isLoading && <LoadingSpinner />}

        {isError && (
          <div className="bg-white rounded-2xl shadow-xl p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Urządzenie nie znalezione</h2>
            <p className="text-sm text-gray-500 mt-1">Kod QR jest nieprawidłowy lub urządzenie zostało usunięte.</p>
          </div>
        )}

        {device && (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-indigo-600 p-6 text-white">
              <div className="flex items-center gap-3 mb-1">
                <Monitor className="h-5 w-5 opacity-80" />
                <span className="text-xs opacity-70">{device.deviceType?.name ?? 'Urządzenie'}</span>
              </div>
              <h2 className="text-xl font-bold">{device.name}</h2>
              <p className="text-indigo-200 text-sm mt-1">{device.client?.name}</p>
            </div>

            <div className="p-6 space-y-3">
              <div>
                <div className="text-xs font-medium text-gray-500 mb-0.5">Lokalizacja</div>
                <div className="text-sm text-gray-800">{device.location?.name}</div>
              </div>
              {device.ipAddress && (
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-0.5">Adres IP</div>
                  <div className="text-sm font-mono text-gray-800">{device.ipAddress}</div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <DeviceStatusBadge status={device.status} />
              </div>
            </div>

            <div className="px-6 pb-6 space-y-3">
              {isAuthenticated ? (
                <>
                  <Link
                    to={isPortalUser ? `/portal/new-request` : `/tickets?deviceId=${device.id}`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors font-medium text-sm"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Zgłoś problem
                  </Link>
                  {!isPortalUser && (
                    <Link
                      to={`/devices/${device.id}`}
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium text-sm"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Otwórz szczegóły
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium text-sm"
                  >
                    Zaloguj się aby kontynuować
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
