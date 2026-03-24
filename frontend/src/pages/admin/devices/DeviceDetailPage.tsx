import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Monitor, Copy, Check, QrCode, ExternalLink,
  Edit2, Plus, Download, User
} from 'lucide-react';
import toast from 'react-hot-toast';
import { devicesApi } from '../../../api/devices';
import { credentialsApi } from '../../../api/credentials';
import { ticketsApi } from '../../../api/tickets';
import { activityLogsApi } from '../../../api/activityLogs';
import { usersApi } from '../../../api/users';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { DeviceStatusBadge } from '../../../components/ui/StatusBadge';
import { CriticalityBadge } from '../../../components/ui/PriorityBadge';
import { TicketStatusBadge } from '../../../components/ui/StatusBadge';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import { PasswordRevealField } from '../../../components/ui/PasswordRevealField';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { Modal } from '../../../components/ui/Modal';
import { DeviceForm } from '../../../components/forms/DeviceForm';
import { formatDate, formatDateTime, copyToClipboard, isExpired } from '../../../utils/helpers';
import { useAuth } from '../../../store/authStore';
import type { Ticket, Credential } from '../../../types';

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await copyToClipboard(value);
    setCopied(true);
    toast.success(`${label ?? 'Skopiowano'}`);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handle} className="text-gray-400 hover:text-indigo-600 transition-colors p-0.5" title="Kopiuj">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function InfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs font-medium text-gray-500 w-32 flex-shrink-0 mt-0.5">{label}</span>
      <span className={`text-sm text-gray-800 flex items-center gap-1 ${mono ? 'font-mono' : ''}`}>
        {value}
        {mono && <CopyButton value={value} label={`${label} skopiowane`} />}
      </span>
    </div>
  );
}

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  const { data: device, isLoading } = useQuery({
    queryKey: ['devices', id],
    queryFn: () => devicesApi.getOne(id!),
    enabled: !!id,
  });

  const { data: credentials = [] } = useQuery({
    queryKey: ['credentials', { deviceId: id }],
    queryFn: () => credentialsApi.getAll({ deviceId: id }),
    enabled: !!id,
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets', { deviceId: id }],
    queryFn: () => ticketsApi.getAll(),
    select: (data) => data.filter(t => t.deviceId === id),
    enabled: !!id,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['activity-logs', { entityId: id }],
    queryFn: () => activityLogsApi.getAll({ entityId: id, entityType: 'DEVICE', limit: 20 }),
    enabled: !!id,
  });

  const { data: staffUsers = [] } = useQuery({
    queryKey: ['users', { roles: 'ADMIN,TECHNICIAN' }],
    queryFn: () => usersApi.getAll(),
    select: (data) => data.filter(u => u.role === 'ADMIN' || u.role === 'TECHNICIAN'),
  });

  const updateManagerMutation = useMutation({
    mutationFn: (managerId: string | null) => devicesApi.update(id!, { managerId } as any),
    onSuccess: () => {
      toast.success('Opiekun zaktualizowany');
      qc.invalidateQueries({ queryKey: ['devices', id] });
    },
    onError: () => toast.error('Błąd zapisu opiekuna'),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!device) return <div className="text-sm text-gray-500">Nie znaleziono urządzenia</div>;

  const isAdmin = user?.role === 'ADMIN';
  const isTech = user?.role === 'TECHNICIAN';
  const canSeeInternal = isAdmin || isTech;

  const remoteLinks = [
    device.rustdeskId && { label: 'RustDesk', value: device.rustdeskId, href: `rustdesk://id=${device.rustdeskId}`, color: 'bg-green-50 text-green-700 border-green-200' },
    device.rdpAddress && { label: 'RDP', value: device.rdpAddress, href: `rdp://${device.rdpAddress}`, color: 'bg-blue-50 text-blue-700 border-blue-200' },
    device.sshAddress && { label: 'SSH', value: device.sshAddress, href: `ssh://${device.sshAddress}`, color: 'bg-gray-50 text-gray-700 border-gray-200' },
    device.anydeskId && { label: 'AnyDesk', value: device.anydeskId, href: `anydesk://${device.anydeskId}`, color: 'bg-orange-50 text-orange-700 border-orange-200' },
    device.teamviewerId && { label: 'TeamViewer', value: device.teamviewerId, href: `teamviewer://id=${device.teamviewerId}`, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    device.customRemoteLink && { label: 'Własny link', value: device.customRemoteLink, href: device.customRemoteLink, color: 'bg-purple-50 text-purple-700 border-purple-200' },
  ].filter(Boolean) as { label: string; value: string; href: string; color: string }[];

  const handleLoadQr = async () => {
    if (qrBase64) return;
    setLoadingQr(true);
    try {
      const qr = await devicesApi.getQr(device.id);
      setQrBase64(qr);
    } catch {
      toast.error('Nie można załadować QR');
    } finally {
      setLoadingQr(false);
    }
  };

  const handleDownloadQr = () => {
    if (!qrBase64) return;
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${qrBase64}`;
    link.download = `qr-${device.name.replace(/\s+/g, '-')}.png`;
    link.click();
  };

  const openTickets = tickets.filter(t => !['RESOLVED', 'CLOSED'].includes(t.status));
  const closedTickets = tickets.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status));

  return (
    <div className="space-y-6">
      <PageHeader
        title={device.name}
        back="/devices"
        subtitle={`${device.deviceType?.name ?? 'Urządzenie'} · ${device.client?.name}`}
        actions={
          <div className="flex items-center gap-3">
            <DeviceStatusBadge status={device.status} />
            <CriticalityBadge criticality={device.criticality} />
            {canSeeInternal && (
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-indigo-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:border-indigo-300 transition-colors"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Edytuj
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-6">

          {/* Basic Info */}
          <Card title="Informacje podstawowe">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoRow label="Klient" value={device.client?.name} />
              <InfoRow label="Lokalizacja" value={device.location?.name} />
              <InfoRow label="Typ" value={device.deviceType?.name} />
              <InfoRow label="Asset Tag" value={device.assetTag} />
            </div>
          </Card>

          {/* Technical */}
          <Card title="Dane techniczne">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoRow label="Hostname" value={device.hostname} mono />
              <InfoRow label="Adres IP" value={device.ipAddress} mono />
              <InfoRow label="MAC" value={device.macAddress} mono />
              <InfoRow label="System" value={device.operatingSystem} />
              <InfoRow label="Wersja OS" value={device.osVersion} />
              <InfoRow label="Producent" value={device.manufacturer} />
              <InfoRow label="Model" value={device.model} />
              <InfoRow label="Numer seryjny" value={device.serialNumber} mono />
              <InfoRow label="Data zakupu" value={device.purchaseDate ? formatDate(device.purchaseDate) : null} />
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium text-gray-500 w-32 flex-shrink-0 mt-0.5">Gwarancja do</span>
                {device.warrantyUntil ? (
                  <span className={`text-sm font-medium ${isExpired(device.warrantyUntil) ? 'text-red-600' : 'text-green-600'}`}>
                    {formatDate(device.warrantyUntil)}
                    {isExpired(device.warrantyUntil) && ' (wygasła)'}
                  </span>
                ) : <span className="text-sm text-gray-400">—</span>}
              </div>
            </div>
          </Card>

          {/* Remote Access */}
          {remoteLinks.length > 0 && (
            <Card title="Zdalny dostęp">
              <div className="flex flex-wrap gap-3">
                {remoteLinks.map(link => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-opacity hover:opacity-80 ${link.color}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {link.label}
                    <span className="text-xs opacity-60 font-mono ml-1">{link.value}</span>
                  </a>
                ))}
                {device.rustdeskId && (
                  <a
                    href={`rustdesk://connect/${device.rustdeskId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-opacity hover:opacity-80 bg-blue-50 text-blue-700 border-blue-200"
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    Połącz RustDesk
                  </a>
                )}
              </div>
            </Card>
          )}

          {/* Notes */}
          {(canSeeInternal && device.internalNotes) || device.clientVisibleNotes ? (
            <Card title="Notatki">
              <div className="space-y-4">
                {canSeeInternal && device.internalNotes && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Notatki wewnętrzne</div>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                      {device.internalNotes}
                    </div>
                  </div>
                )}
                {device.clientVisibleNotes && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Notatki publiczne</div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                      {device.clientVisibleNotes}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : null}

          {/* Credentials */}
          {canSeeInternal && (
            <Card
              title={`Dane dostępowe (${credentials.length})`}
              action={
                <Link
                  to={`/credentials?deviceId=${device.id}`}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Zarządzaj
                </Link>
              }
            >
              {credentials.length === 0 ? (
                <p className="text-sm text-gray-500">Brak zapisanych danych dostępowych</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {credentials.map((cred: Credential) => (
                    <div key={cred.id} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-800">{cred.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge color="gray">{cred.category}</Badge>
                          {cred.username && (
                            <span className="text-xs font-mono text-gray-500 flex items-center gap-1">
                              {cred.username}
                              <CopyButton value={cred.username} label="Login skopiowany" />
                            </span>
                          )}
                          {cred.urlOrHost && <span className="text-xs text-gray-400">{cred.urlOrHost}</span>}
                        </div>
                      </div>
                      <PasswordRevealField
                        credentialName={cred.name}
                        onReveal={() => credentialsApi.reveal(cred.id).then(r => r.password)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Open Tickets */}
          <Card
            title={`Otwarte zgłoszenia (${openTickets.length})`}
            action={
              <Link to={`/tickets?deviceId=${device.id}`} className="text-xs text-indigo-600 hover:underline">
                + Nowe
              </Link>
            }
          >
            {openTickets.length === 0 ? (
              <p className="text-sm text-gray-500">Brak otwartych zgłoszeń</p>
            ) : (
              <div className="space-y-2">
                {openTickets.map((t: Ticket) => (
                  <Link
                    key={t.id}
                    to={`/tickets/${t.id}`}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors"
                  >
                    <div>
                      <span className="text-xs font-mono text-indigo-600">{t.ticketNumber}</span>
                      <span className="text-sm text-gray-800 ml-2">{t.title}</span>
                    </div>
                    <div className="flex gap-2">
                      <PriorityBadge priority={t.priority} />
                      <TicketStatusBadge status={t.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Ticket History */}
          {closedTickets.length > 0 && (
            <Card title={`Historia zgłoszeń (${closedTickets.length})`}>
              <div className="space-y-2">
                {closedTickets.slice(0, 5).map((t: Ticket) => (
                  <Link
                    key={t.id}
                    to={`/tickets/${t.id}`}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <span className="text-xs font-mono text-gray-400">{t.ticketNumber}</span>
                      <span className="text-sm text-gray-600 ml-2">{t.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{formatDate(t.reportedAt)}</span>
                      <TicketStatusBadge status={t.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* QR Code */}
          <Card title="Kod QR" action={
            !qrBase64 ? (
              <button onClick={handleLoadQr} disabled={loadingQr} className="text-xs text-indigo-600 hover:underline">
                {loadingQr ? 'Ładowanie...' : 'Wygeneruj'}
              </button>
            ) : (
              <button onClick={handleDownloadQr} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                <Download className="h-3 w-3" />
                Pobierz
              </button>
            )
          }>
            {qrBase64 ? (
              <div className="flex flex-col items-center gap-3">
                <img src={`data:image/png;base64,${qrBase64}`} alt="QR Code" className="w-40 h-40" />
                <div className="text-xs text-gray-500 font-mono text-center break-all">{device.qrCodeValue}</div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                  <QrCode className="h-8 w-8 text-gray-300" />
                </div>
                <p className="text-xs text-gray-500 text-center">Kliknij "Wygeneruj" aby zobaczyć kod QR</p>
              </div>
            )}
          </Card>

          {/* Opiekun */}
          <Card title="Opiekun urządzenia">
            <div className="space-y-2">
              <label className="text-xs text-gray-500 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Przypisany opiekun
              </label>
              <select
                value={(device as any).managerId ?? ''}
                onChange={(e) => updateManagerMutation.mutate(e.target.value || null)}
                disabled={updateManagerMutation.isPending}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                <option value="">— brak opiekuna —</option>
                {staffUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
          </Card>

          {/* Activity Log */}
          <Card title="Historia aktywności">
            {logs.length === 0 ? (
              <p className="text-sm text-gray-500">Brak wpisów</p>
            ) : (
              <div className="space-y-3">
                {logs.slice(0, 10).map(log => (
                  <div key={log.id} className="flex gap-2.5">
                    <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5" />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-700">{log.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {log.performedBy ? `${log.performedBy.firstName} ${log.performedBy.lastName} · ` : ''}
                        {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edytuj urządzenie" size="2xl">
        <DeviceForm
          device={device}
          onSuccess={() => {
            setShowEdit(false);
            qc.invalidateQueries({ queryKey: ['devices', id] });
            toast.success('Urządzenie zaktualizowane');
          }}
          onCancel={() => setShowEdit(false)}
        />
      </Modal>
    </div>
  );
}
