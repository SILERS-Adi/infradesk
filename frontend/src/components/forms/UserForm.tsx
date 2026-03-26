import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ChevronLeft, X, CheckCircle2, Eye, EyeOff, Search, Upload, Camera,
} from 'lucide-react';
import { clsx } from 'clsx';
import { usersApi } from '../../api/users';
import { useClientSearch } from '../../hooks/useClientSearch';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../utils/helpers';
import type { User } from '../../types';
import apiClient from '../../api/client';

// ── Step types ─────────────────────────────────────────────────────────────────
type Step = 'type' | 'details' | 'role' | 'done';
type UserKind = 'employee' | 'client';

// ── Constants ──────────────────────────────────────────────────────────────────
const EMPLOYEE_ROLES = [
  { value: 'ADMIN',      label: 'Administrator', desc: 'Pełny dostęp do systemu', icon: '🛡️' },
  { value: 'TECHNICIAN', label: 'Technik',        desc: 'Obsługa zgłoszeń i zadań', icon: '🔧' },
] as const;

const PERMISSIONS: { key: 'viewAll' | 'orders' | 'billing'; label: string; desc: string; disabled?: boolean }[] = [
  { key: 'viewAll', label: 'Wszystkie zlecenia i sprzęt',  desc: 'Widzi zgłoszenia i urządzenia całej firmy' },
  { key: 'orders',  label: 'Zamówienia',                   desc: 'Dostęp do modułu zamówień' },
  { key: 'billing', label: 'Rozliczenia / faktury',        desc: 'Wkrótce dostępne', disabled: true },
];

// ── Schemas ────────────────────────────────────────────────────────────────────
const detailsSchema = z.object({
  firstName:   z.string().min(1, 'Imię jest wymagane'),
  lastName:    z.string().min(1, 'Nazwisko jest wymagane'),
  email:       z.string().email('Podaj poprawny email'),
  phone:       z.string().optional(),
  password:    z.string().optional(),
  isActive:    z.boolean().default(true),
  downloadPin: z.string().max(50).optional(),
});
type DetailsForm = z.infer<typeof detailsSchema>;

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props {
  user?: User;
  defaultClientId?: string;
  defaultRole?: 'ADMIN' | 'TECHNICIAN' | 'CLIENT';
  onSuccess: () => void;
  onCancel: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────
export function UserForm({ user, defaultClientId, defaultRole, onSuccess, onCancel }: Props) {
  const qc = useQueryClient();
  const isEdit = !!user;

  const isClientUser = user?.role === 'CLIENT' || defaultRole === 'CLIENT';
  const initialKind: UserKind = isClientUser ? 'client' : 'employee';

  // When adding from within a client page — show everything on one page, no wizard
  const inlineMode = !!(defaultClientId && defaultRole === 'CLIENT' && !isEdit);

  // Wizard state
  const firstStep: Step = isEdit ? 'details' : (defaultRole ? 'details' : 'type');
  const [step, setStep]     = useState<Step>(inlineMode ? 'details' : firstStep);
  const [kind, setKind]     = useState<UserKind>(initialKind);

  // Employee roles
  const initRoles = user
    ? ((user as any).roles?.filter((r: string) => r !== 'CLIENT') as ('ADMIN' | 'TECHNICIAN')[])
      || (user.role !== 'CLIENT' ? [user.role as 'ADMIN' | 'TECHNICIAN'] : [])
    : (defaultRole && defaultRole !== 'CLIENT' ? [defaultRole] : ['TECHNICIAN' as const]);
  const [selectedRoles, setSelectedRoles] = useState<('ADMIN' | 'TECHNICIAN')[]>(initRoles);

  // Client permissions
  const existingPerms = (user as any)?.permissions ?? {};
  const [perms, setPerms] = useState({
    viewAll: existingPerms.viewAll ?? false,
    orders:  existingPerms.orders  ?? false,
    billing: existingPerms.billing ?? false,
  });

  // Client firm selection (wizard)
  const [selectedClientId, setSelectedClientId] = useState<string>(
    user?.clientId ?? defaultClientId ?? ''
  );
  const [clientSearch, setClientSearch] = useState('');

  const { clients: filteredClients, isLoading: clientsLoading } = useClientSearch(
    clientSearch,
    step === 'role' && kind === 'client',
  );

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string>(user?.avatarUrl ?? '');
  const [uploading, setUploading] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await apiClient.post<{ url: string }>('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setAvatarUrl(data.url);
      toast.success('Zdjęcie przesłane');
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setUploading(false); }
  };

  // Show password
  const [showPassword, setShowPassword] = useState(false);

  // Details form
  const detailsForm = useForm<DetailsForm>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      firstName:   user?.firstName ?? '',
      lastName:    user?.lastName  ?? '',
      email:       user?.email     ?? '',
      phone:       user?.phone     ?? '',
      password:    '',
      isActive:    user?.isActive  ?? true,
      downloadPin: user?.downloadPin ?? '',
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (d: DetailsForm) => {
      if (!isEdit && !d.password) throw new Error('Hasło jest wymagane');
      if (kind === 'client' && !selectedClientId) throw new Error('Wybierz firmę klienta');
      if (kind === 'employee' && selectedRoles.length === 0) throw new Error('Wybierz co najmniej jedną rolę');

      let role: 'ADMIN' | 'TECHNICIAN' | 'CLIENT';
      let roles: string[];
      if (kind === 'client') {
        role  = 'CLIENT';
        roles = ['CLIENT'];
      } else {
        roles = selectedRoles;
        role  = roles.includes('ADMIN') ? 'ADMIN' : 'TECHNICIAN';
      }

      const payload: Record<string, unknown> = {
        firstName:   d.firstName,
        lastName:    d.lastName,
        email:       d.email,
        phone:       d.phone || undefined,
        role,
        roles,
        clientId:    kind === 'client' ? selectedClientId : undefined,
        isActive:    d.isActive,
        permissions: kind === 'client' ? perms : undefined,
        downloadPin: d.downloadPin || null,
        avatarUrl:   avatarUrl || null,
      };
      if (d.password) payload.password = d.password;

      return isEdit
        ? usersApi.update(user!.id, payload as any)
        : usersApi.create(payload as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(isEdit ? 'Użytkownik zaktualizowany' : 'Użytkownik utworzony');
      setStep('done');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // ── Step dots ─────────────────────────────────────────────────────────────────
  const STEPS: Step[] = inlineMode
    ? ['details']
    : isEdit
      ? ['details', 'role']
      : (defaultRole ? ['details', 'role'] : ['type', 'details', 'role']);
  const stepIdx = STEPS.indexOf(step === 'done' ? 'role' : step);

  const goBack = () => {
    if (step === 'details') setStep(defaultRole || isEdit ? 'details' : 'type');
    else if (step === 'role') setStep('details');
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          {step === 'role' && (
            <button onClick={() => setStep('details')}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {step === 'details' && !isEdit && !defaultRole && (
            <button onClick={() => setStep('type')}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? 'Edytuj użytkownika' : 'Nowy użytkownik'}
            </h2>
            {step !== 'done' && (
              <p className="text-xs text-gray-500">
                {kind === 'employee' ? 'Pracownik firmy' : 'Użytkownik klienta'}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {step !== 'done' && (
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
              <p className="text-lg font-semibold text-gray-900">
                {isEdit ? 'Zaktualizowano!' : 'Użytkownik utworzony!'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {detailsForm.getValues('firstName')} {detailsForm.getValues('lastName')}
              </p>
            </div>
            <button onClick={onSuccess}
              className="mt-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
              Gotowe
            </button>
          </div>
        )}

        {/* ── STEP 1: TYPE ──────────────────────────────────────────────────────── */}
        {step === 'type' && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-gray-700">Rodzaj użytkownika</p>
            <div className="grid grid-cols-1 gap-3">
              {([
                { value: 'employee' as UserKind, label: 'Pracownik firmy',     desc: 'Technik lub Administrator z dostępem do panelu', icon: '👷' },
                { value: 'client'   as UserKind, label: 'Użytkownik klienta',  desc: 'Dostęp do portalu klienta',                     icon: '🏢' },
              ]).map(t => (
                <button
                  key={t.value}
                  onClick={() => { setKind(t.value); setStep('details'); }}
                  className="flex items-start gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left"
                >
                  <span className="text-2xl flex-shrink-0">{t.icon}</span>
                  <div>
                    <div className="font-semibold text-gray-900">{t.label}</div>
                    <div className="text-sm text-gray-500 mt-0.5">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 2: DETAILS ───────────────────────────────────────────────────── */}
        {step === 'details' && (
          <form id="user-details-form"
            onSubmit={detailsForm.handleSubmit(d => {
              if (inlineMode) saveMutation.mutate(d);
              else setStep('role');
            })}
            className="space-y-4"
          >
            {/* Avatar upload */}
            <div className="flex items-center gap-4">
              <div className="relative">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-16 h-16 rounded-full object-cover"
                    style={{ border: '2px solid rgba(255,255,255,0.1)' }} />
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '2px dashed rgba(255,255,255,0.1)' }}>
                    <Camera className="h-6 w-6" style={{ color: 'rgba(255,255,255,0.25)' }} />
                  </div>
                )}
                <label className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
                  style={{ background: 'linear-gradient(145deg, #6D28D9, #2563EB)' }}>
                  <Upload className="h-3.5 w-3.5 text-white" />
                  <input type="file" accept="image/*" className="sr-only" onChange={handleAvatarUpload} disabled={uploading} />
                </label>
              </div>
              <div>
                <p className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {avatarUrl ? 'Zmień zdjęcie' : 'Dodaj zdjęcie'}
                </p>
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>JPG, PNG — max 5 MB</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Imię *"     {...detailsForm.register('firstName')} error={detailsForm.formState.errors.firstName?.message} />
              <Input label="Nazwisko *" {...detailsForm.register('lastName')}  error={detailsForm.formState.errors.lastName?.message}  />
              <Input label="Email *" type="email" {...detailsForm.register('email')} error={detailsForm.formState.errors.email?.message} />
              <Input label="Telefon" {...detailsForm.register('phone')} />
              <div className="relative">
                <Input
                  label={isEdit ? 'Nowe hasło (puste = bez zmiany)' : 'Hasło *'}
                  type={showPassword ? 'text' : 'password'}
                  {...detailsForm.register('password')}
                />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-8 text-gray-400 hover:text-gray-700 transition-colors" tabIndex={-1}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="isActive" {...detailsForm.register('isActive')}
                  className="rounded border-gray-300 text-indigo-600" />
                <label htmlFor="isActive" className="text-sm text-gray-700">Konto aktywne</label>
              </div>
              <Input
                label="PIN do pobrań (opcjonalny)"
                placeholder="np. SECRET123"
                {...detailsForm.register('downloadPin')}
                error={detailsForm.formState.errors.downloadPin?.message}
              />
            </div>

            {/* ── Inline mode: permissions directly below fields ─────────── */}
            {inlineMode && (
              <div className="border-t border-gray-100 pt-4 mt-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Uprawnienia</p>
                <p className="text-xs text-gray-400 mb-3">Domyślnie użytkownik widzi tylko własne zgłoszenia</p>
                <div className="space-y-2">
                  {PERMISSIONS.map(p => (
                    <label key={p.key} className={clsx(
                      'flex items-start gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all',
                      perms[p.key] ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300',
                      p.disabled && 'opacity-50 cursor-not-allowed'
                    )}>
                      <input type="checkbox"
                        checked={perms[p.key]}
                        onChange={() => !p.disabled && setPerms(prev => ({ ...prev, [p.key]: !prev[p.key] }))}
                        disabled={p.disabled}
                        className="mt-0.5 rounded border-gray-300 text-indigo-600" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{p.label}</div>
                        <div className="text-xs text-gray-500">{p.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}

        {/* ── STEP 3: ROLE / COMPANY ────────────────────────────────────────────── */}
        {step === 'role' && kind === 'employee' && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-gray-700">Role pracownika</p>
            <div className="grid grid-cols-1 gap-3">
              {EMPLOYEE_ROLES.map(r => (
                <button key={r.value} type="button"
                  onClick={() => setSelectedRoles(prev =>
                    prev.includes(r.value) ? prev.filter(x => x !== r.value) : [...prev, r.value]
                  )}
                  className={clsx(
                    'flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-colors',
                    selectedRoles.includes(r.value)
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  )}
                >
                  <span className="text-2xl flex-shrink-0">{r.icon}</span>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{r.label}</div>
                    <div className="text-sm text-gray-500">{r.desc}</div>
                  </div>
                  <div className={clsx(
                    'w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0',
                    selectedRoles.includes(r.value) ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
                  )}>
                    {selectedRoles.includes(r.value) && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {selectedRoles.length === 0 && (
              <p className="text-xs text-red-500">Wybierz co najmniej jedną rolę</p>
            )}
          </div>
        )}

        {step === 'role' && kind === 'client' && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-gray-700">Firma klienta</p>

            {/* If defaultClientId, show it as selected; otherwise let them search */}
            {defaultClientId && !selectedClientId && (
              <p className="text-sm text-gray-500">Firma zostanie przypisana automatycznie.</p>
            )}

            {!defaultClientId && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    placeholder="Szukaj firmy..."
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>

                {selectedClientId && (
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between">
                    <p className="text-sm font-medium text-indigo-700">
                      {filteredClients.find(c => c.id === selectedClientId)?.name ?? 'Wybrana firma'}
                    </p>
                    <button onClick={() => setSelectedClientId('')}
                      className="text-indigo-400 hover:text-indigo-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {filteredClients.map(c => (
                    <button key={c.id}
                      onClick={() => setSelectedClientId(c.id)}
                      className={clsx(
                        'w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left',
                        selectedClientId === c.id
                          ? 'border-indigo-400 bg-indigo-50'
                          : 'border-gray-100 hover:border-indigo-200 hover:bg-indigo-50'
                      )}
                    >
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                        {c.name.slice(0,2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm truncate">{c.name}</div>
                        {c.city && <div className="text-xs text-gray-400">{c.city}</div>}
                      </div>
                    </button>
                  ))}
                  {clientsLoading && <p className="text-sm text-gray-400 text-center py-4">Wyszukiwanie...</p>}
                  {!clientsLoading && filteredClients.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">Brak wyników</p>
                  )}
                </div>
              </>
            )}

            {/* Permissions */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Uprawnienia</p>
              <p className="text-xs text-gray-400 mb-3">Domyślnie użytkownik widzi tylko własne zgłoszenia</p>
              <div className="space-y-2">
                {PERMISSIONS.map(p => (
                  <label key={p.key} className={clsx(
                    'flex items-start gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all',
                    perms[p.key] ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300',
                    p.disabled && 'opacity-50 cursor-not-allowed'
                  )}>
                    <input type="checkbox"
                      checked={perms[p.key]}
                      onChange={() => !p.disabled && setPerms(prev => ({ ...prev, [p.key]: !prev[p.key] }))}
                      disabled={p.disabled}
                      className="mt-0.5 rounded border-gray-300 text-indigo-600" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{p.label}</div>
                      <div className="text-xs text-gray-500">{p.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {step === 'details' && (
        <div className="px-5 pb-4 pt-3 border-t border-gray-100 flex-shrink-0 flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
          <Button type="submit" form="user-details-form" loading={inlineMode ? saveMutation.isPending : false}>
            {inlineMode ? 'Utwórz użytkownika' : 'Dalej'}
          </Button>
        </div>
      )}
      {step === 'role' && (
        <div className="px-5 pb-4 pt-3 border-t border-gray-100 flex-shrink-0 flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
          <Button
            onClick={() => detailsForm.handleSubmit(d => saveMutation.mutate(d))()}
            loading={saveMutation.isPending}
            disabled={kind === 'employee' ? selectedRoles.length === 0 : !selectedClientId && !defaultClientId}
          >
            {isEdit ? 'Zapisz zmiany' : 'Utwórz użytkownika'}
          </Button>
        </div>
      )}
    </div>
  );
}
