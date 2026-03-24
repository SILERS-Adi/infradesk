import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Phone, Mail, User } from 'lucide-react';
import { locationsApi } from '../../../api/locations';
import { devicesApi } from '../../../api/devices';
import { ticketsApi } from '../../../api/tickets';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { DeviceStatusBadge, TicketStatusBadge } from '../../../components/ui/StatusBadge';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import type { Device, Ticket } from '../../../types';

type TabId = 'overview' | 'devices' | 'tickets';

export function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabId>('overview');

  const { data: location, isLoading } = useQuery({
    queryKey: ['locations', id],
    queryFn: () => locationsApi.getOne(id!),
    enabled: !!id,
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices', { locationId: id }],
    queryFn: () => devicesApi.getAll({ locationId: id }),
    enabled: !!id && tab === 'devices',
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets', { locationId: id }],
    queryFn: () => ticketsApi.getAll(),
    select: (data) => data.filter(t => t.locationId === id),
    enabled: !!id && tab === 'tickets',
  });

  if (isLoading) return <LoadingSpinner />;
  if (!location) return <p className="text-sm text-gray-500">Nie znaleziono lokalizacji</p>;

  return (
    <div>
      <PageHeader
        title={location.name}
        back="/locations"
        subtitle={location.client?.name}
        actions={<Badge color="indigo">{location.type}</Badge>}
      />

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['overview', 'devices', 'tickets'] as TabId[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {{ overview: 'Przegląd', devices: 'Urządzenia', tickets: 'Zgłoszenia' }[t]}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card title="Adres">
            <div className="space-y-1 text-sm text-gray-700">
              {location.addressLine1 && <div>{location.addressLine1}</div>}
              {location.addressLine2 && <div>{location.addressLine2}</div>}
              <div>{[location.postalCode, location.city].filter(Boolean).join(' ')}</div>
              {location.country && <div>{location.country}</div>}
            </div>
          </Card>
          {(location.contactPersonName || location.contactPersonPhone || location.contactPersonEmail) && (
            <Card title="Osoba kontaktowa">
              <div className="space-y-2 text-sm">
                {location.contactPersonName && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <User className="h-4 w-4 text-gray-400" />
                    {location.contactPersonName}
                  </div>
                )}
                {location.contactPersonPhone && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <Phone className="h-4 w-4 text-gray-400" />
                    {location.contactPersonPhone}
                  </div>
                )}
                {location.contactPersonEmail && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <Mail className="h-4 w-4 text-gray-400" />
                    {location.contactPersonEmail}
                  </div>
                )}
              </div>
            </Card>
          )}
          {location.notes && (
            <Card title="Notatki" className="md:col-span-2">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{location.notes}</p>
            </Card>
          )}
        </div>
      )}

      {tab === 'devices' && (
        <Card noPadding>
          <DataTable
            columns={[
              { key: 'name', header: 'Urządzenie', render: (r) => <Link to={`/devices/${(r as unknown as Device).id}`} className="font-medium text-indigo-600 hover:underline">{(r as unknown as Device).name}</Link> },
              { key: 'type', header: 'Typ', render: (r) => (r as unknown as Device).deviceType?.name ?? '—' },
              { key: 'ip', header: 'IP', render: (r) => <span className="font-mono text-xs">{(r as unknown as Device).ipAddress ?? '—'}</span> },
              { key: 'status', header: 'Status', render: (r) => <DeviceStatusBadge status={(r as unknown as Device).status} /> },
            ]}
            data={devices}
            keyExtractor={(r) => (r as unknown as Device).id}
            emptyTitle="Brak urządzeń w tej lokalizacji"
          />
        </Card>
      )}

      {tab === 'tickets' && (
        <Card noPadding>
          <DataTable
            columns={[
              { key: 'num', header: 'Nr', render: (r) => <Link to={`/tickets/${(r as unknown as Ticket).id}`} className="font-mono text-xs text-indigo-600 hover:underline">{(r as unknown as Ticket).ticketNumber}</Link> },
              { key: 'title', header: 'Tytuł', render: (r) => (r as unknown as Ticket).title },
              { key: 'priority', header: 'Priorytet', render: (r) => <PriorityBadge priority={(r as unknown as Ticket).priority} /> },
              { key: 'status', header: 'Status', render: (r) => <TicketStatusBadge status={(r as unknown as Ticket).status} /> },
            ]}
            data={tickets}
            keyExtractor={(r) => (r as unknown as Ticket).id}
            emptyTitle="Brak zgłoszeń"
          />
        </Card>
      )}
    </div>
  );
}
