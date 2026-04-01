import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Search, ChevronRight, ChevronLeft, X, CheckCircle2,
  Plus, MapPin, Loader2, Monitor
} from 'lucide-react';
import { clsx } from 'clsx';
import { devicesApi } from '../../api/devices';
import { clientsApi } from '../../api/clients';
import { useClientSearch } from '../../hooks/useClientSearch';
import { locationsApi } from '../../api/locations';
import { usersApi } from '../../api/users';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../utils/helpers';
import type { Client, Device, Location } from '../../types';

// ── Step types ────────────────────────────────────────────────────────────────
type Step = 'client' | 'location' | 'device' | 'technical' | 'done';

// ── Schemas ───────────────────────────────────────────────────────────────────
const deviceSchema = z.object({
  name:        z.string().min(1, 'Nazwa jest wymagana'),
  assetTag:    z.string().optional(),
  status:      z.string().default('ACTIVE'),
  criticality: z.string().default('MEDIUM'),
  deviceTypeId: z.string().optional(),
  assignedUserId: z.string().optional(),
  installationDate: z.string().optional(),
  warrantyMonths:   z.string().optional(),
});

const techSchema = z.object({
  manufacturer: z.string().optional(),
  model:        z.string().optional(),
  serialNumber: z.string().optional(),
  hostname:     z.string().optional(),
  ipAddress:    z.string().optional(),
  macAddress:   z.string().optional(),
  operatingSystem: z.string().optional(),
  osVersion:    z.string().optional(),
  rustdeskId:   z.string().optional(),
  rdpAddress:   z.string().optional(),
  description:  z.string().optional(),
});

const locationSchema = z.object({
  name: z.string().min(1, 'Nazwa jest wymagana'),
  type: z.string().default('MAIN'),
});

type DeviceForm  = z.infer<typeof deviceSchema>;
type TechForm    = z.infer<typeof techSchema>;
type LocationForm = z.infer<typeof locationSchema>;

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'ACTIVE',     label: 'Aktywne',    color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'IN_SERVICE', label: 'W serwisie', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'BROKEN',     label: 'Uszkodzone', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'INACTIVE',   label: 'Nieaktywne', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  { value: 'RETIRED',    label: 'Wycofane',   color: 'bg-orange-100 text-orange-700 border-orange-200' },
];

const CRIT_OPTIONS = [
  { value: 'LOW',    label: 'Niski',   color: 'bg-gray-100 text-gray-600 border-gray-200' },
  { value: 'MEDIUM', label: 'Średni',  color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'HIGH',   label: 'Wysoki',  color: 'bg-red-100 text-red-700 border-red-200' },
];

const LOCATION_TYPES = [
  { value: 'MAIN', label: 'Główna' }, { value: 'BRANCH', label: 'Oddział' },
  { value: 'WAREHOUSE', label: 'Magazyn' }, { value: 'HOME', label: 'Dom' },
  { value: 'OTHER', label: 'Inne' },
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  device?: Device;
  defaultClientId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DeviceForm({ device, defaultClientId, onSuccess, onCancel }: Props) {
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>(defaultClientId || device ? 'location' : 'client');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [gettingGPS, setGettingGPS] = useState(false);
  const [gpsLat, setGpsLat] = useState<number | undefined>(device?.gpsLat ?? undefined);
  const [gpsLon, setGpsLon] = useState<number | undefined>(device?.gpsLon ?? undefined);

  const activeClientId = selectedClient?.id ?? defaultClientId ?? device?.clientId ?? '';

  // Load default client
  const { data: defaultClient } = useQuery({
    queryKey: ['clients', defaultClientId ?? device?.clientId],
    queryFn: () => clientsApi.getOne((defaultClientId ?? device?.clientId)!),
    enabled: !!(defaultClientId ?? device?.clientId) && !selectedClient,
  });
  useEffect(() => {
    if (defaultClient && !selectedClient) setSelectedClient(defaultClient);
  }, [defaultClient]);

  // Clients list — server-side search with debounce
  const { clients: filteredClients, isLoading: clientsLoading } = useClientSearch(
    clientSearch,
    step === 'client',
  );

  // Locations
  const { data: locations = [], refetch: refetchLocations } = useQuery({
    queryKey: ['locations', { clientId: activeClientId }],
    queryFn: () => locationsApi.getAll({ clientId: activeClientId }),
    enabled: !!activeClientId && step === 'location',
  });

  // Device types
  const { data: deviceTypes = [] } = useQuery({
    queryKey: ['device-types'],
    queryFn: () => devicesApi.getTypes(),
    enabled: step === 'device',
  });

  // Workers
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll(),
    enabled: step === 'device',
  });
  const workers = allUsers.filter(u => (u as any).role !== 'CLIENT' && u.isActive);

  // Forms
  const deviceForm = useForm<DeviceForm>({
    resolver: zodResolver(deviceSchema),
    defaultValues: {
      name:        device?.name ?? '',
      assetTag:    device?.assetTag ?? '',
      status:      device?.status ?? 'ACTIVE',
      criticality: device?.criticality ?? 'MEDIUM',
      deviceTypeId: device?.deviceTypeId ?? '',
      assignedUserId: device?.assignedUserId ?? '',
      installationDate: device?.installationDate ? device.installationDate.substring(0, 10) : '',
      warrantyMonths: device?.warrantyMonths?.toString() ?? '',
    },
  });

  const techForm = useForm<TechForm>({
    resolver: zodResolver(techSchema),
    defaultValues: {
      manufacturer: device?.manufacturer ?? '',
      model:        device?.model ?? '',
      serialNumber: device?.serialNumber ?? '',
      hostname:     device?.hostname ?? '',
      ipAddress:    device?.ipAddress ?? '',
      macAddress:   device?.macAddress ?? '',
      operatingSystem: device?.operatingSystem ?? '',
      osVersion:    device?.osVersion ?? '',
      rustdeskId:   device?.rustdeskId ?? '',
      rdpAddress:   device?.rdpAddress ?? '',
      description:  device?.description ?? '',
    },
  });

  const locationForm = useForm<LocationForm>({
    resolver: zodResolver(locationSchema),
    defaultValues: { name: '', type: 'MAIN' },
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (tech: TechForm) => {
      const dv = deviceForm.getValues();
      const payload = {
        clientId:   activeClientId,
        locationId: selectedLocation?.id ?? device?.locationId ?? '',
        name:       dv.name,
        assetTag:   dv.assetTag || undefined,
        status:     dv.status,
        criticality: dv.criticality,
        deviceTypeId: dv.deviceTypeId || undefined,
        assignedUserId: dv.assignedUserId || undefined,
        installationDate: dv.installationDate ? new Date(dv.installationDate).toISOString() : undefined,
        warrantyMonths: dv.warrantyMonths ? parseInt(dv.warrantyMonths) : undefined,
        gpsLat, gpsLon,
        ...tech,
        manufacturer: tech.manufacturer || undefined,
        model:        tech.model || undefined,
        serialNumber: tech.serialNumber || undefined,
        hostname:     tech.hostname || undefined,
        ipAddress:    tech.ipAddress || undefined,
        macAddress:   tech.macAddress || undefined,
        operatingSystem: tech.operatingSystem || undefined,
        osVersion:    tech.osVersion || undefined,
        rustdeskId:   tech.rustdeskId || undefined,
        rdpAddress:   tech.rdpAddress || undefined,
        description:  tech.description || undefined,
      };
      return device
        ? devicesApi.update(device.id, payload as Partial<Device>)
        : devicesApi.create(payload as Partial<Device>);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] });
      setStep('done');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const addLocationMutation = useMutation({
    mutationFn: (d: LocationForm) => locationsApi.create({ ...d, clientId: activeClientId }),
    onSuccess: (loc) => {
      refetchLocations();
      setSelectedLocation(loc as Location);
      setShowNewLocation(false);
      locationForm.reset();
      toast.success('Lokalizacja dodana');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleGPS = () => {
    if (!navigator.geolocation) { toast.error('GPS niedostępny'); return; }
    setGettingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGpsLat(pos.coords.latitude); setGpsLon(pos.coords.longitude); setGettingGPS(false); toast.success('GPS zapisany'); },
      () => { toast.error('Nie udało się pobrać GPS'); setGettingGPS(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const goBack = useCallback(() => {
    if (step === 'location') { if (!defaultClientId && !device) setStep('client'); }
    if (step === 'device')   setStep('location');
    if (step === 'technical') setStep('device');
  }, [step, defaultClientId, device]);

  const clientName = selectedClient?.name ?? '';
  const locationName = selectedLocation?.name ?? (device ? 'Lokalizacja' : '');

  // ── Screens ───────────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-4">
        <CheckCircle2 className="h-14 w-14 text-green-500" />
        <p className="text-lg font-bold text-gray-900">
          {device ? 'Zapisano zmiany' : 'Urządzenie dodane'}
        </p>
        <Button onClick={onSuccess}>Zamknij</Button>
      </div>
    );
  }

  const showBack = step !== 'client' && !(step === 'location' && (!!defaultClientId || !!device));

  return (
    <div className="flex flex-col" style={{ maxHeight: '82vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          {showBack && (
            <button onClick={goBack} className="text-gray-400 hover:text-gray-600">
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {device ? 'Edytuj urządzenie' : 'Nowe urządzenie'}
            </h2>
            <p className="text-xs text-gray-400">
              {clientName}{locationName ? ` · ${locationName}` : ''}
            </p>
          </div>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-1.5 mr-6">
          {(['client','location','device','technical'] as Step[])
            .filter(s => s !== 'client' || (!defaultClientId && !device))
            .map((s, i, arr) => (
              <div key={s} className="flex items-center gap-1.5">
                <div className={clsx(
                  'w-2 h-2 rounded-full transition-colors',
                  step === s ? 'bg-brand-500' :
                  arr.indexOf(step) > i ? 'bg-brand-300' : 'bg-gray-200'
                )} />
              </div>
            ))
          }
        </div>

        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">

        {/* ── STEP: KLIENT ─────────────────────────────────────────────────── */}
        {step === 'client' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">Wybierz klienta</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                autoFocus
                placeholder="Szukaj firmy lub NIP..."
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {filteredClients.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedClient(c); setStep('location'); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-brand-300 hover:bg-brand-50 transition-colors text-left"
                >
                  {c.logoUrl
                    ? <img src={c.logoUrl} alt={c.name} className="w-9 h-9 rounded-lg object-contain bg-gray-50 border border-gray-100 flex-shrink-0" />
                    : <div className="w-9 h-9 rounded-lg bg-brand-100 text-brand-700 font-bold text-sm flex items-center justify-center flex-shrink-0">{c.name.slice(0,2).toUpperCase()}</div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">{c.name}</div>
                    {c.city && <div className="text-xs text-gray-400">{c.city}</div>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                </button>
              ))}
              {clientsLoading && (
                <p className="text-sm text-gray-400 text-center py-6">Wyszukiwanie...</p>
              )}
              {!clientsLoading && filteredClients.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">Brak wyników</p>
              )}
            </div>
          </div>
        )}

        {/* ── STEP: LOKALIZACJA ─────────────────────────────────────────────── */}
        {step === 'location' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">Wybierz lokalizację</p>

            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {locations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => { setSelectedLocation(loc as Location); setStep('device'); }}
                  className={clsx(
                    'w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left',
                    selectedLocation?.id === loc.id
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-gray-100 hover:border-brand-300 hover:bg-brand-50'
                  )}
                >
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-4 w-4 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">{loc.name}</div>
                    {loc.addressLine1 && <div className="text-xs text-gray-400">{loc.addressLine1}</div>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                </button>
              ))}
              {locations.length === 0 && !showNewLocation && (
                <p className="text-sm text-gray-400 text-center py-4">Brak lokalizacji — dodaj nową</p>
              )}
            </div>

            {/* Dodaj nową lokalizację */}
            {!showNewLocation ? (
              <button
                onClick={() => setShowNewLocation(true)}
                className="w-full flex items-center gap-2 p-3 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors text-sm"
              >
                <Plus className="h-4 w-4" /> Dodaj nową lokalizację
              </button>
            ) : (
              <div className="p-4 bg-brand-50 rounded-xl border border-brand-200 space-y-3">
                <p className="text-sm font-semibold text-brand-700">Nowa lokalizacja</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Nazwa *"
                    {...locationForm.register('name')}
                    error={locationForm.formState.errors.name?.message}
                  />
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Typ</label>
                    <select
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                      {...locationForm.register('type')}
                    >
                      {LOCATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowNewLocation(false)} className="text-sm text-gray-500 hover:text-gray-700">Anuluj</button>
                  <Button
                    size="sm"
                    loading={addLocationMutation.isPending}
                    onClick={() => locationForm.handleSubmit(d => addLocationMutation.mutate(d))()}
                  >
                    Dodaj
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP: URZĄDZENIE ─────────────────────────────────────────────── */}
        {step === 'device' && (
          <div className="space-y-5">
            {/* Typ urządzenia */}
            {deviceTypes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Typ urządzenia</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => deviceForm.setValue('deviceTypeId', '')}
                    className={clsx(
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-colors',
                      !deviceForm.watch('deviceTypeId')
                        ? 'border-brand-400 bg-brand-50 text-brand-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    <Monitor className="h-5 w-5" />
                    Inne
                  </button>
                  {deviceTypes.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => deviceForm.setValue('deviceTypeId', t.id)}
                      className={clsx(
                        'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-colors',
                        deviceForm.watch('deviceTypeId') === t.id
                          ? 'border-brand-400 bg-brand-50 text-brand-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      )}
                    >
                      <span className="text-xl leading-none">{t.icon || '📦'}</span>
                      <span className="truncate w-full text-center">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Nazwa i Asset Tag */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <Input
                  label="Nazwa urządzenia *"
                  placeholder="np. Komputer recepcji"
                  {...deviceForm.register('name')}
                  error={deviceForm.formState.errors.name?.message}
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Input
                  label="Asset Tag"
                  placeholder="np. PC-001"
                  {...deviceForm.register('assetTag')}
                />
              </div>
            </div>

            {/* Status */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => deviceForm.setValue('status', s.value)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors',
                      deviceForm.watch('status') === s.value
                        ? s.color + ' ring-2 ring-offset-1 ring-brand-400'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Krytyczność */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Krytyczność</p>
              <div className="flex gap-2">
                {CRIT_OPTIONS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => deviceForm.setValue('criticality', c.value)}
                    className={clsx(
                      'flex-1 py-2 rounded-xl border text-sm font-medium transition-colors',
                      deviceForm.watch('criticality') === c.value
                        ? c.color + ' ring-2 ring-offset-1 ring-brand-400'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Daty */}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Data montażu" type="date" {...deviceForm.register('installationDate')} />
              <Input label="Gwarancja (mies.)" type="number" min="0" placeholder="np. 24" {...deviceForm.register('warrantyMonths')} />
            </div>

            {/* Przypisany pracownik */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Przypisany pracownik</p>
              <select
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                {...deviceForm.register('assignedUserId')}
              >
                <option value="">Brak</option>
                {workers.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            </div>

            {/* Dalej */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => deviceForm.handleSubmit(() => setStep('technical'))()}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Pomiń dane techniczne →
              </button>
              <Button onClick={() => deviceForm.handleSubmit(() => setStep('technical'))()}>
                Dalej
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP: DANE TECHNICZNE ─────────────────────────────────────────── */}
        {step === 'technical' && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-gray-700">Dane techniczne <span className="text-gray-400 font-normal">(opcjonalne)</span></p>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Producent"     placeholder="np. Dell" {...techForm.register('manufacturer')} />
              <Input label="Model"         placeholder="np. Latitude 5540" {...techForm.register('model')} />
              <Input label="Numer seryjny" placeholder="SN123456" {...techForm.register('serialNumber')} />
              <Input label="Hostname"      placeholder="np. PC-RECEPCJA" {...techForm.register('hostname')} />
              <Input label="Adres IP"      placeholder="192.168.1.x" {...techForm.register('ipAddress')} />
              <Input label="Adres MAC"     placeholder="AA:BB:CC:DD:EE:FF" {...techForm.register('macAddress')} />
              <Input label="System OS"     placeholder="np. Windows 11" {...techForm.register('operatingSystem')} />
              <Input label="Wersja OS"     placeholder="np. 23H2" {...techForm.register('osVersion')} />
            </div>

            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Zdalny dostęp</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="RustDesk ID" {...techForm.register('rustdeskId')} />
                <Input label="RDP adres"   {...techForm.register('rdpAddress')} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Opis / Notatki</label>
              <textarea
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
                placeholder="Dodatkowe informacje o urządzeniu..."
                {...techForm.register('description')}
              />
            </div>

            {/* GPS */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Lokalizacja GPS</p>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleGPS}
                  disabled={gettingGPS}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors',
                    gpsLat && gpsLon
                      ? 'border-green-300 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  {gettingGPS ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  {gpsLat && gpsLon ? 'GPS zapisany ✓' : 'Pobierz GPS'}
                </button>
                {gpsLat && gpsLon && (
                  <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
                    {Number(gpsLat).toFixed(5)}, {Number(gpsLon).toFixed(5)}
                  </span>
                )}
              </div>
            </div>

            {/* Zapisz */}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" type="button" onClick={goBack}>Wstecz</Button>
              <Button
                loading={saveMutation.isPending}
                onClick={() => techForm.handleSubmit(d => saveMutation.mutate(d))()}
              >
                {device ? 'Zapisz zmiany' : 'Dodaj urządzenie'}
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
