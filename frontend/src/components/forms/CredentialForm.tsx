import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Plus, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { credentialsApi } from '../../api/credentials';
import { clientsApi } from '../../api/clients';
import { locationsApi } from '../../api/locations';
import { devicesApi } from '../../api/devices';
import { usersApi } from '../../api/users';
import { accessTypesApi } from '../../api/accessTypes';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../utils/helpers';
import type { Credential } from '../../types';

const schema = z.object({
  clientId:           z.string().min(1, 'Wybierz klienta'),
  locationId:         z.string().optional(),
  deviceId:           z.string().optional(),
  userId:             z.string().optional(),
  accessTypeId:       z.string().optional(),
  name:               z.string().min(1, 'Nazwa jest wymagana'),
  username:           z.string().optional(),
  password:           z.string().optional(),
  urlOrHost:          z.string().optional(),
  port:               z.string().optional(),
  additionalData:     z.string().optional(),
  notes:              z.string().optional(),
  isSharedWithClient: z.boolean().default(false),
});

type FormData = z.infer<typeof schema>;

interface Props {
  credential?: Credential;
  defaultClientId?: string;
  defaultDeviceId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function CredentialForm({ credential, defaultClientId, defaultDeviceId, onSuccess, onCancel }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [typeSearch, setTypeSearch]     = useState('');
  const [showAddType, setShowAddType]   = useState(false);
  const [newTypeName, setNewTypeName]   = useState('');
  const [newTypeIcon, setNewTypeIcon]   = useState('🔑');
  const [newTypeColor, setNewTypeColor] = useState('#6366f1');

  const { register, handleSubmit, watch, setValue, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId:           credential?.clientId ?? defaultClientId ?? '',
      locationId:         credential?.locationId ?? '',
      deviceId:           credential?.deviceId ?? defaultDeviceId ?? '',
      userId:             credential?.userId ?? '',
      accessTypeId:       credential?.accessTypeId ?? '',
      name:               credential?.name ?? '',
      username:           credential?.username ?? '',
      password:           '',
      urlOrHost:          credential?.urlOrHost ?? '',
      port:               credential?.port?.toString() ?? '',
      additionalData:     credential?.additionalData ?? '',
      notes:              credential?.notes ?? '',
      isSharedWithClient: credential?.isSharedWithClient ?? false,
    },
  });

  const clientId          = watch('clientId');
  const isShared          = watch('isSharedWithClient');
  const selectedTypeId    = watch('accessTypeId');

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn:  () => clientsApi.getAll(),
  });
  const { data: locations = [] } = useQuery({
    queryKey: ['locations', { clientId }],
    queryFn:  () => locationsApi.getAll({ clientId }),
    enabled:  !!clientId,
  });
  const { data: devices = [] } = useQuery({
    queryKey: ['devices', { clientId }],
    queryFn:  () => devicesApi.getAll({ clientId }),
    enabled:  !!clientId,
  });
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn:  () => usersApi.getAll(),
  });
  const { data: accessTypes = [], refetch: refetchTypes } = useQuery({
    queryKey: ['access-types'],
    queryFn:  () => accessTypesApi.getAll(),
  });

  // Show admins/technicians + users linked to the selected client
  const availableUsers = allUsers.filter(
    u => u.role !== 'CLIENT' || u.clientId === clientId
  );

  const filteredTypes = accessTypes.filter(
    t => !typeSearch || t.name.toLowerCase().includes(typeSearch.toLowerCase())
  );

  const addTypeMutation = useMutation({
    mutationFn: () => accessTypesApi.create({
      name:  newTypeName.trim(),
      icon:  newTypeIcon || undefined,
      color: newTypeColor || undefined,
    }),
    onSuccess: (type) => {
      refetchTypes();
      setValue('accessTypeId', type.id);
      if (!getValues('name')) setValue('name', type.name);
      setShowAddType(false);
      setNewTypeName('');
      setNewTypeIcon('🔑');
      setNewTypeColor('#6366f1');
      toast.success('Typ dostępu dodany');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        ...data,
        port:         data.port ? parseInt(data.port) : undefined,
        locationId:   data.locationId   || undefined,
        deviceId:     data.deviceId     || undefined,
        userId:       data.userId       || undefined,
        accessTypeId: data.accessTypeId || undefined,
      };
      return credential
        ? credentialsApi.update(credential.id, payload as Partial<Credential> & { password?: string })
        : credentialsApi.create(payload as Partial<Credential> & { password: string });
    },
    onSuccess,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-6">

      {/* ── Przypisanie ─────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Przypisanie</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Klient *"
            placeholder="Wybierz klienta"
            options={clients.map(c => ({ value: c.id, label: c.name }))}
            {...register('clientId')}
            error={errors.clientId?.message}
          />
          <Select
            label="Lokalizacja"
            placeholder="Dowolna"
            options={locations.map(l => ({ value: l.id, label: l.name }))}
            {...register('locationId')}
            disabled={!clientId}
          />
          <Select
            label="Urządzenie"
            placeholder="Brak"
            options={devices.map(d => ({ value: d.id, label: d.name }))}
            {...register('deviceId')}
            disabled={!clientId}
          />
          <Select
            label="Użytkownik"
            placeholder="Brak"
            options={availableUsers.map(u => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
            {...register('userId')}
          />
        </div>
      </div>

      {/* ── Typ dostępu ─────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Typ dostępu</p>
          <button
            type="button"
            onClick={() => setShowAddType(v => !v)}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            Dodaj własny
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Szukaj typu..."
            value={typeSearch}
            onChange={e => setTypeSearch(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 pl-8 pr-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Type grid */}
        <input type="hidden" {...register('accessTypeId')} />
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
          {/* "No type" tile */}
          <button
            type="button"
            onClick={() => setValue('accessTypeId', '')}
            className={clsx(
              'flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 border-2 transition-all min-h-[60px]',
              !selectedTypeId
                ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            )}
          >
            <span className="text-lg leading-none text-gray-400">—</span>
            <span className="text-[10px] font-medium text-gray-400 leading-tight">Brak</span>
          </button>

          {filteredTypes.map(type => (
            <button
              key={type.id}
              type="button"
              onClick={() => {
                setValue('accessTypeId', type.id);
                if (!getValues('name')) setValue('name', type.name);
              }}
              className={clsx(
                'flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 border-2 transition-all min-h-[60px]',
                selectedTypeId === type.id
                  ? 'shadow-sm'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              )}
              style={
                selectedTypeId === type.id
                  ? { borderColor: type.color ?? '#6366f1', backgroundColor: (type.color ?? '#6366f1') + '12' }
                  : {}
              }
            >
              <span className="text-xl leading-none">{type.icon ?? '🔑'}</span>
              <span className="text-[10px] font-medium text-gray-700 leading-tight text-center">{type.name}</span>
            </button>
          ))}
        </div>

        {/* Add type inline form */}
        {showAddType && (
          <div className="mt-3 p-3 bg-indigo-50 rounded-xl border border-indigo-200 space-y-3">
            <p className="text-xs font-medium text-indigo-700">Nowy typ dostępu</p>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[140px]">
                <label className="text-xs font-medium text-gray-700 block mb-1">Nazwa *</label>
                <input
                  value={newTypeName}
                  onChange={e => setNewTypeName(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
                  placeholder="Nazwa typu..."
                />
              </div>
              <div className="w-20">
                <label className="text-xs font-medium text-gray-700 block mb-1">Ikona</label>
                <input
                  value={newTypeIcon}
                  onChange={e => setNewTypeIcon(e.target.value)}
                  maxLength={4}
                  className="block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-center text-xl outline-none focus:border-indigo-500"
                  placeholder="🔑"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Kolor</label>
                <input
                  type="color"
                  value={newTypeColor}
                  onChange={e => setNewTypeColor(e.target.value)}
                  className="h-9 w-12 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowAddType(false); setNewTypeName(''); }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => { if (newTypeName.trim()) addTypeMutation.mutate(); }}
                disabled={addTypeMutation.isPending || !newTypeName.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {addTypeMutation.isPending ? 'Zapisuję...' : 'Dodaj typ'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Dane dostępowe ──────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Dane dostępowe</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Nazwa *" {...register('name')} error={errors.name?.message} />
          <Input label="Login / Użytkownik" {...register('username')} />

          {/* Password with eye toggle */}
          <div className="relative">
            <Input
              label={credential ? 'Hasło (puste = bez zmiany)' : 'Hasło'}
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-8 text-gray-400 hover:text-gray-700 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <Input label="Host / URL" placeholder="192.168.1.1" {...register('urlOrHost')} />
          <Input label="Port" type="number" placeholder="22, 443, 3389..." {...register('port')} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Textarea label="Dodatkowe dane" rows={2} placeholder="Klucz SSH, token, 2FA..." {...register('additionalData')} />
          <Textarea label="Notatki" rows={2} {...register('notes')} />
        </div>
      </div>

      {/* ── Udostępnienie klientowi ──────────────────────── */}
      <label className={clsx(
        'flex items-center gap-3 cursor-pointer rounded-xl p-3.5 border transition-colors',
        isShared ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
      )}>
        <div
          onClick={() => setValue('isSharedWithClient', !isShared)}
          className={clsx(
            'relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0',
            isShared ? 'bg-green-500' : 'bg-gray-300'
          )}
        >
          <span className={clsx(
            'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
            isShared && 'translate-x-4'
          )} />
        </div>
        <input type="checkbox" {...register('isSharedWithClient')} className="sr-only" />
        <div>
          <div className="text-sm font-medium text-gray-900">Udostępnij klientowi</div>
          <div className="text-xs text-gray-500">Klient zobaczy te dane w portalu</div>
        </div>
      </label>

      <div className="flex justify-end gap-3 pt-1">
        <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
        <Button type="submit" loading={mutation.isPending}>
          {credential ? 'Zapisz zmiany' : 'Dodaj dostęp'}
        </Button>
      </div>
    </form>
  );
}
