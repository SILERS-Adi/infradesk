import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Search, ChevronRight, ChevronLeft, X, CheckCircle2, Plus, Eye, EyeOff,
} from 'lucide-react';
import { clsx } from 'clsx';
import { credentialsApi } from '../../api/credentials';
import { clientsApi } from '../../api/clients';
import { locationsApi } from '../../api/locations';
import { devicesApi } from '../../api/devices';
import { usersApi } from '../../api/users';
import { accessTypesApi } from '../../api/accessTypes';
import { useClientSearch } from '../../hooks/useClientSearch';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../utils/helpers';
import type { Client, Credential } from '../../types';

// ── Step types ─────────────────────────────────────────────────────────────────
type Step = 'client' | 'type' | 'details' | 'done';

// ── Schemas ────────────────────────────────────────────────────────────────────
const detailsSchema = z.object({
  name:               z.string().min(1, 'Nazwa jest wymagana'),
  username:           z.string().optional(),
  password:           z.string().optional(),
  urlOrHost:          z.string().optional(),
  port:               z.string().optional(),
  additionalData:     z.string().optional(),
  notes:              z.string().optional(),
  isSharedWithClient: z.boolean().default(false),
  locationId:         z.string().optional(),
  deviceId:           z.string().optional(),
  userId:             z.string().optional(),
});
type DetailsForm = z.infer<typeof detailsSchema>;

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props {
  credential?: Credential;
  defaultClientId?: string;
  defaultDeviceId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────
export function CredentialForm({ credential, defaultClientId, defaultDeviceId, onSuccess, onCancel }: Props) {
  const qc = useQueryClient();
  const isEdit = !!credential;

  // Wizard state
  const [step, setStep] = useState<Step>(
    isEdit ? 'details' : (defaultClientId ? 'type' : 'client')
  );
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string>(credential?.accessTypeId ?? '');
  const [clientSearch, setClientSearch] = useState('');
  const [typeSearch, setTypeSearch]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showAddType, setShowAddType]   = useState(false);
  const [newTypeName, setNewTypeName]   = useState('');
  const [newTypeIcon, setNewTypeIcon]   = useState('🔑');
  const [newTypeColor, setNewTypeColor] = useState('#6366f1');

  // Load default client (edit or from props)
  const defaultClientLoad = defaultClientId ?? credential?.clientId;
  const { data: loadedClient } = useQuery({
    queryKey: ['clients', defaultClientLoad],
    queryFn: () => clientsApi.getOne(defaultClientLoad!),
    enabled: !!defaultClientLoad && !selectedClient,
  });
  useEffect(() => {
    if (loadedClient && !selectedClient) setSelectedClient(loadedClient);
  }, [loadedClient]);

  const activeClientId = selectedClient?.id ?? credential?.clientId ?? '';

  // Client search
  const { clients: filteredClients, isLoading: clientsLoading } = useClientSearch(
    clientSearch,
    step === 'client',
  );

  // Access types
  const { data: accessTypes = [], refetch: refetchTypes } = useQuery({
    queryKey: ['access-types'],
    queryFn: () => accessTypesApi.getAll(),
  });

  // Dependent selects (for details step)
  const { data: locations = [] } = useQuery({
    queryKey: ['locations', { clientId: activeClientId }],
    queryFn: () => locationsApi.getAll({ clientId: activeClientId }),
    enabled: !!activeClientId && step === 'details',
  });
  const { data: devices = [] } = useQuery({
    queryKey: ['devices', { clientId: activeClientId }],
    queryFn: () => devicesApi.getAll({ clientId: activeClientId }),
    enabled: !!activeClientId && step === 'details',
  });
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll(),
    enabled: step === 'details',
  });
  const availableUsers = allUsers;

  const filteredTypes = accessTypes.filter(
    t => !typeSearch || t.name.toLowerCase().includes(typeSearch.toLowerCase())
  );

  // ── Forms ────────────────────────────────────────────────────────────────────
  const details = useForm<DetailsForm>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      name:               credential?.name               ?? '',
      username:           credential?.username           ?? '',
      password:           '',
      urlOrHost:          credential?.urlOrHost          ?? '',
      port:               credential?.port?.toString()   ?? '',
      additionalData:     credential?.additionalData     ?? '',
      notes:              credential?.notes              ?? '',
      isSharedWithClient: credential?.isSharedWithClient ?? false,
      locationId:         credential?.locationId         ?? '',
      deviceId:           credential?.deviceId           ?? defaultDeviceId ?? '',
      userId:             credential?.userId             ?? '',
    },
  });
  const isShared = details.watch('isSharedWithClient');

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const addTypeMutation = useMutation({
    mutationFn: () => accessTypesApi.create({
      name:  newTypeName.trim(),
      icon:  newTypeIcon || undefined,
      color: newTypeColor || undefined,
    }),
    onSuccess: (type) => {
      refetchTypes();
      setSelectedTypeId(type.id);
      if (!details.getValues('name')) details.setValue('name', type.name);
      setShowAddType(false);
      setNewTypeName('');
      setNewTypeIcon('🔑');
      setNewTypeColor('#6366f1');
      toast.success('Typ dostępu dodany');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const saveMutation = useMutation({
    mutationFn: (d: DetailsForm) => {
      const payload = {
        clientId:           activeClientId,
        accessTypeId:       selectedTypeId || undefined,
        locationId:         d.locationId   || undefined,
        deviceId:           d.deviceId     || undefined,
        userId:             d.userId       || undefined,
        name:               d.name,
        username:           d.username     || undefined,
        urlOrHost:          d.urlOrHost    || undefined,
        port:               d.port ? parseInt(d.port) : undefined,
        additionalData:     d.additionalData || undefined,
        notes:              d.notes          || undefined,
        isSharedWithClient: d.isSharedWithClient,
        ...(d.password ? { password: d.password } : {}),
      };
      return isEdit
        ? credentialsApi.update(credential!.id, payload as any)
        : credentialsApi.create(payload as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credentials'] });
      toast.success(isEdit ? 'Dane dostępowe zaktualizowane' : 'Dane dostępowe dodane');
      setStep('done');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // ── Step dots ─────────────────────────────────────────────────────────────────
  const STEPS: Step[] = isEdit ? ['details'] : ['client', 'type', 'details'];
  const stepIdx = STEPS.indexOf(step === 'done' ? 'details' : step);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          {step !== 'client' && step !== 'done' && !isEdit && (
            <button
              onClick={() => setStep(step === 'details' ? 'type' : 'client')}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? 'Edytuj dane dostępowe' : 'Nowe dane dostępowe'}
            </h2>
            {selectedClient && step !== 'done' && (
              <p className="text-xs text-gray-500">{selectedClient.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isEdit && step !== 'done' && (
            <div className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <div key={s} className={clsx(
                  'h-1.5 rounded-full transition-all',
                  i === stepIdx ? 'w-5 bg-indigo-600' : i < stepIdx ? 'w-1.5 bg-indigo-300' : 'w-1.5 bg-gray-200'
                )} />
              ))}
            </div>
          )}
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">

        {/* ── DONE ──────────────────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">Zapisano!</p>
              <p className="text-sm text-gray-500 mt-1">Dane dostępowe zostały {isEdit ? 'zaktualizowane' : 'dodane'}.</p>
            </div>
            <button
              onClick={onSuccess}
              className="mt-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Gotowe
            </button>
          </div>
        )}

        {/* ── STEP 1: CLIENT ────────────────────────────────────────────────────── */}
        {step === 'client' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700 mb-3">Dla którego klienta?</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                autoFocus
                placeholder="Szukaj firmy lub NIP..."
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {filteredClients.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedClient(c); setStep('type'); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left"
                >
                  {c.logoUrl
                    ? <img src={c.logoUrl} alt={c.name} className="w-9 h-9 rounded-lg object-contain bg-gray-50 border border-gray-100 flex-shrink-0" />
                    : <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center flex-shrink-0">{c.name.slice(0,2).toUpperCase()}</div>
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

        {/* ── STEP 2: ACCESS TYPE ───────────────────────────────────────────────── */}
        {step === 'type' && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-gray-700">Typ dostępu</p>

            {/* Search + add */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  placeholder="Szukaj typu..."
                  value={typeSearch}
                  onChange={e => setTypeSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowAddType(v => !v)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl border border-indigo-200 text-indigo-600 text-sm font-medium hover:bg-indigo-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Nowy
              </button>
            </div>

            {/* Add type inline */}
            {showAddType && (
              <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 space-y-3">
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
                  <button type="button" onClick={() => { setShowAddType(false); setNewTypeName(''); }}
                    className="text-xs text-gray-500 hover:text-gray-700">Anuluj</button>
                  <button type="button"
                    onClick={() => { if (newTypeName.trim()) addTypeMutation.mutate(); }}
                    disabled={addTypeMutation.isPending || !newTypeName.trim()}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                    {addTypeMutation.isPending ? 'Zapisuję...' : 'Dodaj typ'}
                  </button>
                </div>
              </div>
            )}

            {/* Type grid */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <button type="button"
                onClick={() => setSelectedTypeId('')}
                className={clsx(
                  'flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 border-2 transition-all min-h-[64px]',
                  !selectedTypeId ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 bg-white'
                )}
              >
                <span className="text-lg leading-none text-gray-400">—</span>
                <span className="text-[10px] font-medium text-gray-400">Brak</span>
              </button>
              {filteredTypes.map(type => (
                <button key={type.id} type="button"
                  onClick={() => {
                    setSelectedTypeId(type.id);
                    if (!details.getValues('name')) details.setValue('name', type.name);
                  }}
                  className={clsx(
                    'flex flex-col items-center justify-center gap-1 rounded-xl p-2.5 border-2 transition-all min-h-[64px]',
                    selectedTypeId === type.id ? 'shadow-sm' : 'border-gray-200 hover:border-gray-300 bg-white'
                  )}
                  style={selectedTypeId === type.id
                    ? { borderColor: type.color ?? '#6366f1', backgroundColor: (type.color ?? '#6366f1') + '12' }
                    : {}}
                >
                  <span className="text-xl leading-none">{type.icon ?? '🔑'}</span>
                  <span className="text-[10px] font-medium text-gray-700 text-center leading-tight">{type.name}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep('details')}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Dalej
            </button>
          </div>
        )}

        {/* ── STEP 3: DETAILS ───────────────────────────────────────────────────── */}
        {step === 'details' && (
          <form
            id="cred-details-form"
            onSubmit={details.handleSubmit(d => saveMutation.mutate(d))}
            className="space-y-5"
          >
            {/* Basic credentials */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Dane logowania</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Nazwa *"
                  {...details.register('name')}
                  error={details.formState.errors.name?.message}
                />
                <Input label="Login / Użytkownik" {...details.register('username')} />
                <div className="relative">
                  <Input
                    label={isEdit ? 'Hasło (puste = bez zmiany)' : 'Hasło'}
                    type={showPassword ? 'text' : 'password'}
                    {...details.register('password')}
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
                <Input label="Host / URL" placeholder="192.168.1.1" {...details.register('urlOrHost')} />
                <Input label="Port" type="number" placeholder="22, 443, 3389..." {...details.register('port')} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <Textarea label="Dodatkowe dane" rows={2} placeholder="Klucz SSH, token, 2FA..." {...details.register('additionalData')} />
                <Textarea label="Notatki" rows={2} {...details.register('notes')} />
              </div>
            </div>

            {/* Assignment */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Przypisanie (opcjonalne)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Lokalizacja</label>
                  <select
                    {...details.register('locationId')}
                    className="block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="">— Dowolna —</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Urządzenie</label>
                  <select
                    {...details.register('deviceId')}
                    className="block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="">— Brak —</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Użytkownik</label>
                  <select
                    {...details.register('userId')}
                    className="block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="">— Brak —</option>
                    {availableUsers.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Shared toggle */}
            <label className={clsx(
              'flex items-center gap-3 cursor-pointer rounded-xl p-3.5 border transition-colors',
              isShared ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
            )}>
              <div
                onClick={() => details.setValue('isSharedWithClient', !isShared)}
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
              <input type="checkbox" {...details.register('isSharedWithClient')} className="sr-only" />
              <div>
                <div className="text-sm font-medium text-gray-900">Udostępnij klientowi</div>
                <div className="text-xs text-gray-500">Klient zobaczy te dane w portalu</div>
              </div>
            </label>
          </form>
        )}
      </div>

      {/* Footer */}
      {step === 'details' && (
        <div className="px-5 pb-4 pt-3 border-t border-gray-100 flex-shrink-0 flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
          <Button
            type="submit"
            form="cred-details-form"
            loading={saveMutation.isPending}
          >
            {isEdit ? 'Zapisz zmiany' : 'Dodaj dostęp'}
          </Button>
        </div>
      )}
    </div>
  );
}
