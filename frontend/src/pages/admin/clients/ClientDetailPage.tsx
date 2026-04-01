import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, Globe, MapPin, Building2, Plus, Pencil, Trash2, ChevronRight, FileText, ExternalLink, Clock, CheckCircle2, XCircle, DollarSign, Calendar, AlertCircle, Wrench, Shield, Wifi, Database, Loader2, Upload } from 'lucide-react';
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
    select: (data) => data.filter(u => (u as any).role === 'ADMIN' || (u as any).role === 'TECHNICIAN'),
  });

  const updateManagerMutation = useMutation({
    mutationFn: (managerId: string | null) => clientsApi.update(id!, { managerId } as any),
    onSuccess: () => {
      toast.success('Opiekun zaktualizowany');
      qc.invalidateQueries({ queryKey: ['clients', id] });
    },
    onError: () => toast.error('B\u0142\u0105d zapisu opiekuna'),
  });

  const toggleServiceMutation = useMutation({
    mutationFn: (data: Record<string, boolean>) => clientsApi.update(id!, data as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients', id] });
      toast.success('Usługa zaktualizowana');
    },
    onError: () => toast.error('Błąd zapisu'),
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
  if (!client) return <div className="text-sm" style={{ color: 'var(--tm)' }}>Nie znaleziono klienta</div>;

  const initials = client.name.slice(0, 2).toUpperCase();

  return (
    <div>
      <PageHeader title="" back="/clients" />

      {/* Header karty klienta */}
      <div className="rounded-2xl p-5 mb-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-start gap-4">
          {/* Logo / inicja\u0142y */}
          {client.logoUrl ? (
            <img
              src={client.logoUrl}
              alt={client.name}
              className="w-14 h-14 rounded-2xl object-contain flex-shrink-0"
              style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)' }}
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
              <div className="text-sm mt-0.5" style={{ color: 'var(--tm)' }}>{client.legalName}</div>
            )}
            {client.taxId && (
              <div className="text-xs mt-0.5" style={{ color: 'var(--tm)' }}>NIP: {client.taxId}</div>
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
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4 text-sm" style={{ color: 'var(--ts)' }}>
          {client.email && (
            <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 hover:text-violet-400">
              <Mail className="h-3.5 w-3.5" style={{ color: 'var(--tm)' }} />{client.email}
            </a>
          )}
          {client.phone && (
            <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 hover:text-violet-400">
              <Phone className="h-3.5 w-3.5" style={{ color: 'var(--tm)' }} />{client.phone}
            </a>
          )}
          {client.website && (
            <a href={client.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-violet-400">
              <Globe className="h-3.5 w-3.5" style={{ color: 'var(--tm)' }} />{client.website}
            </a>
          )}
          {(client.city || client.addressLine1) && (
            <span className="flex items-center gap-1.5" style={{ color: 'var(--tm)' }}>
              <MapPin className="h-3.5 w-3.5" style={{ color: 'var(--tm)' }} />
              {[client.addressLine1, client.postalCode, client.city].filter(Boolean).join(', ')}
            </span>
          )}
        </div>

        {/* Opiekun */}
        <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-xs font-semibold uppercase tracking-wider w-20 flex-shrink-0" style={{ color: 'var(--tm)' }}>Opiekun</span>
          <select
            value={(client as any).managerId ?? ''}
            onChange={(e) => updateManagerMutation.mutate(e.target.value || null)}
            disabled={updateManagerMutation.isPending}
            className="text-sm rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
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
              : { background: 'var(--bg-card)', border: '1px solid var(--border)' }
            }
          >
            <div className="text-2xl font-bold" style={{ color: s.activeColor }}>{s.value}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--tm)' }}>{s.label}</div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-5 rounded-2xl overflow-x-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors"
            style={tab === t.id
              ? { background: 'rgba(139,92,246,0.12)', color: '#A78BFA', borderBottom: '2px solid #A78BFA' }
              : { color: 'var(--tm)', borderBottom: '2px solid transparent' }
            }
            onMouseEnter={(e) => { if (tab !== t.id) e.currentTarget.style.color = 'var(--ts)'; }}
            onMouseLeave={(e) => { if (tab !== t.id) e.currentTarget.style.color = 'var(--tm)'; }}
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
            <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--tm)' }}>
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
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ts)' }}>{client.notes}</p>
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
              : { background: 'var(--hover-bg)', border: '1px solid var(--border)' }
            }
          >
            {client.hasContract
              ? <CheckCircle2 className="h-8 w-8 flex-shrink-0" style={{ color: '#60A5FA' }} />
              : <XCircle className="h-8 w-8 flex-shrink-0" style={{ color: 'var(--td)' }} />
            }
            <div>
              <div className="font-semibold text-white/85">
                {client.hasContract ? 'Klient ma umow\u0119 SLA' : 'Brak umowy serwisowej'}
              </div>
              <div className="text-sm mt-0.5" style={{ color: 'var(--tm)' }}>
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
                <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.12)' }}>
                    <Clock className="h-5 w-5" style={{ color: '#A78BFA' }} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white/85">{client.contractHours} h</div>
                    <div className="text-xs" style={{ color: 'var(--tm)' }}>Godziny w umowie</div>
                  </div>
                </div>
              )}
              {/* Warto\u015b\u0107 miesi\u0119czna */}
              {client.contractMonthlyValue != null && (
                <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,197,94,0.12)' }}>
                    <DollarSign className="h-5 w-5" style={{ color: '#4ADE80' }} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white/85">{client.contractMonthlyValue.toLocaleString('pl-PL')} z\u0142</div>
                    <div className="text-xs" style={{ color: 'var(--tm)' }}>Warto\u015b\u0107 miesi\u0119czna</div>
                  </div>
                </div>
              )}
              {/* Stawka nadgodziny */}
              {client.contractHourlyRateOverLimit != null && (
                <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(251,146,60,0.12)' }}>
                    <DollarSign className="h-5 w-5" style={{ color: '#FB923C' }} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white/85">{client.contractHourlyRateOverLimit} z\u0142/h</div>
                    <div className="text-xs" style={{ color: 'var(--tm)' }}>Stawka za nadgodziny</div>
                  </div>
                </div>
              )}
              {/* Zakres umowy */}
              {client.contractScope && (
                <div className="sm:col-span-2 rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--tm)' }}>Zakres umowy</p>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ts)' }}>{client.contractScope}</p>
                </div>
              )}
              {/* PDF za\u0142\u0105cznik */}
              {client.contractAttachmentUrl && (
                <div className="sm:col-span-2 rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--tm)' }}>Za\u0142\u0105cznik umowy</p>
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
              <div className="rounded-2xl p-4 flex items-center gap-3 max-w-xs" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,197,94,0.12)' }}>
                  <DollarSign className="h-5 w-5" style={{ color: '#4ADE80' }} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white/85">{client.hourlyRate} z\u0142/h</div>
                  <div className="text-xs" style={{ color: 'var(--tm)' }}>Stawka godzinowa</div>
                </div>
              </div>
            )
          )}

          {/* Usługi dodatkowe */}
          <div className="mt-6 rounded-[16px] p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="text-[14px] font-semibold text-white/70 mb-4">Usługi dodatkowe</h3>
            <div className="space-y-3">
              {[
                { key: 'enableSecurityAudit', label: 'Audyt bezpieczeństwa', desc: 'Security Score, 20 checków, rekomendacje', icon: Shield, color: '#4ADE80' },
                { key: 'enableNetworkScan', label: 'Skanowanie sieci', desc: 'Odkrywanie urządzeń, mapa sieci, alerty', icon: Wifi, color: '#60A5FA' },
                { key: 'enableManagedBackup', label: 'Zarządzany backup', desc: 'Status backupów, historia, weryfikacja', icon: Database, color: '#A78BFA' },
                { key: 'enableMonthlyReport', label: 'Raport miesięczny', desc: 'Automatyczny PDF z podsumowaniem', icon: FileText, color: '#FB923C' },
              ].map(svc => (
                <div key={svc.key} className="flex items-center justify-between p-3.5 rounded-xl" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${svc.color}15` }}>
                      <svc.icon className="h-4.5 w-4.5" style={{ color: svc.color }} />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-white/80">{svc.label}</p>
                      <p className="text-[11px]" style={{ color: 'var(--tm)' }}>{svc.desc}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleServiceMutation.mutate({ [svc.key]: !(client as any)[svc.key] })}
                    className="relative w-11 h-6 rounded-full transition-colors duration-200"
                    style={{ background: (client as any)[svc.key] ? `${svc.color}80` : 'var(--td)' }}>
                    <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                      style={{ transform: (client as any)[svc.key] ? 'translateX(20px)' : 'translateX(0)' }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
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
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.12)' }}>
                  <MapPin className="h-4 w-4" style={{ color: '#A78BFA' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white/85">{loc.name}</div>
                  <div className="text-xs" style={{ color: 'var(--tm)' }}>{loc.type} · {loc.city}</div>
                </div>
                <div className="text-xs" style={{ color: 'var(--tm)' }}>{loc._count?.devices ?? 0} urz.</div>
                <ChevronRight className="h-4 w-4" style={{ color: 'var(--td)' }} />
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
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white/85">{dev.name}</div>
                  <div className="text-xs" style={{ color: 'var(--tm)' }}>{dev.deviceType?.name ?? '\u2014'} · <span className="font-mono">{dev.ipAddress ?? '\u2014'}</span></div>
                </div>
                <DeviceStatusBadge status={dev.status} />
                <ChevronRight className="h-4 w-4" style={{ color: 'var(--td)' }} />
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
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs" style={{ color: '#A78BFA' }}>{t.ticketNumber}</span>
                  <PriorityBadge priority={t.priority} />
                </div>
                <div className="font-medium text-white/85 mt-0.5">{t.title}</div>
              </div>
              <TicketStatusBadge status={t.status} />
              <ChevronRight className="h-4 w-4" style={{ color: 'var(--td)' }} />
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
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white/85">{c.name}</div>
                <div className="text-xs font-mono" style={{ color: 'var(--tm)' }}>{c.username ?? '\u2014'} · {c.device?.name ?? '\u2014'}</div>
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
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <div className="w-9 h-9 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
                  {u.firstName[0]}{u.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white/85">{u.firstName} {u.lastName}</div>
                  <div className="text-xs" style={{ color: 'var(--tm)' }}>{u.email}</div>
                </div>
                <Badge color={u.isActive ? 'green' : 'gray'}>{u.isActive ? 'Aktywny' : 'Nieaktywny'}</Badge>
              </div>
            )}
          />
        </>
      )}

      {/* Modal: edycja */}
      {showEdit && (
        <ClientEditCard
          client={client}
          onSave={() => {
            setShowEdit(false);
            qc.invalidateQueries({ queryKey: ['clients', id] });
          }}
          onCancel={() => setShowEdit(false)}
        />
      )}

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
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--tm)' }}>{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ icon, label, href, external }: { icon: React.ReactNode; label?: string; href?: string; external?: boolean }) {
  if (!label) return null;
  const cls = 'flex items-center gap-2.5 text-sm hover:text-violet-400';
  const content = (
    <>
      <span className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--tm)' }}>{icon}</span>
      <span style={{ color: 'var(--ts)' }}>{label}</span>
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
      <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0`} style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>
          <span className={cfg?.color ?? ''} style={!cfg?.color ? { color: 'var(--tm)' } : undefined}>{cfg?.icon}</span>
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
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${QUOTE_STATUS_CONFIG[entry.quoteStatus as keyof typeof QUOTE_STATUS_CONFIG]?.color ?? ''}`} style={!QUOTE_STATUS_CONFIG[entry.quoteStatus as keyof typeof QUOTE_STATUS_CONFIG]?.color ? { background: 'var(--hover-bg)', color: 'var(--ts)' } : undefined}>
                {QUOTE_STATUS_CONFIG[entry.quoteStatus as keyof typeof QUOTE_STATUS_CONFIG]?.label}
              </span>
            ) : null}
          </div>
          {summary ? <p className="text-sm mt-0.5 line-clamp-2" style={{ color: 'var(--ts)' }}>{String(summary)}</p> : null}
          {type === 'QUOTE' && entry.quoteValue != null ? (
            <p className="text-xs mt-0.5" style={{ color: 'var(--tm)' }}>{Number(entry.quoteValue).toLocaleString('pl-PL')} z\u0142</p>
          ) : null}
          <p className="text-xs mt-1" style={{ color: 'var(--tm)' }}>{dateStr} {timeStr}</p>
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
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
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
        <p className="text-xs mt-1" style={{ color: 'var(--tm)' }}>{dateStr} {timeStr}</p>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 mt-1" style={{ color: 'var(--td)' }} />
    </Link>
  );
}

function TabList<T>({ items, empty, render }: { items: T[]; empty: string; render: (item: T) => React.ReactNode }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--tm)' }}>
        {empty}
      </div>
    );
  }
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      {items.map(render)}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CLIENT EDIT CARD — full inline editor with all fields
   ════════════════════════════════════════════════════════════════════ */
function ClientEditCard({ client, onSave, onCancel }: {
  client: any;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ ...client });
  const [saving, setSaving] = useState(false);

  const set = (key: string, val: any) => setForm((p: any) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await clientsApi.update(client.id, form);
      toast.success('Zapisano zmiany');
      onSave();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
    setSaving(false);
  };

  const Field = ({ label, field, type = 'text', half = false, mono = false }: {
    label: string; field: string; type?: string; half?: boolean; mono?: boolean;
  }) => (
    <div className={half ? 'flex-1 min-w-[180px]' : 'w-full'}>
      <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--tm)' }}>{label}</label>
      <input
        type={type}
        value={form[field] ?? ''}
        onChange={e => set(field, type === 'number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value || null)}
        className={`w-full px-3 py-2 text-sm rounded-xl focus:outline-none transition-all ${mono ? 'font-mono' : ''}`}
        style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
      />
    </div>
  );

  const Toggle = ({ label, field }: { label: string; field: string }) => (
    <button onClick={() => set(field, !form[field])}
      className="flex items-center gap-2 py-2 px-3 rounded-xl text-xs font-medium transition-all"
      style={{
        background: form[field] ? 'rgba(34,197,94,0.1)' : 'var(--bg-card)',
        border: form[field] ? '1px solid rgba(34,197,94,0.2)' : '1px solid var(--border)',
        color: form[field] ? '#4ADE80' : 'var(--tm)',
      }}>
      <div className={`w-3 h-3 rounded-full ${form[field] ? 'bg-emerald-400' : 'bg-white/10'}`} />
      {label}
    </button>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--tm)' }}>{title}</h3>
      {children}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      {/* Card — right panel */}
      <div className="ml-auto relative z-10 h-full w-full max-w-[700px] overflow-y-auto"
        style={{ background: 'var(--bg2)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
          style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>
          <div>
            <h2 className="text-lg font-bold text-white/85">Edycja klienta</h2>
            <p className="text-xs text-white/35 mt-0.5">{client.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onCancel}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white/50 hover:text-white/70 hover:bg-white/5 transition-all">
              Anuluj
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)', boxShadow: '0 2px 10px rgba(79,140,255,0.2)' }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Zapisz
            </button>
          </div>
        </div>

        <div className="p-6 space-y-8">

          {/* Dane podstawowe */}
          <Section title="Dane podstawowe">
            <div className="space-y-3">
              <div className="flex gap-3">
                <Field label="Nazwa firmy" field="name" />
              </div>
              <div className="flex gap-3">
                <Field label="Nazwa skrócona" field="legalName" half />
                <Field label="NIP" field="taxId" half mono />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--tm)' }}>Typ</label>
                  <select value={form.clientType || 'COMPANY'} onChange={e => set('clientType', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl focus:outline-none"
                    style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}>
                    <option value="COMPANY">Firma</option>
                    <option value="INDIVIDUAL">Osoba fizyczna</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--tm)' }}>Status</label>
                  <select value={form.status || 'ACTIVE'} onChange={e => set('status', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl focus:outline-none"
                    style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}>
                    <option value="ACTIVE">Aktywny</option>
                    <option value="INACTIVE">Nieaktywny</option>
                  </select>
                </div>
              </div>
            </div>
          </Section>

          {/* Kontakt */}
          <Section title="Kontakt">
            <div className="space-y-3">
              <div className="flex gap-3">
                <Field label="Email" field="email" type="email" half />
                <Field label="Telefon" field="phone" half />
              </div>
              <Field label="Strona WWW" field="website" />
            </div>
          </Section>

          {/* Osoba kontaktowa */}
          <Section title="Osoba kontaktowa">
            <div className="flex gap-3">
              <Field label="Imię" field="firstName" half />
              <Field label="Nazwisko" field="lastName" half />
            </div>
          </Section>

          {/* Adres */}
          <Section title="Adres">
            <div className="space-y-3">
              <Field label="Adres (ulica i numer)" field="addressLine1" />
              <Field label="Adres linia 2" field="addressLine2" />
              <div className="flex gap-3">
                <Field label="Kod pocztowy" field="postalCode" half mono />
                <Field label="Miasto" field="city" half />
              </div>
              <Field label="Kraj" field="country" />
            </div>
          </Section>

          {/* Umowa serwisowa */}
          <Section title="Umowa serwisowa">
            <div className="space-y-3">
              <Toggle label="Posiada umowę serwisową" field="hasContract" />
              <div className="flex gap-3">
                <Field label="Stawka godzinowa (zł)" field="hourlyRate" type="number" half />
                <Field label="Abonament miesięczny (zł)" field="contractMonthlyValue" type="number" half />
              </div>
              <div className="flex gap-3">
                <Field label="Godziny w umowie" field="contractHours" type="number" half />
                <Field label="Stawka po limicie (zł/h)" field="contractHourlyRateOverLimit" type="number" half />
              </div>
              <div className="flex gap-3">
                <Field label="Interwał rozliczeniowy (min)" field="billingIntervalMinutes" type="number" half />
                <Field label="Data rozpoczęcia umowy" field="contractStartDate" type="date" half />
              </div>
              <Field label="Zakres umowy" field="contractScope" />
            </div>
          </Section>

          {/* Usługi */}
          <Section title="Usługi dodatkowe">
            <div className="flex flex-wrap gap-2">
              <Toggle label="Audyt bezpieczeństwa" field="enableSecurityAudit" />
              <Toggle label="Skan sieci" field="enableNetworkScan" />
              <Toggle label="Zarządzany backup" field="enableManagedBackup" />
              <Toggle label="Raport miesięczny" field="enableMonthlyReport" />
            </div>
          </Section>

          {/* Logo */}
          <Section title="Logo">
            <div className="flex items-start gap-4">
              {form.logoUrl && (
                <img src={form.logoUrl.startsWith('/') ? form.logoUrl : form.logoUrl} alt="Logo"
                  className="w-16 h-16 rounded-xl object-contain flex-shrink-0"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} />
              )}
              <div className="flex-1 space-y-2">
                <Field label="URL logo (lub wgraj plik poniżej)" field="logoUrl" />
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--tm)' }}>
                    Wgraj z dysku (max 2 MB)
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/svg+xml"
                    className="hidden"
                    id="logo-upload"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) { toast.error('Plik za duży — max 2 MB'); return; }
                      const fd = new FormData();
                      fd.append('file', file);
                      try {
                        const res = await fetch('/api/upload', {
                          method: 'POST',
                          headers: { 'Authorization': `Bearer ${localStorage.getItem('infradesk_access_token')}` },
                          body: fd,
                        });
                        const data = await res.json();
                        if (data.url) { set('logoUrl', data.url); toast.success('Logo wgrane'); }
                        else toast.error(data.error || 'Błąd uploadu');
                      } catch { toast.error('Błąd uploadu'); }
                      e.target.value = '';
                    }}
                  />
                  <label htmlFor="logo-upload"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all hover:bg-white/[0.06]"
                    style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--ts)' }}>
                    <Upload className="h-3.5 w-3.5" /> Wybierz plik
                  </label>
                </div>
              </div>
            </div>
          </Section>

          {/* Notatki */}
          <Section title="Notatki">
            <textarea
              value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value || null)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-xl focus:outline-none resize-none"
              style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
              placeholder="Notatki wewnętrzne..."
            />
          </Section>

        </div>

        {/* Bottom save bar */}
        <div className="sticky bottom-0 px-6 py-4 flex justify-end gap-2"
          style={{ background: 'var(--bg2)', borderTop: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-medium text-white/50 hover:text-white/70 hover:bg-white/5">
            Anuluj
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)', boxShadow: '0 2px 10px rgba(79,140,255,0.2)' }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Zapisz zmiany
          </button>
        </div>
      </div>
    </div>
  );
}
