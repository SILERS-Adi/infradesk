import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ticketsApi } from '../../api/tickets';
import { locationsApi } from '../../api/locations';
import { devicesApi } from '../../api/devices';
import { useAuth } from '../../store/authStore';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { Button } from '../../components/ui/Button';
import { getErrorMessage } from '../../utils/helpers';

const TICKET_TYPE_OPTIONS = [
  { value: 'REQUEST', label: 'Zgłoszenie serwisowe' },
  { value: 'INCIDENT', label: 'Awaria / Incydent' },
  { value: 'REKLAMACJA', label: 'Reklamacja' },
  { value: 'MAINTENANCE', label: 'Konserwacja' },
  { value: 'OTHER', label: 'Inne' },
];

const schema = z.object({
  locationId: z.string().min(1, 'Wybierz lokalizację'),
  deviceId: z.string().optional(),
  type: z.string().min(1, 'Wybierz typ zgłoszenia'),
  title: z.string().min(3, 'Tytuł jest wymagany (min 3 znaki)'),
  description: z.string().min(10, 'Opis jest wymagany (min 10 znaków)'),
});
type FormData = z.infer<typeof schema>;

export function PortalNewRequestPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'REQUEST' },
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

  const mutation = useMutation({
    mutationFn: (data: FormData) => ticketsApi.create({
      ...data,
      clientId: user?.clientId,
      type: data.type as any,
      priority: 'MEDIUM',
      source: 'CLIENT_PORTAL',
      deviceId: data.deviceId || undefined,
    }),
    onSuccess: (ticket) => {
      toast.success('Zgłoszenie wysłane!');
      navigate(`/portal/tickets/${ticket.id}`);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="max-w-xl">
      <PageHeader title="Nowe zgłoszenie" back="/portal" />
      <Card>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <Select
            label="Typ zgłoszenia *"
            placeholder="Wybierz typ"
            options={TICKET_TYPE_OPTIONS}
            {...register('type')}
            error={errors.type?.message}
          />
          <Select
            label="Lokalizacja *"
            placeholder="Wybierz lokalizację"
            options={locations.map(l => ({ value: l.id, label: l.name }))}
            {...register('locationId')}
            error={errors.locationId?.message}
          />
          {locationId && devices.length > 0 && (
            <Select
              label="Urządzenie (opcjonalne)"
              placeholder="Wybierz urządzenie"
              options={devices.map(d => ({ value: d.id, label: `${d.name}${d.ipAddress ? ` (${d.ipAddress})` : ''}` }))}
              {...register('deviceId')}
            />
          )}
          <Input
            label="Tytuł *"
            placeholder="Krótki opis problemu"
            {...register('title')}
            error={errors.title?.message}
          />
          <Textarea
            label="Opis *"
            placeholder="Opisz szczegółowo problem lub prośbę..."
            rows={5}
            {...register('description')}
            error={errors.description?.message}
          />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => navigate(-1)} type="button">Anuluj</Button>
            <Button type="submit" loading={mutation.isPending} className="flex-1">
              Wyślij zgłoszenie
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
