import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { locationsApi } from '../../api/locations';
import { clientsApi } from '../../api/clients';
import { Input } from '../ui/Input';
import { CityInput } from '../ui/CityInput';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../utils/helpers';
import type { Location } from '../../types';

const LOCATION_TYPES = ['OFFICE', 'WAREHOUSE', 'SHOP', 'SERVER_ROOM', 'BRANCH', 'SCHOOL', 'FACTORY', 'OTHER'];

const schema = z.object({
  clientId: z.string().min(1, 'Wybierz klienta'),
  name: z.string().min(1, 'Nazwa jest wymagana'),
  type: z.string().min(1, 'Typ jest wymagany'),
  addressLine1: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  contactPersonName: z.string().optional(),
  contactPersonPhone: z.string().optional(),
  contactPersonEmail: z.string().optional(),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  location?: Location;
  defaultClientId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function LocationForm({ location, defaultClientId, onSuccess, onCancel }: Props) {
  const [cityValue, setCityValue] = useState(location?.city ?? '');
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: location?.clientId ?? defaultClientId ?? '',
      name: location?.name ?? '',
      type: location?.type ?? 'OFFICE',
      addressLine1: location?.addressLine1 ?? '',
      postalCode: location?.postalCode ?? '',
      city: location?.city ?? '',
      country: location?.country ?? 'Polska',
      contactPersonName: location?.contactPersonName ?? '',
      contactPersonPhone: location?.contactPersonPhone ?? '',
      contactPersonEmail: location?.contactPersonEmail ?? '',
      notes: location?.notes ?? '',
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.getAll(),
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      location ? locationsApi.update(location.id, data as Partial<Location>) : locationsApi.create(data as Partial<Location>),
    onSuccess,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Klient *"
          placeholder="Wybierz klienta"
          options={clients.map(c => ({ value: c.id, label: c.name }))}
          {...register('clientId')}
          error={errors.clientId?.message}
        />
        <Input label="Nazwa *" {...register('name')} error={errors.name?.message} />
        <Select
          label="Typ *"
          options={LOCATION_TYPES.map(t => ({ value: t, label: t }))}
          {...register('type')}
          error={errors.type?.message}
        />
        <Input label="Adres" {...register('addressLine1')} />
        <CityInput
          label="Miejscowość"
          value={cityValue}
          onChange={v => { setCityValue(v); setValue('city', v); }}
          onSelect={(c, pc) => { setCityValue(c); setValue('city', c); if (pc) setValue('postalCode', pc); }}
        />
        <Input label="Kod pocztowy" {...register('postalCode')} />
        <Input label="Kraj" {...register('country')} />
      </div>

      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Osoba kontaktowa</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Imię i nazwisko" {...register('contactPersonName')} />
          <Input label="Telefon" {...register('contactPersonPhone')} />
          <Input label="Email" type="email" {...register('contactPersonEmail')} />
        </div>
      </div>

      <Textarea label="Notatki" {...register('notes')} />

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
        <Button type="submit" loading={mutation.isPending}>
          {location ? 'Zapisz zmiany' : 'Utwórz lokalizację'}
        </Button>
      </div>
    </form>
  );
}
