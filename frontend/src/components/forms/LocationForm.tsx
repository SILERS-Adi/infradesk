import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MapPin } from 'lucide-react';
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
  latitude: z.preprocess(v => (v === '' || v === undefined ? null : Number(v)), z.number().nullable().optional()),
  longitude: z.preprocess(v => (v === '' || v === undefined ? null : Number(v)), z.number().nullable().optional()),
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
  const { register, handleSubmit, setValue, getValues, formState: { errors } } = useForm<FormData>({
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
      latitude: (location as any)?.latitude ?? null,
      longitude: (location as any)?.longitude ?? null,
    },
  });

  const [geocoding, setGeocoding] = useState(false);

  const geocodeFromAddress = async () => {
    const addressLine1 = getValues('addressLine1') || '';
    const postalCode = getValues('postalCode') || '';
    const city = getValues('city') || '';
    const query = [addressLine1, postalCode, city].filter(Boolean).join(', ');
    if (!query.trim()) {
      toast.error('Uzupełnij adres, aby pobrać współrzędne');
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=pl&email=infradesk@silers.pl`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.length > 0) {
        setValue('latitude', parseFloat(data[0].lat), { shouldDirty: true });
        setValue('longitude', parseFloat(data[0].lon), { shouldDirty: true });
        toast.success(`Współrzędne: ${parseFloat(data[0].lat).toFixed(5)}, ${parseFloat(data[0].lon).toFixed(5)}`);
      } else {
        toast.error('Nie znaleziono współrzędnych — spróbuj wpisać samo miasto');
      }
    } catch {
      toast.error('Błąd połączenia z Nominatim — spróbuj ponownie');
    } finally {
      setGeocoding(false);
    }
  };

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.getAll(),
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      // Clean empty strings to undefined so backend validation passes
      const clean: Record<string, unknown> = { ...data };
      for (const key of Object.keys(clean)) {
        if (clean[key] === '') clean[key] = undefined;
      }
      return location
        ? locationsApi.update(location.id, clean as Partial<Location>)
        : locationsApi.create(clean as Partial<Location>);
    },
    onSuccess,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const hasClient = !!defaultClientId;

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-5">
      {/* Klient — tylko gdy nie ma defaultClientId */}
      {!hasClient && (
        <Select
          label="Klient *"
          placeholder="Wybierz klienta"
          options={clients.map(c => ({ value: c.id, label: c.name }))}
          {...register('clientId')}
          error={errors.clientId?.message}
        />
      )}

      {/* Podstawowe */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Nazwa lokalizacji *" placeholder="np. Siedziba główna" {...register('name')} error={errors.name?.message} />
        <Select
          label="Typ"
          options={LOCATION_TYPES.map(t => ({ value: t, label: t }))}
          {...register('type')}
          error={errors.type?.message}
        />
      </div>

      {/* Adres */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Adres</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Input label="Ulica i numer" placeholder="ul. Przykładowa 1" {...register('addressLine1')} />
          </div>
          <CityInput
            label="Miejscowość"
            value={cityValue}
            onChange={v => { setCityValue(v); setValue('city', v); }}
            onSelect={(c, pc) => { setCityValue(c); setValue('city', c); if (pc) setValue('postalCode', pc); }}
          />
          <Input label="Kod pocztowy" placeholder="00-000" {...register('postalCode')} />
        </div>
      </div>

      {/* Osoba kontaktowa */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Osoba kontaktowa</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Imię i nazwisko" {...register('contactPersonName')} />
          <Input label="Telefon" {...register('contactPersonPhone')} />
          <Input label="Email" type="email" {...register('contactPersonEmail')} />
        </div>
      </div>

      {/* GPS */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Współrzędne GPS</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Szerokość (lat)" type="number" step="any" {...register('latitude', { valueAsNumber: true })} />
          <Input label="Długość (lng)" type="number" step="any" {...register('longitude', { valueAsNumber: true })} />
        </div>
        <button
          type="button"
          onClick={geocodeFromAddress}
          disabled={geocoding}
          className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-50"
        >
          <MapPin className="h-3.5 w-3.5" />
          {geocoding ? 'Pobieranie...' : 'Pobierz współrzędne z adresu'}
        </button>
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
