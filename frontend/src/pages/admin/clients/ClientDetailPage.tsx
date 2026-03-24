import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, Globe, MapPin, Building2, Plus, Pencil, Trash2, ChevronRight, FileText, ExternalLink, Clock, CheckCircle2, XCircle, DollarSign, Calendar, AlertCircle, Wrench } from 'lucide-react';
import { clientsApi } from '../../../api/clients';
import { locationsApi } from '../../../api/locations';
import { devicesApi } from '../../../api/devices';
import { ticketsApi } from '../../../api/tickets';
import { credentialsApi } from '../../../api/credentials';
import { usersApi } from '../../../api/users';
import { crmApi } from '../../../api/crm';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { ClientStatusBadge, DeviceStatusBadge, TicketStatusBadge } from '../../../components/ui/StatusBadge';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { ClientForm } from '../../../components/forms/ClientForm';
import { LocationForm } from '../../../components/forms/LocationForm';
import { DeviceForm } from '../../../components/forms/DeviceForm';
import { UserForm } from '../../../components/forms/UserForm';
import { NewOrderWizard } from '../../../components/forms/NewOrderWizard';
import { CRM_TYPE_CONFIG, QUOTE_STATUS_CONFIG } from '../crm/CrmPage';
import { getErrorMessage } from '../../../utils/helpers';
import type { Location, Device, Ticket, Credential, User } from '../../../types';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

type TabId = 'historia' | 'overview' | 'contract' | 'locations' | 'devices' | 'tickets' | 'credentials' | 'users';

const TABS: { id: TabId; label: string }[] = [
  { id: 'historia',     label: 'Historia' },
  { id: 'overview',     label: 'Przegląd' },
  { id: 'contract',     label: 'Umowa' },
  { id: 'locations',    label: 'Lokalizacje' },
  { id: 'devices',      label: 'Urządzenia' },
  { id: 'tickets',      label: 'Zgłoszenia' },
  { id: 'credentials',  label: 'Dostępy' },
  { id: 'users',        label: 'Pracownicy' },
];

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>('historia');
  const [showEdit, setShowEdit] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);

  const { data: client, isLoading } = useQuery({
    queryKey: ['clients', id],
    queryFn: () => clientsApi.getOne(id!),
    enabled: !!id,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', { clientId: id }],
    queryFn: () => locationsApi.getAll({ clientId: id }),
    enabled: !!id && tab === 'locations',
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices', { clientId: id }],
    queryFn: () => devicesApi.getAll({ clientId: id }),
    enabled: !!id && tab === 'devices',
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets', { clientId: id }],
    queryFn: () => ticketsApi.getAll({ clientId: id }),
    enabled: !!id && tab === 'tickets',
  });

  const { data: credentials = [] } = useQuery({
    queryKey: ['credentials', { clientId: id }],
    queryFn: () => credentialsApi.getAll({ clientId: id }),
    enabled: !!id && tab === 'credentials',
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users', { clientId: id }],
    queryFn: () => usersApi.getAll({ clientId: id }),
    enabled: !!id && tab === 'users',
  });

  const { data: timeline = [] } = useQuery({
    queryKey: ['crm', 'timeline', id],
    queryFn: () => crmApi.getTimeline(id!),
    enabled: !!id && tab === 'historia',
  });

  const { data: staffUsers = [] } = useQuery({
    queryKey: ['users', { roles: 'ADMIN,TECHNICIAN' }],
    queryFn: () => usersApi.getAll(),
    select: (data) => data.filter(u => u.role === 'ADMIN' || u.role === 'TECHNICIAN'),
  });

  const updateManagerMutation = useMutation({
    mutationFn: (managerId: string | null) => clientsApi.update(id!, { managerId } as any),
    onSuccess: () => {
      toast.success('Opiekun zaktualizowany');
      qc.invalidateQueries({ queryKey: ['clients', id] });
    },
    onError: () => toast.error('Błąd zapisu opiekuna'),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => clientsApi.deactivate(id!),
    onSuccess: () => {
      toast.success('Klient zdezaktywowany');
      qc.invalidateQueries({ queryKey: ['clients', id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      setShowDeactivate(false);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => clientsApi.delete(id!),
    onSuccess: () => {
      toast.success('Klient usunięty');
      qc.invalidateQueries({ queryKey: ['clients'] });
      navigate('/clients');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!client) return <div className="text-sm text-gray-500">Nie znaleziono klienta</div>;

  const initials = client.name.slice(0, 2).toUpperCase();

  return (
    <div>
      <PageHeader title="" back="/clients" />

      {/* Header karty klienta */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex items-start gap-4">
          {/* Logo / inicjały */}
          {client.logoUrl ? (
            <img
              src={client.logoUrl}
              alt={client.name}
              className="w-14 h-14 rounded-2xl object-contain bg-gray-50 border border-gray-100 flex-shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-brand-100 text-brand-700 font-bold text-lg flex items-center justify-center flex-shrink-0">
              {initials}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{client.name}</h1>
              <ClientStatusBadge status={client.status} />
            </div>
            {client.legalName && (
              <div className="text-sm text-gray-500 mt-0.5">{client.legalName}</div>
            )}
            {client.taxId && (
              <div className="text-xs text-gray-400 mt-0.5">NIP: {client.taxId}</div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowNewOrder(true)}>
              <span className="hidden sm:inline">Nowe zlecenie</span>
            </Button>
            <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setShowEdit(true)}>
              <span className="hidden sm:inline">Edytuj</span>
            </Button>
            {client.status === 'ACTIVE' && (
              <Button size="sm" variant="secondary" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setShowDeactivate(true)}>
                <span className="hidden sm:inline">Dezaktywuj</span>
              </Button>
            )}
            <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setShowDelete(true)}>
              <span className="hidden sm:inline">Usuń</span>
            </Button>
          </div>
        </div>

        {/* Szybkie kontakty */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4 text-sm text-gray-600">
          {client.email && (
            <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 hover:text-brand-600">
              <Mail className="h-3.5 w-3.5 text-gray-400" />{client.email}
            </a>
          )}
          {client.phone && (
            <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 hover:text-brand-600">
              <Phone className="h-3.5 w-3.5 text-gray-400" />{client.phone}
            </a>
          )}
          {client.website && (
            <a href={client.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-brand-600">
              <Globe className="h-3.5 w-3.5 text-gray-400" />{client.website}
            </a>
          )}
          {(client.city || client.addressLine1) && (
            <span className="flex items-center gap-1.5 text-gray-500">
              <MapPin className="h-3.5 w-3.5 text-gray-400" />
              {[client.addressLine1, client.postalCode, client.city].filter(Boolean).join(', ')}
            </span>
          )}
        </div>

        {/* Opiekun */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider w-20 flex-shrink-0">Opiekun</span>
          <select
            value={(client as any).managerId ?? ''}
            onChange={(e) => updateManagerMutation.mutate(e.target.value || null)}
            disabled={updateManagerMutation.isPending}
            className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          >
            <option value="">— brak opiekuna —</option>
            {staffUsers.map(u => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Statsy */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Lokalizacje', value: client._count?.locations ?? 0, tab: 'locations' as TabId, color: 'text-brand-600 bg-brand-50' },
          { label: 'Urządzenia',  value: client._count?.devices ?? 0,   tab: 'devices' as TabId,   color: 'text-violet-600 bg-violet-50' },
          { label: 'Zgłoszenia', value: client._count?.tickets ?? 0,    tab: 'tickets' as TabId,   color: 'text-orange-600 bg-orange-50' },
        ].map(s => (
          <button
            key={s.label}
            onClick={() => setTab(s.tab)}
            className={clsx(
              'rounded-2xl border p-4 text-center transition-colors',
              tab === s.tab
                ? 'border-transparent ' + s.color
                : 'bg-white border-gray-200 hover:bg-gray-50'
            )}
          >
            <div className={clsx('text-2xl font-bold', s.color.split(' ')[0])}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-5 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex-1 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2',
              tab === t.id
                ? 'border-brand-600 text-brand-600 bg-brand-50/30'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Historia (Timeline) */}
      {tab === 'historia' && (
        <div>
          <div className="flex justify-end mb-3">
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowNewOrder(true)}>
              Nowe zlecenie
            </Button>
          </div>
          {timeline.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400">
              Brak historii — dodaj pierwsze zlecenie lub wpis CRM
            </div>
          ) : (
            <div className="space-y-2">
              {(timeline as Array<Record<string, unknown>>).map((entry, i) => (
                <TimelineEntry key={i} entry={entry} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Przegląd */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {client.notes && (
            <div className="md:col-span-2 bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-amber-700 uppercase mb-1">Notatki</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}
          <InfoCard title="Dane kontaktowe">
            <InfoRow icon={<Mail />} label={client.email} href={`mailto:${client.email}`} />
            <InfoRow icon={<Phone />} label={client.phone} href={`tel:${client.phone}`} />
            <InfoRow icon={<Globe />} label={client.website} href={client.website} external />
            <InfoRow icon={<Building2 />} label={client.taxId ? `NIP: ${client.taxId}` : undefined} />
          </InfoCard>
          <InfoCard title="Adres">
            <InfoRow icon={<MapPin />} label={[client.addressLine1, client.addressLine2, `${client.postalCode ?? ''} ${client.city ?? ''}`.trim(), client.country].filter(Boolean).join(', ') || undefined} />
          </InfoCard>
        </div>
      )}

      {/* Tab: Umowa */}
      {tab === 'contract' && (
        <div className="space-y-4">
          {/* Status umowy */}
          <div className={clsx(
            'rounded-2xl border p-5 flex items-center gap-4',
            client.hasContract ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-200'
          )}>
            {client.hasContract
              ? <CheckCircle2 className="h-8 w-8 text-blue-500 flex-shrink-0" />
              : <XCircle className="h-8 w-8 text-gray-300 flex-shrink-0" />
            }
            <div>
              <div className="font-semibold text-gray-900">
                {client.hasContract ? 'Klient ma umowę SLA' : 'Brak umowy serwisowej'}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">
                {client.hasContract
                  ? 'Rozliczenie abonamentowe z limitem godzin'
                  : 'Rozliczenie godzinowe bez umowy'
                }
              </div>
            </div>
            <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setShowEdit(true)} className="ml-auto">
              Edytuj
            </Button>
          </div>

          {client.hasContract ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Godziny */}
              {client.contractHours != null && (
                <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-5 w-5 text-brand-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{client.contractHours} h</div>
                    <div className="text-xs text-gray-400">Godziny w umowie</div>
                  </div>
                </div>
              )}
              {/* Wartość miesięczna */}
              {client.contractMonthlyValue != null && (
                <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{client.contractMonthlyValue.toLocaleString('pl-PL')} zł</div>
                    <div className="text-xs text-gray-400">Wartość miesięczna</div>
                  </div>
                </div>
              )}
              {/* Stawka nadgodziny */}
              {client.contractHourlyRateOverLimit != null && (
                <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                    <DollarSign className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{client.contractHourlyRateOverLimit} zł/h</div>
                    <div className="text-xs text-gray-400">Stawka za nadgodziny</div>
                  </div>
                </div>
              )}
              {/* Zakres umowy */}
              {client.contractScope && (
                <div className="sm:col-span-2 bg-white rounded-2xl border border-gray-200 p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Zakres umowy</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{client.contractScope}</p>
                </div>
              )}
              {/* PDF załącznik */}
              {client.contractAttachmentUrl && (
                <div className="sm:col-span-2 bg-white rounded-2xl border border-gray-200 p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Załącznik umowy</p>
                  <a
                    href={client.contractAttachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2.5 px-4 py-2.5 bg-brand-50 border border-brand-100 rounded-xl text-sm text-brand-700 font-medium hover:bg-brand-100 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-brand-600" />
                    Otwórz PDF umowy
                    <ExternalLink className="h-3.5 w-3.5 text-brand-400" />
                  </a>
                </div>
              )}
            </div>
          ) : (
            client.hourlyRate != null && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3 max-w-xs">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{client.hourlyRate} zł/h</div>
                  <div className="text-xs text-gray-400">Stawka godzinowa</div>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Tab: Lokalizacje */}
      {tab === 'locations' && (
        <>
          <div className="flex justify-end mb-3">
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddLocation(true)}>
              Dodaj lokalizację
            </Button>
          </div>
          <TabList
            items={locations}
            empty="Brak lokalizacji"
            render={(loc: Location) => (
              <Link to={`/locations/${loc.id}`} key={loc.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-4 w-4 text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{loc.name}</div>
                  <div className="text-xs text-gray-500">{loc.type} · {loc.city}</div>
                </div>
                <div className="text-xs text-gray-400">{loc._count?.devices ?? 0} urz.</div>
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </Link>
            )}
          />
        </>
      )}

      {/* Tab: Urządzenia */}
      {tab === 'devices' && (
        <>
          <div className="flex justify-end mb-3">
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddDevice(true)}>
              Dodaj urządzenie
            </Button>
          </div>
          <TabList
            items={devices}
            empty="Brak urządzeń"
            render={(dev: Device) => (
              <Link to={`/devices/${dev.id}`} key={dev.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{dev.name}</div>
                  <div className="text-xs text-gray-500">{dev.deviceType?.name ?? '—'} · <span className="font-mono">{dev.ipAddress ?? '—'}</span></div>
                </div>
                <DeviceStatusBadge status={dev.status} />
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </Link>
            )}
          />
        </>
      )}

      {/* Tab: Zgłoszenia */}
      {tab === 'tickets' && (
        <TabList
          items={tickets}
          empty="Brak zgłoszeń"
          render={(t: Ticket) => (
            <Link to={`/tickets/${t.id}`} key={t.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-brand-600">{t.ticketNumber}</span>
                  <PriorityBadge priority={t.priority} />
                </div>
                <div className="font-medium text-gray-900 mt-0.5">{t.title}</div>
              </div>
              <TicketStatusBadge status={t.status} />
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </Link>
          )}
        />
      )}

      {/* Tab: Dostępy */}
      {tab === 'credentials' && (
        <TabList
          items={credentials}
          empty="Brak danych dostępowych"
          render={(c: Credential) => (
            <Link to={`/credentials`} key={c.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900">{c.name}</div>
                <div className="text-xs text-gray-500 font-mono">{c.username ?? '—'} · {c.device?.name ?? '—'}</div>
              </div>
              <Badge color="gray">{c.category}</Badge>
            </Link>
          )}
        />
      )}

      {/* Tab: Użytkownicy */}
      {tab === 'users' && (
        <>
          <div className="flex justify-end mb-3">
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddUser(true)}>
              Dodaj użytkownika
            </Button>
          </div>
          <TabList
            items={users}
            empty="Brak użytkowników portalu"
            render={(u: User) => (
              <div key={u.id} className="flex items-center gap-4 p-4 border-b border-gray-50 last:border-0">
                <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {u.firstName[0]}{u.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{u.firstName} {u.lastName}</div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                </div>
                <Badge color={u.isActive ? 'green' : 'gray'}>{u.isActive ? 'Aktywny' : 'Nieaktywny'}</Badge>
              </div>
            )}
          />
        </>
      )}

      {/* Modal: edycja */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={`Edytuj: ${client.name}`} size="xl">
        <ClientForm
          client={client}
          onSuccess={() => {
            setShowEdit(false);
            qc.invalidateQueries({ queryKey: ['clients', id] });
          }}
          onCancel={() => setShowEdit(false)}
        />
      </Modal>

      <ConfirmDialog
        open={showDeactivate}
        onClose={() => setShowDeactivate(false)}
        onConfirm={() => deactivateMutation.mutate()}
        title="Dezaktywuj klienta"
        message={`Czy dezaktywować klienta "${client.name}"? Wszystkie dane zostaną zachowane, klient będzie oznaczony jako nieaktywny.`}
        loading={deactivateMutation.isPending}
      />

      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Usuń klienta"
        message={`Czy na pewno chcesz trwale usunąć klienta "${client.name}" z bazy danych? Tej operacji nie można cofnąć.`}
        loading={deleteMutation.isPending}
      />

      {/* Modal: dodaj lokalizację */}
      <Modal open={showAddLocation} onClose={() => setShowAddLocation(false)} title="Nowa lokalizacja" size="lg">
        <LocationForm
          defaultClientId={id!}
          onSuccess={() => {
            setShowAddLocation(false);
            qc.invalidateQueries({ queryKey: ['locations', { clientId: id }] });
            qc.invalidateQueries({ queryKey: ['clients', id] });
          }}
          onCancel={() => setShowAddLocation(false)}
        />
      </Modal>

      {/* Modal: dodaj urządzenie */}
      <Modal open={showAddDevice} onClose={() => setShowAddDevice(false)} title="Nowe urządzenie" size="xl">
        <DeviceForm
          defaultClientId={id!}
          onSuccess={() => {
            setShowAddDevice(false);
            qc.invalidateQueries({ queryKey: ['devices', { clientId: id }] });
            qc.invalidateQueries({ queryKey: ['clients', id] });
          }}
          onCancel={() => setShowAddDevice(false)}
        />
      </Modal>

      {/* Modal: dodaj użytkownika portalu */}
      <Modal open={showAddUser} onClose={() => setShowAddUser(false)} title="Nowy użytkownik portalu" size="lg">
        <UserForm
          defaultClientId={id}
          defaultRole="CLIENT"
          onSuccess={() => {
            setShowAddUser(false);
            qc.invalidateQueries({ queryKey: ['users', { clientId: id }] });
          }}
          onCancel={() => setShowAddUser(false)}
        />
      </Modal>

      {/* Modal: nowe zlecenie (wizard) */}
      <Modal open={showNewOrder} onClose={() => setShowNewOrder(false)} title="" size="lg" noPadding>
        <NewOrderWizard
          defaultClientId={id}
          onClose={() => {
            setShowNewOrder(false);
            qc.invalidateQueries({ queryKey: ['crm', 'timeline', id] });
            qc.invalidateQueries({ queryKey: ['tickets', { clientId: id }] });
          }}
        />
      </Modal>
    </div>
  );
}

// Helpers
function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ icon, label, href, external }: { icon: React.ReactNode; label?: string; href?: string; external?: boolean }) {
  if (!label) return null;
  const cls = 'flex items-center gap-2.5 text-sm text-gray-700 hover:text-brand-600';
  const content = (
    <>
      <span className="text-gray-400 w-4 h-4 flex-shrink-0">{icon}</span>
      {label}
    </>
  );
  if (href) return <a href={href} target={external ? '_blank' : undefined} rel="noreferrer" className={cls}>{content}</a>;
  return <div className={cls}>{content}</div>;
}

function TimelineEntry({ entry }: { entry: Record<string, unknown> }) {
  const isCrm = entry._kind === 'CRM';
  const date = new Date((isCrm ? entry.occurredAt : entry.createdAt) as string);
  const dateStr = date.toLocaleDateString('pl-PL', { day: '2-digit', month: 'short' });
  const timeStr = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

  if (isCrm) {
    const type = entry.type as string;
    const cfg = CRM_TYPE_CONFIG[type as keyof typeof CRM_TYPE_CONFIG];
    const summary = type === 'PHONE' ? entry.notes
      : type === 'EMAIL' ? entry.subject
      : type === 'MEETING' ? (entry.title || entry.meetingPlace || entry.notes)
      : entry.quoteDescription;

    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${cfg?.bg ?? 'bg-gray-50 border-gray-100'}`}>
          <span className={cfg?.color ?? 'text-gray-400'}>{cfg?.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${cfg?.color ?? ''}`}>{cfg?.label ?? String(type)}</span>
            {Boolean(entry.followUpRequired) && (
              <span className="flex items-center gap-0.5 text-xs text-amber-600 font-medium">
                <AlertCircle className="h-3 w-3" /> Do działania
              </span>
            )}
            {type === 'QUOTE' && entry.quoteStatus ? (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${QUOTE_STATUS_CONFIG[entry.quoteStatus as keyof typeof QUOTE_STATUS_CONFIG]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                {QUOTE_STATUS_CONFIG[entry.quoteStatus as keyof typeof QUOTE_STATUS_CONFIG]?.label}
              </span>
            ) : null}
          </div>
          {summary ? <p className="text-sm text-gray-700 mt-0.5 line-clamp-2">{String(summary)}</p> : null}
          {type === 'QUOTE' && entry.quoteValue != null ? (
            <p className="text-xs text-gray-500 mt-0.5">{Number(entry.quoteValue).toLocaleString('pl-PL')} zł</p>
          ) : null}
          <p className="text-xs text-gray-400 mt-1">{dateStr} {timeStr}</p>
        </div>
      </div>
    );
  }

  // TICKET
  const t = entry as Record<string, unknown>;
  return (
    <Link to={`/tickets/${t.id}`} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start gap-3 hover:bg-gray-50 transition-colors block">
      <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center flex-shrink-0">
        <Wrench className="h-4 w-4 text-brand-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-brand-600">{String(t.ticketNumber ?? '')}</span>
          {Boolean(t.billedInContract) && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">SLA</span>}
        </div>
        <p className="text-sm font-medium text-gray-800 mt-0.5 line-clamp-2">{String(t.title ?? '')}</p>
        <p className="text-xs text-gray-400 mt-1">{dateStr} {timeStr}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />
    </Link>
  );
}

function TabList<T>({ items, empty, render }: { items: T[]; empty: string; render: (item: T) => React.ReactNode }) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400">
        {empty}
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {items.map(render)}
    </div>
  );
}
