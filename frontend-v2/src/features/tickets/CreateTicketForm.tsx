import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type TicketType = 'INCIDENT' | 'REQUEST' | 'MAINTENANCE' | 'INSTALLATION' | 'COMPLAINT' | 'OTHER';

const TYPE_OPTIONS: { value: TicketType; label: string; desc: string }[] = [
  { value: 'INCIDENT', label: 'Naprawa / incydent', desc: 'coś nie działa, awaria, błąd' },
  { value: 'REQUEST', label: 'Prośba / zamówienie', desc: 'oferta, wycena, zakup sprzętu, konsultacja' },
  { value: 'MAINTENANCE', label: 'Konserwacja', desc: 'przegląd, aktualizacja, kopia' },
  { value: 'INSTALLATION', label: 'Instalacja / wdrożenie', desc: 'nowy sprzęt, konfiguracja' },
  { value: 'COMPLAINT', label: 'Reklamacja', desc: 'zgłoszenie reklamacyjne' },
  { value: 'OTHER', label: 'Inne', desc: '' },
];

// Kategorie kontekstowe — zmieniają się w zależności od typu zgłoszenia
const CATEGORIES_BY_TYPE: Record<TicketType, string[]> = {
  INCIDENT:     ['Sprzęt', 'Oprogramowanie', 'Sieć', 'Poczta', 'Dostęp', 'Serwer', 'Drukarka', 'Inne'],
  REQUEST:      ['Oferta', 'Wycena', 'Zamówienie sprzętu', 'Zamówienie licencji', 'Konsultacja', 'Szkolenie', 'Inne'],
  MAINTENANCE:  ['Przegląd', 'Aktualizacja', 'Backup', 'Optymalizacja', 'Czyszczenie', 'Inne'],
  INSTALLATION: ['Nowy sprzęt', 'Nowe oprogramowanie', 'Konfiguracja sieci', 'Migracja', 'Inne'],
  COMPLAINT:    ['Jakość usługi', 'Błędna wycena', 'Sprzęt uszkodzony', 'Inne'],
  OTHER:        ['Inne'],
};

const schema = z.object({
  type: z.enum(['INCIDENT', 'REQUEST', 'MAINTENANCE', 'INSTALLATION', 'COMPLAINT', 'OTHER']).default('INCIDENT'),
  category: z.string().max(80).optional(),
  title: z.string().min(3, 'Min. 3 znaki').max(200),
  description: z.string().min(1, 'Opisz zgłoszenie').max(10_000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  deviceId: z.string().uuid().optional().or(z.literal('')),
  locationId: z.string().uuid().optional().or(z.literal('')),
  assignedToUserId: z.string().uuid().optional().or(z.literal('')),
  requesterName: z.string().max(120).optional(),
  requesterEmail: z.string().email('Nieprawidłowy email').optional().or(z.literal('')),
  requesterPhone: z.string().max(40).optional(),
  dueAt: z.string().optional(),
});
type Form = z.infer<typeof schema>;

interface DeviceOpt { id: string; name: string; hostname: string | null; location?: { id: string; name: string } | null }
interface LocationOpt { id: string; name: string; city: string | null }
interface MemberOpt {
  id: string;
  role: string;
  status: string;
  user: { id: string; firstName: string | null; lastName: string | null; email: string };
}

export function CreateTicketForm() {
  const qc = useQueryClient();

  const devicesQ = useQuery<{ devices: DeviceOpt[] }>({
    queryKey: ['devices', 'list'],
    queryFn: async () => (await api.get('/devices', { params: { limit: 500 } })).data,
    staleTime: 60_000,
  });
  const locationsQ = useQuery<{ locations: LocationOpt[] }>({
    queryKey: ['locations', 'list'],
    queryFn: async () => (await api.get('/locations', { params: { limit: 500 } })).data,
    staleTime: 60_000,
  });
  const membersQ = useQuery<{ memberships: MemberOpt[] }>({
    queryKey: ['memberships'],
    queryFn: async () => (await api.get('/memberships')).data,
    staleTime: 60_000,
  });

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'INCIDENT', priority: 'MEDIUM' },
  });

  const type = watch('type');
  const deviceId = watch('deviceId');
  const categories = useMemo(() => CATEGORIES_BY_TYPE[type] ?? [], [type]);

  // Auto-fill location when device picked
  const devices = devicesQ.data?.devices ?? [];
  const pickedDevice = devices.find((d) => d.id === deviceId);

  const mutation = useMutation({
    mutationFn: async (data: Form) => {
      const payload: Record<string, unknown> = {
        title: data.title,
        description: data.description,
        priority: data.priority,
        type: data.type,
        source: 'MANUAL',
      };
      if (data.category) payload.category = data.category;
      if (data.deviceId) payload.deviceId = data.deviceId;
      if (data.locationId) payload.locationId = data.locationId;
      else if (pickedDevice?.location?.id) payload.locationId = pickedDevice.location.id;
      if (data.assignedToUserId) payload.assignedToUserId = data.assignedToUserId;
      if (data.requesterName) payload.requesterName = data.requesterName;
      if (data.requesterEmail) payload.requesterEmail = data.requesterEmail;
      if (data.requesterPhone) payload.requesterPhone = data.requesterPhone;
      if (data.dueAt) payload.dueAt = new Date(data.dueAt).toISOString();
      return (await api.post('/tickets', payload)).data;
    },
    onSuccess: () => {
      toast.success('Zgłoszenie utworzone');
      qc.invalidateQueries({ queryKey: ['tickets'] });
      reset({ type: 'INCIDENT', priority: 'MEDIUM' });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast.error(axiosErr.response?.data?.message ?? 'Błąd');
    },
  });

  const locations = locationsQ.data?.locations ?? [];
  const members = (membersQ.data?.memberships ?? []).filter((m) => m.status === 'ACTIVE');

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5" noValidate>
      {/* TYP ZGŁOSZENIA — klikalne karty */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-2">Typ zgłoszenia *</div>
        <div className="grid grid-cols-2 gap-2">
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => { setValue('type', t.value); setValue('category', ''); }}
              className="text-left p-2.5 rounded-[var(--r-s)] border transition-colors"
              style={{
                borderColor: type === t.value ? 'var(--pri)' : 'var(--bd)',
                background: type === t.value ? 'var(--pri-l)' : 'transparent',
              }}
            >
              <div className="text-[12px] font-semibold text-tx">{t.label}</div>
              {t.desc && <div className="text-[10px] text-tx3 mt-0.5">{t.desc}</div>}
            </button>
          ))}
        </div>
      </div>

      {/* KATEGORIA — chipsy kontekstowe */}
      {categories.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-2">Kategoria</div>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => {
              const val = watch('category');
              const selected = val === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue('category', selected ? '' : c)}
                  className="px-2.5 py-1 rounded-full text-[11px] border transition-colors"
                  style={{
                    borderColor: selected ? 'var(--pri)' : 'var(--bd)',
                    background: selected ? 'var(--pri-l)' : 'var(--sf2)',
                    color: selected ? 'var(--pri)' : 'var(--tx2)',
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* TYTUŁ + OPIS */}
      <div>
        <label className="text-[11px] font-semibold text-tx3 block mb-1">Tytuł *</label>
        <Input placeholder="np. Drukarka w księgowości nie drukuje" {...register('title')} />
        {errors.title && <p className="text-[11px] text-er mt-1">{errors.title.message}</p>}
      </div>
      <div>
        <label className="text-[11px] font-semibold text-tx3 block mb-1">Opis *</label>
        <textarea
          rows={5}
          className="w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 py-2 text-[13px] text-tx placeholder:text-tx3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pri"
          placeholder="Co się dzieje? Kiedy się zaczęło? Co już próbowaliście? Komunikaty błędów, numery oferty itp."
          {...register('description')}
        />
        {errors.description && <p className="text-[11px] text-er mt-1">{errors.description.message}</p>}
      </div>

      {/* URZĄDZENIE + LOKALIZACJA */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-tx3 block mb-1">
            Urządzenie {devicesQ.isLoading && <span className="text-tx3">(ładowanie…)</span>}
          </label>
          <select
            {...register('deviceId')}
            className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px] text-tx"
          >
            <option value="">— brak —</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}{d.hostname ? ` (${d.hostname})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-tx3 block mb-1">
            Lokalizacja {pickedDevice?.location && <span className="text-tx3">(auto: {pickedDevice.location.name})</span>}
          </label>
          <select
            {...register('locationId')}
            className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px] text-tx"
          >
            <option value="">— brak / automatycznie z urządzenia —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}{l.city ? `, ${l.city}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* PRZYPISZ + PRIORYTET + TERMIN */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-tx3 block mb-1">Przypisz do</label>
          <select
            {...register('assignedToUserId')}
            className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px] text-tx"
          >
            <option value="">— nie przypisuj —</option>
            {members.map((m) => {
              const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || m.user.email;
              return <option key={m.user.id} value={m.user.id}>{name}</option>;
            })}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-tx3 block mb-1">Priorytet</label>
          <select
            {...register('priority')}
            className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px] text-tx"
          >
            <option value="LOW">Niski</option>
            <option value="MEDIUM">Średni</option>
            <option value="HIGH">Wysoki</option>
            <option value="CRITICAL">Krytyczny</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-tx3 block mb-1">Termin</label>
          <Input type="datetime-local" {...register('dueAt')} />
        </div>
      </div>

      {/* ZGŁASZAJĄCY */}
      <div className="border-t border-bd pt-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx2 mb-2">
          Zgłaszający <span className="text-tx3 normal-case tracking-normal font-normal">(osoba kontaktowa — opcjonalne gdy nie ma konta)</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-tx3 block mb-1">Imię i nazwisko</label>
            <Input placeholder="Anna Kowalska" {...register('requesterName')} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-tx3 block mb-1">Email</label>
            <Input type="email" placeholder="anna@klient.pl" {...register('requesterEmail')} />
            {errors.requesterEmail && <p className="text-[11px] text-er mt-1">{errors.requesterEmail.message}</p>}
          </div>
          <div>
            <label className="text-[11px] font-semibold text-tx3 block mb-1">Telefon</label>
            <Input placeholder="501 234 567" {...register('requesterPhone')} />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-bd">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Tworzenie…' : 'Utwórz zgłoszenie'}
        </Button>
      </div>
    </form>
  );
}
