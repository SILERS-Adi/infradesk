import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { usersApi } from '../../api/users';
import { clientsApi } from '../../api/clients';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../utils/helpers';
import type { User } from '../../types';

/* ─── schema ─────────────────────────────────────────────── */
const schema = z.object({
  firstName: z.string().min(1, 'Imię jest wymagane'),
  lastName:  z.string().min(1, 'Nazwisko jest wymagane'),
  email:     z.string().email('Podaj poprawny email'),
  phone:     z.string().optional(),
  userType:  z.enum(['employee', 'client']),
  clientId:  z.string().optional(),
  password:  z.string().optional(),
  isActive:  z.boolean().default(true),
  notes:     z.string().optional(),
});
type FormData = z.infer<typeof schema>;

/* ─── constants ───────────────────────────────────────────── */
const EMPLOYEE_ROLES = [
  { value: 'ADMIN',      label: 'Administrator', desc: 'Pełny dostęp do systemu' },
  { value: 'TECHNICIAN', label: 'Technik',        desc: 'Obsługa zgłoszeń i zadań' },
] as const;

const PERMISSIONS = [
  { key: 'viewAll', label: 'Wszystkie zlecenia i sprzęt',  desc: 'Widzi zgłoszenia i urządzenia całej firmy (nie tylko swoje)' },
  { key: 'orders',  label: 'Zamówienia',                   desc: 'Dostęp do modułu zamówień' },
  { key: 'billing', label: 'Rozliczenia / faktury',        desc: 'Wkrótce dostępne' },
] as const;

/* ─── types ───────────────────────────────────────────────── */
interface Props {
  user?: User;
  defaultClientId?: string;
  defaultRole?: 'ADMIN' | 'TECHNICIAN' | 'CLIENT';
  onSuccess: () => void;
  onCancel: () => void;
}

/* ─── component ───────────────────────────────────────────── */
export function UserForm({ user, defaultClientId, defaultRole, onSuccess, onCancel }: Props) {
  const isClient = user?.role === 'CLIENT' || defaultRole === 'CLIENT';

  /* employee roles */
  const initialRoles: ('ADMIN' | 'TECHNICIAN')[] = user
    ? ((user as any).roles?.filter((r: string) => r !== 'CLIENT') as ('ADMIN' | 'TECHNICIAN')[])
      || (user.role !== 'CLIENT' ? [user.role as 'ADMIN' | 'TECHNICIAN'] : [])
    : (defaultRole && defaultRole !== 'CLIENT' ? [defaultRole] : ['TECHNICIAN']);
  const [selectedRoles, setSelectedRoles] = useState<('ADMIN' | 'TECHNICIAN')[]>(initialRoles);

  /* permissions for client users */
  const existingPerms = (user as any)?.permissions ?? {};
  const [perms, setPerms] = useState({
    viewAll: existingPerms.viewAll ?? false,
    orders:  existingPerms.orders  ?? false,
    billing: existingPerms.billing ?? false,
  });

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName:  user?.lastName  ?? '',
      email:     user?.email     ?? '',
      phone:     user?.phone     ?? '',
      userType:  isClient ? 'client' : 'employee',
      clientId:  user?.clientId ?? defaultClientId ?? '',
      password:  '',
      isActive:  user?.isActive ?? true,
      notes:     (user as any)?.notes ?? '',
    },
  });

  const userType = watch('userType');

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.getAll(),
    enabled: userType === 'client',
  });

  const toggleRole = (role: 'ADMIN' | 'TECHNICIAN') =>
    setSelectedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);

  const togglePerm = (key: keyof typeof perms) =>
    setPerms(prev => ({ ...prev, [key]: !prev[key] }));

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      /* client-side guards */
      if (!user && !data.password) throw new Error('Hasło jest wymagane');
      if (userType === 'client' && !data.clientId) throw new Error('Wybierz firmę klienta');
      if (userType === 'employee' && selectedRoles.length === 0) throw new Error('Wybierz co najmniej jedną rolę');

      let role: 'ADMIN' | 'TECHNICIAN' | 'CLIENT';
      let roles: string[];

      if (userType === 'client') {
        role  = 'CLIENT';
        roles = ['CLIENT'];
      } else {
        roles = selectedRoles;
        role  = roles.includes('ADMIN') ? 'ADMIN' : 'TECHNICIAN';
      }

      const payload: Record<string, unknown> = {
        firstName: data.firstName,
        lastName:  data.lastName,
        email:     data.email,
        phone:     data.phone || undefined,
        role,
        roles,
        clientId:    userType === 'client' ? data.clientId : undefined,
        isActive:    data.isActive,
        permissions: userType === 'client' ? perms : undefined,
      };
      if (data.password) payload.password = data.password;

      return user
        ? usersApi.update(user.id, payload as any)
        : usersApi.create(payload as any);
    },
    onSuccess,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-5">

      {/* Name + contact */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Imię *"     {...register('firstName')} error={errors.firstName?.message} />
        <Input label="Nazwisko *" {...register('lastName')}  error={errors.lastName?.message}  />
        <Input label="Email *" type="email" {...register('email')} error={errors.email?.message} />
        <Input label="Telefon"  {...register('phone')} />
      </div>

      {/* User type (only when creating or when no defaultRole set) */}
      {!defaultRole && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Typ użytkownika</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'employee', label: 'Pracownik firmy',   desc: 'Technik / Administrator' },
              { value: 'client',   label: 'Użytkownik klienta', desc: 'Dostęp do portalu klienta' },
            ].map(t => (
              <label key={t.value} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                userType === t.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input type="radio" value={t.value} {...register('userType')} className="mt-0.5 text-indigo-600" />
                <div>
                  <div className="text-sm font-medium text-gray-900">{t.label}</div>
                  <div className="text-xs text-gray-500">{t.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Employee roles */}
      {userType === 'employee' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Role pracownika</label>
          <div className="grid grid-cols-2 gap-3">
            {EMPLOYEE_ROLES.map(r => (
              <label key={r.value} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                selectedRoles.includes(r.value) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input type="checkbox" checked={selectedRoles.includes(r.value)}
                  onChange={() => toggleRole(r.value)}
                  className="mt-0.5 rounded border-gray-300 text-indigo-600" />
                <div>
                  <div className="text-sm font-medium text-gray-900">{r.label}</div>
                  <div className="text-xs text-gray-500">{r.desc}</div>
                </div>
              </label>
            ))}
          </div>
          {selectedRoles.length === 0 && (
            <p className="text-xs text-red-500 mt-1">Wybierz co najmniej jedną rolę</p>
          )}
        </div>
      )}

      {/* Client: firm selector + permissions */}
      {userType === 'client' && (
        <>
          <Select
            label="Firma klienta *"
            placeholder="— Wybierz firmę —"
            options={clients.map(c => ({ value: c.id, label: c.name }))}
            {...register('clientId')}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Uprawnienia dostępu</label>
            <p className="text-xs text-gray-400 mb-3">Domyślnie użytkownik widzi tylko własne zgłoszenia</p>
            <div className="space-y-2">
              {PERMISSIONS.map(p => (
                <label key={p.key} className={`flex items-start gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${
                  perms[p.key] ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                } ${p.key === 'billing' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input type="checkbox"
                    checked={perms[p.key]}
                    onChange={() => p.key !== 'billing' && togglePerm(p.key as keyof typeof perms)}
                    disabled={p.key === 'billing'}
                    className="mt-0.5 rounded border-gray-300 text-indigo-600" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">{p.label}</div>
                    <div className="text-xs text-gray-500">{p.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Password + active */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label={user ? 'Nowe hasło (zostaw puste aby nie zmieniać)' : 'Hasło *'}
          type="password"
          {...register('password')}
          error={errors.password?.message}
        />
        <div className="flex items-center gap-2 pt-5">
          <input type="checkbox" {...register('isActive')} id="isActive"
            className="rounded border-gray-300 text-indigo-600" />
          <label htmlFor="isActive" className="text-sm text-gray-700">Aktywny</label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
        <Button type="submit" loading={mutation.isPending}
          disabled={userType === 'employee' && selectedRoles.length === 0}>
          {user ? 'Zapisz zmiany' : 'Utwórz użytkownika'}
        </Button>
      </div>
    </form>
  );
}
