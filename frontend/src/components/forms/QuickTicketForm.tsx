import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ticketsApi } from '../../api/tickets';
import { locationsApi } from '../../api/locations';
import { devicesApi } from '../../api/devices';
import { usersApi } from '../../api/users';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import { getErrorMessage } from '../../utils/helpers';

/* ═══════════════════════════════════════════════════════════════════
   QuickTicketForm — prosty formularz kartowy do tworzenia zgłoszenia.
   Wszystko na jednej stronie, bez kroków.
   ═══════════════════════════════════════════════════════════════════ */

const schema = z.object({
  title: z.string().min(3, 'Tytuł jest wymagany (min 3 znaki)'),
  description: z.string().min(5, 'Opis jest wymagany (min 5 znaków)'),
  type: z.string().min(1, 'Wybierz typ'),
  priority: z.string().min(1, 'Wybierz priorytet'),
  locationId: z.string().optional(),
  deviceId: z.string().optional(),
  assignedToUserId: z.string().optional(),
  source: z.string().optional(),
  serviceMode: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const TYPE_OPTIONS = [
  { value: 'INCIDENT', label: 'Incydent / Awaria' },
  { value: 'REQUEST', label: 'Prośba serwisowa' },
  { value: 'MAINTENANCE', label: 'Konserwacja' },
  { value: 'INSTALLATION', label: 'Instalacja' },
  { value: 'OTHER', label: 'Inne' },
];

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: '🟢 Niski' },
  { value: 'MEDIUM', label: '🟡 Średni' },
  { value: 'HIGH', label: '🟠 Wysoki' },
  { value: 'CRITICAL', label: '🔴 Krytyczny' },
];

const SOURCE_OPTIONS = [
  { value: 'INTERNAL', label: 'Wewnętrzne' },
  { value: 'PHONE', label: 'Telefon' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'CLIENT_PORTAL', label: 'Portal klienta' },
  { value: 'IN_PERSON', label: 'Osobiście' },
];

interface QuickTicketFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function QuickTicketForm({ onSuccess, onCancel }: QuickTicketFormProps) {
  const qc = useQueryClient();
  const { isAdmin } = useWorkspaceContext();

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'INCIDENT', priority: 'MEDIUM', source: 'INTERNAL' },
  });

  const locationId = watch('locationId');

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.getAll(),
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices', { locationId }],
    queryFn: () => devicesApi.getAll({ locationId }),
    enabled: !!locationId,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users-staff'],
    queryFn: () => usersApi.getAll(),
  });
  const technicians = users.filter(u => (u as any).role !== 'CLIENT' && u.isActive);

  const mutation = useMutation({
    mutationFn: (data: FormData) => ticketsApi.create({
      ...data,
      type: data.type as any,
      priority: data.priority as any,
      source: (data.source || 'INTERNAL') as any,
      serviceMode: (data.serviceMode as any) || undefined,
      locationId: data.locationId || undefined,
      deviceId: data.deviceId || undefined,
      assignedToUserId: data.assignedToUserId || undefined,
    }),
    onSuccess: () => {
      toast.success('Zgłoszenie utworzone');
      qc.invalidateQueries({ queryKey: ['tickets-all'] });
      onSuccess();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} style={{ padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="Tytuł *" placeholder="Krótki opis problemu" {...register('title')} error={errors.title?.message} />
          <Select label="Typ *" options={TYPE_OPTIONS} {...register('type')} error={errors.type?.message} />
          <Select label="Priorytet *" options={PRIORITY_OPTIONS} {...register('priority')} error={errors.priority?.message} />
          <Select label="Źródło" options={SOURCE_OPTIONS} {...register('source')} />
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Select
            label="Lokalizacja"
            placeholder="Opcjonalnie..."
            options={locations.map(l => ({ value: l.id, label: l.name }))}
            {...register('locationId')}
          />
          {locationId && devices.length > 0 && (
            <Select
              label="Urządzenie"
              placeholder="Opcjonalnie..."
              options={devices.map(d => ({ value: d.id, label: `${d.name}${d.ipAddress ? ` (${d.ipAddress})` : ''}` }))}
              {...register('deviceId')}
            />
          )}
          {isAdmin && (
            <Select
              label="Przypisz technika"
              placeholder="Opcjonalnie..."
              options={technicians.map(t => ({ value: t.id, label: `${t.firstName} ${t.lastName}` }))}
              {...register('assignedToUserId')}
            />
          )}
          <Select
            label="Realizacja"
            placeholder="Opcjonalnie..."
            options={[{ value: 'REMOTE', label: 'Zdalna' }, { value: 'ONSITE', label: 'Na miejscu' }]}
            {...register('serviceMode')}
          />
        </div>
      </div>

      {/* Description full-width */}
      <div style={{ marginTop: 16 }}>
        <Textarea label="Opis *" placeholder="Opisz szczegółowo problem..." rows={4} {...register('description')} error={errors.description?.message} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
        <Button type="submit" loading={mutation.isPending}>Utwórz zgłoszenie</Button>
      </div>
    </form>
  );
}
