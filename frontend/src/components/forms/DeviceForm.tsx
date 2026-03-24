import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MapPin, Loader2, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';
import { devicesApi } from '../../api/devices';
import { clientsApi } from '../../api/clients';
import { locationsApi } from '../../api/locations';
import { usersApi } from '../../api/users';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../utils/helpers';
import type { Device } from '../../types';

const schema = z.object({
  clientId:         z.string().min(1, 'Wybierz klienta'),
  locationId:       z.string().min(1, 'Wybierz lokalizację'),
  deviceTypeId:     z.string().optional(),
  name:             z.string().min(1, 'Nazwa jest wymagana'),
  assetTag:         z.string().optional(),
  status:           z.string(),
  criticality:      z.string(),
  assignedUserId:   z.string().optional(),
  installationDate: z.string().optional(),
  warrantyMonths:   z.string().optional(),
  gpsLat:           z.number().optional(),
  gpsLon:           z.number().optional(),
  manufacturer:     z.string().optional(),
  model:            z.string().optional(),
  serialNumber:     z.string().optional(),
  hostname:         z.string().optional(),
  ipAddress:        z.string().optional(),
  macAddress:       z.string().optional(),
  operatingSystem:  z.string().optional(),
  osVersion:        z.string().optional(),
  rustdeskId:       z.string().optional(),
  rdpAddress:       z.string().optional(),
  sshAddress:       z.string().optional(),
  anydeskId:        z.string().optional(),
  teamviewerId:     z.string().optional(),
  customRemoteLink: z.string().optional(),
  description:      z.string().optional(),
  internalNotes:    z.string().optional(),
  clientVisibleNotes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const locationSchema = z.object({
  name: z.string().min(1, 'Nazwa jest wymagana'),
  type: z.string().default('MAIN'),
});

const typeSchema = z.object({
  name: z.string().min(1, 'Nazwa jest wymagana'),
  icon: z.string().optional(),
});

interface Props {
  device?: Device;
  defaultClientId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const STATUS_OPTIONS = [
  { value: 'ACTIVE',     label: 'Aktywne' },
  { value: 'INACTIVE',   label: 'Nieaktywne' },
  { value: 'BROKEN',     label: 'Uszkodzone' },
  { value: 'RETIRED',    label: 'Wycofane' },
  { value: 'IN_SERVICE', label: 'W serwisie' },
];

const CRIT_OPTIONS = [
  { value: 'LOW',    label: 'Niski' },
  { value: 'MEDIUM', label: 'Średni' },
  { value: 'HIGH',   label: 'Wysoki' },
];

const LOCATION_TYPES = [
  { value: 'MAIN',      label: 'Główna' },
  { value: 'BRANCH',    label: 'Oddział' },
  { value: 'WAREHOUSE', label: 'Magazyn' },
  { value: 'HOME',      label: 'Dom' },
  { value: 'OTHER',     label: 'Inne' },
];

export function DeviceForm({ device, defaultClientId, onSuccess, onCancel }: Props) {
  const queryClient = useQueryClient();
  const [gettingGPS, setGettingGPS]       = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [showAddType, setShowAddType]     = useState(false);
  const [userSearch, setUserSearch]       = useState('');
  const [showTechnical, setShowTechnical] = useState(!!device);
  const [showRemote, setShowRemote]       = useState(!!device);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId:           device?.clientId ?? defaultClientId ?? '',
      locationId:         device?.locationId ?? '',
      deviceTypeId:       device?.deviceTypeId ?? '',
      name:               device?.name ?? '',
      assetTag:           device?.assetTag ?? '',
      status:             device?.status ?? 'ACTIVE',
      criticality:        device?.criticality ?? 'MEDIUM',
      assignedUserId:     device?.assignedUserId ?? '',
      installationDate:   device?.installationDate ? device.installationDate.substring(0, 10) : '',
      warrantyMonths:     device?.warrantyMonths?.toString() ?? '',
      gpsLat:             device?.gpsLat ?? undefined,
      gpsLon:             device?.gpsLon ?? undefined,
      manufacturer:       device?.manufacturer ?? '',
      model:              device?.model ?? '',
      serialNumber:       device?.serialNumber ?? '',
      hostname:           device?.hostname ?? '',
      ipAddress:          device?.ipAddress ?? '',
      macAddress:         device?.macAddress ?? '',
      operatingSystem:    device?.operatingSystem ?? '',
      osVersion:          device?.osVersion ?? '',
      rustdeskId:         device?.rustdeskId ?? '',
      rdpAddress:         device?.rdpAddress ?? '',
      sshAddress:         device?.sshAddress ?? '',
      anydeskId:          device?.anydeskId ?? '',
      teamviewerId:       device?.teamviewerId ?? '',
      customRemoteLink:   device?.customRemoteLink ?? '',
      description:        device?.description ?? '',
      internalNotes:      device?.internalNotes ?? '',
      clientVisibleNotes: device?.clientVisibleNotes ?? '',
    },
  });

  const clientId = watch('clientId');
  const gpsLat   = watch('gpsLat');
  const gpsLon   = watch('gpsLon');

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn:  () => clientsApi.getAll(),
  });
  const { data: locations = [], refetch: refetchLocations } = useQuery({
    queryKey: ['locations', { clientId }],
    queryFn:  () => locationsApi.getAll({ clientId }),
    enabled:  !!clientId,
  });
  const { data: deviceTypes = [] } = useQuery({
    queryKey: ['device-types'],
    queryFn:  () => devicesApi.getTypes(),
  });
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn:  () => usersApi.getAll(),
  });

  const workers = allUsers
    .filter(u => u.role !== 'CLIENT' && u.isActive)
    .filter(u => !userSearch || `${u.firstName} ${u.lastName}`.toLowerCase().includes(userSearch.toLowerCase()));

  // Main save mutation
  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        ...data,
        deviceTypeId:     data.deviceTypeId || undefined,
        assignedUserId:   data.assignedUserId || undefined,
        installationDate: data.installationDate
          ? new Date(data.installationDate).toISOString()
          : undefined,
        warrantyMonths:   data.warrantyMonths ? parseInt(data.warrantyMonths) : undefined,
        gpsLat:           data.gpsLat ?? undefined,
        gpsLon:           data.gpsLon ?? undefined,
      };
      return device
        ? devicesApi.update(device.id, payload as Partial<Device>)
        : devicesApi.create(payload as Partial<Device>);
    },
    onSuccess,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Inline location form
  const locationForm = useForm({
    resolver: zodResolver(locationSchema),
    defaultValues: { name: '', type: 'MAIN' },
  });
  const addLocationMutation = useMutation({
    mutationFn: (d: { name: string; type: string }) =>
      locationsApi.create({ ...d, clientId }),
    onSuccess: (loc) => {
      refetchLocations();
      setValue('locationId', loc.id);
      setShowAddLocation(false);
      locationForm.reset();
      toast.success('Lokalizacja dodana');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Inline device type form
  const typeForm = useForm({
    resolver: zodResolver(typeSchema),
    defaultValues: { name: '', icon: '' },
  });
  const addTypeMutation = useMutation({
    mutationFn: (d: { name: string; icon?: string }) =>
      devicesApi.createType({ name: d.name, icon: d.icon || undefined }),
    onSuccess: (type) => {
      queryClient.invalidateQueries({ queryKey: ['device-types'] });
      setValue('deviceTypeId', type.id);
      setShowAddType(false);
      typeForm.reset();
      toast.success('Typ urządzenia dodany');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleGPS = () => {
    if (!navigator.geolocation) {
      toast.error('GPS nie jest dostępny w tej przeglądarce');
      return;
    }
    setGettingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue('gpsLat', pos.coords.latitude);
        setValue('gpsLon', pos.coords.longitude);
        setGettingGPS(false);
        toast.success('Lokalizacja GPS zapisana');
      },
      () => {
        toast.error('Nie udało się pobrać lokalizacji GPS');
        setGettingGPS(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-6">

      {/* ── Podstawowe ─────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Podstawowe</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Klient */}
          <Select
            label="Klient *"
            placeholder="Wybierz klienta"
            options={clients.map(c => ({ value: c.id, label: c.name }))}
            {...register('clientId')}
            error={errors.clientId?.message}
          />

          {/* Lokalizacja + dodaj */}
          <div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select
                  label="Lokalizacja *"
                  placeholder="Wybierz lokalizację"
                  options={locations.map(l => ({ value: l.id, label: l.name }))}
                  {...register('locationId')}
                  error={errors.locationId?.message}
                  disabled={!clientId}
                />
              </div>
              <button
                type="button"
                onClick={() => { if (clientId) setShowAddLocation(v => !v); }}
                disabled={!clientId}
                title="Dodaj nową lokalizację"
                className="mb-[1px] flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-[9px] text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" /> Nowa
              </button>
            </div>
            {showAddLocation && (
              <div className="mt-2 p-3 bg-indigo-50 rounded-lg border border-indigo-200 space-y-2">
                <p className="text-xs font-medium text-indigo-700">Nowa lokalizacja</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Nazwa *"
                    {...locationForm.register('name')}
                    error={locationForm.formState.errors.name?.message}
                  />
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Typ</label>
                    <select
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      {...locationForm.register('type')}
                    >
                      {LOCATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowAddLocation(false)} className="text-xs text-gray-500 hover:text-gray-700">Anuluj</button>
                  <button
                    type="button"
                    onClick={locationForm.handleSubmit(d => addLocationMutation.mutate(d))}
                    disabled={addLocationMutation.isPending}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {addLocationMutation.isPending ? 'Zapisuję...' : 'Dodaj'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Typ urządzenia + dodaj (full width) */}
          <div className="sm:col-span-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select
                  label="Typ urządzenia"
                  placeholder="Wybierz typ (opcjonalnie)"
                  options={deviceTypes.map(t => ({ value: t.id, label: `${t.icon ? t.icon + ' ' : ''}${t.name}` }))}
                  {...register('deviceTypeId')}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowAddType(v => !v)}
                title="Dodaj nowy typ"
                className="mb-[1px] flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-[9px] text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" /> Nowy typ
              </button>
            </div>
            {showAddType && (
              <div className="mt-2 p-3 bg-indigo-50 rounded-lg border border-indigo-200 flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[160px]">
                  <Input label="Nazwa *" {...typeForm.register('name')} error={typeForm.formState.errors.name?.message} />
                </div>
                <div className="w-24">
                  <Input label="Ikona" placeholder="💻" {...typeForm.register('icon')} />
                </div>
                <div className="flex gap-2 items-center pb-1">
                  <button type="button" onClick={() => setShowAddType(false)} className="text-xs text-gray-500 hover:text-gray-700">Anuluj</button>
                  <button
                    type="button"
                    onClick={typeForm.handleSubmit(d => addTypeMutation.mutate(d))}
                    disabled={addTypeMutation.isPending}
                    className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {addTypeMutation.isPending ? '...' : 'Dodaj'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <Input label="Nazwa *" {...register('name')} error={errors.name?.message} />
          <Input label="Asset Tag" {...register('assetTag')} />
          <Select label="Status" options={STATUS_OPTIONS} {...register('status')} />
          <Select label="Krytyczność" options={CRIT_OPTIONS} {...register('criticality')} />
        </div>
      </div>

      {/* ── Przypisany pracownik ────────────────────────── */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Przypisany pracownik</p>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Szukaj po imieniu lub nazwisku..."
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          />
          <select
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            {...register('assignedUserId')}
          >
            <option value="">Brak (opcjonalnie)</option>
            {workers.map(u => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Serwis i GPS ───────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Serwis i lokalizacja</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Input label="Data montażu" type="date" {...register('installationDate')} />
          <Input
            label="Gwarancja (miesiące)"
            type="number"
            min="0"
            placeholder="np. 24"
            hint={
              device?.installationDate && device?.warrantyMonths
                ? `Wygasa: ${new Date(new Date(device.installationDate).setMonth(new Date(device.installationDate).getMonth() + device.warrantyMonths)).toLocaleDateString('pl-PL')}`
                : undefined
            }
            {...register('warrantyMonths')}
          />
        </div>
        {/* GPS */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Lokalizacja GPS</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGPS}
              disabled={gettingGPS}
              className={clsx(
                'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                gpsLat && gpsLon
                  ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              )}
            >
              {gettingGPS
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <MapPin className="h-4 w-4" />
              }
              {gpsLat && gpsLon ? 'Zaktualizuj GPS' : 'Pobierz lokalizację GPS'}
            </button>

            {gpsLat && gpsLon && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">
                  {Number(gpsLat).toFixed(6)}, {Number(gpsLon).toFixed(6)}
                </span>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${gpsLat}&mlon=${gpsLon}&zoom=16`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:text-indigo-800 text-xs underline"
                >
                  Pokaż na mapie
                </a>
                <button
                  type="button"
                  onClick={() => { setValue('gpsLat', undefined); setValue('gpsLon', undefined); }}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  Usuń
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Dane techniczne (zwijane) ───────────────────── */}
      <div className="border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => setShowTechnical(v => !v)}
          className="flex w-full items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider"
        >
          <span>Dane techniczne</span>
          {showTechnical ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showTechnical && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <Input label="Producent"        {...register('manufacturer')} />
            <Input label="Model"            {...register('model')} />
            <Input label="Numer seryjny"    {...register('serialNumber')} />
            <Input label="Hostname"         {...register('hostname')} />
            <Input label="Adres IP"         {...register('ipAddress')} />
            <Input label="Adres MAC"        {...register('macAddress')} />
            <Input label="System operacyjny" {...register('operatingSystem')} />
            <Input label="Wersja OS"        {...register('osVersion')} />
          </div>
        )}
      </div>

      {/* ── Zdalny dostęp (zwijane) ─────────────────────── */}
      <div className="border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => setShowRemote(v => !v)}
          className="flex w-full items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider"
        >
          <span>Zdalny dostęp</span>
          {showRemote ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showRemote && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <Input label="RustDesk ID"   {...register('rustdeskId')} />
            <Input label="RDP adres"     {...register('rdpAddress')} />
            <Input label="SSH adres"     {...register('sshAddress')} />
            <Input label="AnyDesk ID"    {...register('anydeskId')} />
            <Input label="TeamViewer ID" {...register('teamviewerId')} />
            <Input label="Własny link"   {...register('customRemoteLink')} />
          </div>
        )}
      </div>

      {/* ── Notatki ─────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Notatki</p>
        <div className="space-y-3">
          <Textarea label="Opis"                              {...register('description')} />
          <Textarea label="Notatki wewnętrzne"               {...register('internalNotes')} />
          <Textarea label="Notatki widoczne dla klienta"     {...register('clientVisibleNotes')} />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
        <Button type="submit" loading={mutation.isPending}>
          {device ? 'Zapisz zmiany' : 'Utwórz urządzenie'}
        </Button>
      </div>
    </form>
  );
}
