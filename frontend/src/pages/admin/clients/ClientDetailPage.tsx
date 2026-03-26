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
import { UnifiedTicketWizard } from '../../../components/wizard/UnifiedTicketWizard';
import { CRM_TYPE_CONFIG, QUOTE_STATUS_CONFIG } from '../crm/CrmPage';
import { getErrorMessage } from '../../../utils/helpers';
import type { Location, Device, Ticket, Credential, User } from '../../../types';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

type TabId = 'historia' | 'overview' | 'contract' | 'locations' | 'devices' | 'tickets' | 'credentials' | 'users';

const TABS: { id: TabId; label: string }[] = [
  { id: 'historia',     label: 'Historia' },
  { id: 'overview',     label: 'Przegl\u0105d' },
  { id: 'contract',     label: 'Umowa' },
  { id: 'locations',    label: 'Lokalizacje' },
  { id: 'devices',      label: 'Urz\u0105dzenia' },
  { id: 'tickets',      label: 'Zg\u0142oszenia' },
  { id: 'credentials',  label: 'Dost\u0119py' },
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
    onError: () => toast.error('B\u0142\u0105d zapisu opiekuna'),
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
      toast.success('Klient usuni\u0119ty');
      qc.invalidateQueries({ queryKey: ['clients'] });
      navigate('/clients');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!client) return <div className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Nie znaleziono klienta</div>;

  const initials = client.name.slice(0, 2).toUpperCase();

  return (
    <div>
      <PageHeader title="" back="/clients" />

      {/* Header karty klienta */}
      <div className="rounded-2xl p-5 mb-5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-start gap-4">
          {/* Logo / inicja\u0142y */}
          {client.logoUrl ? (
            <img
              src={client.logoUrl}
              alt={client.name}
              className="w-14 h-14 rounded-2xl object-contain flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl font-bold text-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
              {initials}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-white/85">{client.name}</h1>
              <ClientStatusBadge status={client.status} />
            </div>
            {client.legalName && (
              <div className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{client.legalName}</div>
            )}
            {client.taxId && (
              <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>NIP: {client.taxId}</div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowNewOrder(true)}>
              <span className="hidden sm:inline">Nowe zgłoszenie</span>
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
              <span className="hidden sm:inline">Usu\u0144</span>
            </Button>
          </div>
        </div>

        {/* Szybkie kontakty */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {client.email && (
            <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 hover:text-violet-400">
              <Mail className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />{client.email}
            </a>
          )}
          {client.phone && (
            <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 hover:text-violet-400">
              <Phone className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />{client.phone}
            </a>
          )}
          {client.website && (
            <a href={client.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-violet-400">
              <Globe className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />{client.website}
            </a>
          )}
          {(client.city || client.addressLine1) && (
            <span className="flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <MapPin className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
              {[client.addressLine1, client.postalCode, client.city].filter(Boolean).join(', ')}
            </span>
          )}
        </div>

        {/* Opiekun */}
        <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <span className="text-xs font-semibold uppercase tracking-wider w-20 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>Opiekun</span>
          <select
            value={(client as any).managerId ?? ''}
            onChange={(e) => updateManagerMutation.mutate(e.target.value || null)}
            disabled={updateManagerMutation.isPending}
            className="text-sm rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}
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
          { label: 'Lokalizacje', value: client._count?.locations ?? 0, tab: 'locations' as TabId, activeBg: 'rgba(139,92,246,0.12)', activeColor: '#A78BFA' },
          { label: 'Urz\u0105dzenia',  value: client._count?.devices ?? 0,   tab: 'devices' as TabId,   activeBg: 'rgba(139,92,246,0.12)', activeColor: '#A78BFA' },
          { label: 'Zg\u0142oszenia', value: client._count?.tickets ?? 0,    tab: 'tickets' as TabId,   activeBg: 'rgba(251,146,60,0.12)', activeColor: '#FB923C' },
        ].map(s => (
          <button
            key={s.label}
            onClick={() => setTab(s.tab)}
            className="rounded-2xl p-4 text-center transition-colors hover:bg-white/[0.03]"
            style={tab === s.tab
              ? { background: s.activeBg, border: '1px solid transparent' }
              : { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }
            }
          >
            <div className="text-2xl font-bold" style={{ color: s.activeColor }}>{s.value}</div>
            <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-5 rounded-2xl overflow-x-auto" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors"
            style={tab === t.id
              ? { background: 'rgba(139,92,246,0.12)', color: '#A78BFA', borderBottom: '2px solid #A78BFA' }
              : { color: 'rgba(255,255,255,0.4)', borderBottom: '2px solid transparent' }
            }
            onMouseEnter={(e) => { if (tab !== t.id) e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
            onMouseLeave={(e) => { if (tab !== t.id) e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
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
              Nowe zgłoszenie
            </Button>
          </div>
          {timeline.length === 0 ? (
            <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>
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

      {/* Tab: Przegl\u0105d */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {client.notes && (
            <div className="md:col-span-2 rounded-2xl p-4" style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <p className="text-xs font-semibold uppercase mb-1" style={{ color: '#FBBF24' }}>Notatki</p>
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.7)' }}>{client.notes}</p>
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
          <div
            className="rounded-2xl p-5 flex items-center gap-4"
            style={client.hasContract
              ? { background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.15)' }
              : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }
            }
          >
            {client.hasContract
              ? <CheckCircle2 className="h-8 w-8 flex-shrink-0" style={{ color: '#60A5FA' }} />
              : <XCircle className="h-8 w-8 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.15)' }} />
            }
            <div>
              <div className="font-semibold text-white/85">
                {client.hasContract ? 'Klient ma umow\u0119 SLA' : 'Brak umowy serwisowej'}
              </div>
              <div className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
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
                <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.12)' }}>
                    <Clock className="h-5 w-5" style={{ color: '#A78BFA' }} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white/85">{client.contractHours} h</div>
                    <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Godziny w umowie</div>
                  </div>
                </div>
              )}
              {/* Warto\u015b\u0107 miesi\u0119czna */}
              {client.contractMonthlyValue != null && (
                <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,197,94,0.12)' }}>
                    <DollarSign className="h-5 w-5" style={{ color: '#4ADE80' }} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white/85">{client.contractMonthlyValue.toLocaleString('pl-PL')} z\u0142</div>
                    <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Warto\u015b\u0107 miesi\u0119czna</div>
                  </div>
                </div>
              )}
              {/* Stawka nadgodziny */}
              {client.contractHourlyRateOverLimit != null && (
                <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(251,146,60,0.12)' }}>
                    <DollarSign className="h-5 w-5" style={{ color: '#FB923C' }} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white/85">{client.contractHourlyRateOverLimit} z\u0142/h</div>
                    <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Stawka za nadgodziny</div>
                  </div>
                </div>
              )}
              {/* Zakres umowy */}
              {client.contractScope && (
                <div className="sm:col-span-2 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Zakres umowy</p>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.6)' }}>{client.contractScope}</p>
                </div>
              )}
              {/* PDF za\u0142\u0105cznik */}
              {client.contractAttachmentUrl && (
                <div className="sm:col-span-2 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Za\u0142\u0105cznik umowy</p>
                  <a
                    href={client.contractAttachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                    style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', color: '#A78BFA' }}
                  >
                    <FileText className="h-4 w-4" style={{ color: '#A78BFA' }} />
                    Otw\u00f3rz PDF umowy
                    <ExternalLink className="h-3.5 w-3.5" style={{ color: 'rgba(167,139,250,0.6)' }} />
                  </a>
                </div>
              )}
            </div>
          ) : (
            client.hourlyRate != null && (
              <div className="rounded-2xl p-4 flex items-center gap-3 max-w-xs" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,197,94,0.12)' }}>
                  <DollarSign className="h-5 w-5" style={{ color: '#4ADE80' }} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white/85">{client.hourlyRate} z\u0142/h</div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Stawka godzinowa</div>
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
              Dodaj lokalizacj\u0119
            </Button>
          </div>
          <TabList
            items={locations}
            empty="Brak lokalizacji"
            render={(loc: Location) => (
              <Link
                to={`/locations/${loc.id}`}
                key={loc.id}
                className="flex items-center gap-4 p-4 hover:bg-white/[0.03] transition-colors"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.12)' }}>
                  <MapPin className="h-4 w-4" style={{ color: '#A78BFA' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white/85">{loc.name}</div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{loc.type} · {loc.city}</div>
                </div>
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{loc._count?.devices ?? 0} urz.</div>
                <ChevronRight className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.15)' }} />
              </Link>
            )}
          />
        </>
      )}

      {/* Tab: Urz\u0105dzenia */}
      {tab === 'devices' && (
        <>
          <div className="flex justify-end mb-3">
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddDevice(true)}>
              Dodaj urz\u0105dzenie
            </Button>
          </div>
          <TabList
            items={devices}
            empty="Brak urz\u0105dze\u0144"
            render={(dev: Device) => (
              <Link
                to={`/devices/${dev.id}`}
                key={dev.id}
                className="flex items-center gap-4 p-4 hover:bg-white/[0.03] transition-colors"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white/85">{dev.name}</div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{dev.deviceType?.name ?? '\u2014'} · <span className="font-mono">{dev.ipAddress ?? '\u2014'}</span></div>
                </div>
                <DeviceStatusBadge status={dev.status} />
                <ChevronRight className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.15)' }} />
              </Link>
            )}
          />
        </>
      )}

      {/* Tab: Zg\u0142oszenia */}
      {tab === 'tickets' && (
        <TabList
          items={tickets}
          empty="Brak zg\u0142osze\u0144"
          render={(t: Ticket) => (
            <Link
              to={`/tickets/${t.id}`}
              key={t.id}
              className="flex items-center gap-4 p-4 hover:bg-white/[0.03] transition-colors"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs" style={{ color: '#A78BFA' }}>{t.ticketNumber}</span>
                  <PriorityBadge priority={t.priority} />
                </div>
                <div className="font-medium text-white/85 mt-0.5">{t.title}</div>
              </div>
              <TicketStatusBadge status={t.status} />
              <ChevronRight className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.15)' }} />
            </Link>
          )}
        />
      )}

      {/* Tab: Dost\u0119py */}
      {tab === 'credentials' && (
        <TabList
          items={credentials}
          empty="Brak danych dost\u0119powych"
          render={(c: Credential) => (
            <Link
              to={`/credentials`}
              key={c.id}
              className="flex items-center gap-4 p-4 hover:bg-white/[0.03] transition-colors"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white/85">{c.name}</div>
                <div className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>{c.username ?? '\u2014'} · {c.device?.name ?? '\u2014'}</div>
              </div>
              <Badge color="gray">{c.category}</Badge>
            </Link>
          )}
        />
      )}

      {/* Tab: U\u017cytkownicy */}
      {tab === 'users' && (
        <>
          <div className="flex justify-end mb-3">
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAddUser(true)}>
              Dodaj u\u017cytkownika
            </Button>
          </div>
          <TabList
            items={users}
            empty="Brak u\u017cytkownik\u00f3w portalu"
            render={(u: User) => (
              <div
                key={u.id}
                className="flex items-center gap-4 p-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
              >
                <div className="w-9 h-9 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
                  {u.firstName[0]}{u.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white/85">{u.firstName} {u.lastName}</div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{u.email}</div>
                </div>
                <Badge color={u.isActive ? 'green' : 'gray'}>{u.isActive ? 'Aktywny' : 'Nieaktywny'}</Badge>
              </div>
            )}
          />
        </>
      )}

      {/* Modal: edycja */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} size="xl" noPadding>
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
        message={`Czy dezaktywowa\u0107 klienta "${client.name}"? Wszystkie dane zostan\u0105 zachowane, klient b\u0119dzie oznaczony jako nieaktywny.`}
        loading={deactivateMutation.isPending}
      />

      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Usu\u0144 klienta"
        message={`Czy na pewno chcesz trwale usun\u0105\u0107 klienta "${client.name}" z bazy danych? Tej operacji nie mo\u017cna cofn\u0105\u0107.`}
        loading={deleteMutation.isPending}
      />

      {/* Modal: dodaj lokalizacj\u0119 */}
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

      {/* Modal: dodaj urz\u0105dzenie */}
      <Modal open={showAddDevice} onClose={() => setShowAddDevice(false)} size="xl" noPadding>
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

      {/* Modal: dodaj u\u017cytkownika portalu */}
      <Modal open={showAddUser} onClose={() => setShowAddUser(false)} size="lg" noPadding>
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

      {/* Unified wizard */}
      <UnifiedTicketWizard
        open={showNewOrder}
        onClose={() => setShowNewOrder(false)}
        defaultClientId={id}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['crm', 'timeline', id] });
          qc.invalidateQueries({ queryKey: ['tickets', { clientId: id }] });
          qc.invalidateQueries({ queryKey: ['orders'] });
        }}
      />
    </div>
  );
}

// Helpers
function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ icon, label, href, external }: { icon: React.ReactNode; label?: string; href?: string; external?: boolean }) {
  if (!label) return null;
  const cls = 'flex items-center gap-2.5 text-sm hover:text-violet-400';
  const content = (
    <>
      <span className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>{icon}</span>
      <span style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
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
      <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)' }}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0`} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <span className={cfg?.color ?? ''} style={!cfg?.color ? { color: 'rgba(255,255,255,0.3)' } : undefined}>{cfg?.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${cfg?.color ?? ''}`}>{cfg?.label ?? String(type)}</span>
            {Boolean(entry.followUpRequired) && (
              <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: '#FBBF24' }}>
                <AlertCircle className="h-3 w-3" /> Do dzia\u0142ania
              </span>
            )}
            {type === 'QUOTE' && entry.quoteStatus ? (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${QUOTE_STATUS_CONFIG[entry.quoteStatus as keyof typeof QUOTE_STATUS_CONFIG]?.color ?? ''}`} style={!QUOTE_STATUS_CONFIG[entry.quoteStatus as keyof typeof QUOTE_STATUS_CONFIG]?.color ? { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)' } : undefined}>
                {QUOTE_STATUS_CONFIG[entry.quoteStatus as keyof typeof QUOTE_STATUS_CONFIG]?.label}
              </span>
            ) : null}
          </div>
          {summary ? <p className="text-sm mt-0.5 line-clamp-2" style={{ color: 'rgba(255,255,255,0.6)' }}>{String(summary)}</p> : null}
          {type === 'QUOTE' && entry.quoteValue != null ? (
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{Number(entry.quoteValue).toLocaleString('pl-PL')} z\u0142</p>
          ) : null}
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{dateStr} {timeStr}</p>
        </div>
      </div>
    );
  }

  // TICKET
  const t = entry as Record<string, unknown>;
  return (
    <Link
      to={`/tickets/${t.id}`}
      className="rounded-2xl p-4 flex items-start gap-3 hover:bg-white/[0.03] transition-colors block"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
        <Wrench className="h-4 w-4" style={{ color: '#A78BFA' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs" style={{ color: '#A78BFA' }}>{String(t.ticketNumber ?? '')}</span>
          {Boolean(t.billedInContract) && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>SLA</span>}
        </div>
        <p className="text-sm font-medium text-white/80 mt-0.5 line-clamp-2">{String(t.title ?? '')}</p>
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{dateStr} {timeStr}</p>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 mt-1" style={{ color: 'rgba(255,255,255,0.15)' }} />
    </Link>
  );
}

function TabList<T>({ items, empty, render }: { items: T[]; empty: string; render: (item: T) => React.ReactNode }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>
        {empty}
      </div>
    );
  }
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {items.map(render)}
    </div>
  );
}
