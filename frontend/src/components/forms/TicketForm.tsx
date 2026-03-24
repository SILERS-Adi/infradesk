import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ticketsApi } from '../../api/tickets';
import { clientsApi } from '../../api/clients';
import { locationsApi } from '../../api/locations';
import { devicesApi } from '../../api/devices';
import { usersApi } from '../../api/users';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { useAuth } from '../../store/authStore';
import { getErrorMessage } from '../../utils/helpers';
import type { Ticket } from '../../types';

const schema = z.object({
  clientId: z.string().min(1, 'Wybierz klienta'),
  locationId: z.string().min(1, 'Wybierz lokalizację'),
  deviceId: z.string().optional(),
  type: z.string(),
  priority: z.string(),
  source: z.string(),
  title: z.string().min(3, 'Tytuł jest wymagany'),
  description: z.string().min(5, 'Opis jest wymagany'),
  assignedToUserId: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  ticket?: Ticket;
  defaultClientId?: string;
  defaultDeviceId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function TicketForm({ ticket, defaultClientId, defaultDeviceId, onSuccess, onCancel }: Props) {
  const { user } = useAuth();
  const isAdminOrTech = user?.role === 'ADMIN' || user?.role === 'TECHNICIAN';

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: ticket?.clientId ?? defaultClientId ?? (user?.role === 'CLIENT' ? user.clientId : '') ?? '',
      locationId: ticket?.locationId ?? '',
      deviceId: ticket?.deviceId ?? defaultDeviceId ?? '',
      type: ticket?.type ?? 'INCIDENT',
      priority: ticket?.priority ?? 'MEDIUM',
      source: ticket?.source ?? (isAdminOrTech ? 'INTERNAL' : 'CLIENT_PORTAL'),
      title: ticket?.title ?? '',
      description: ticket?.description ?? '',
      assignedToUserId: ticket?.assignedToUserId ?? '',
    },
  });

  const clientId = watch('clientId');
  const locationId = watch('locationId');

  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.getAll(), enabled: isAdminOrTech });
  const { data: locations = [] } = useQuery({
    queryKey: ['locations', { clientId }],
    queryFn: () => locationsApi.getAll({ clientId: clientId || undefined }),
    enabled: !!clientId || !isAdminOrTech,
  });
  const { data: devices = [] } = useQuery({
    queryKey: ['devices', { locationId }],
    queryFn: () => devicesApi.getAll({ locationId }),
    enabled: !!locationId,
  });
  const { data: technicians = [] } = useQuery({
    queryKey: ['users', { role: 'TECHNICIAN' }],
    queryFn: () => usersApi.getAll({ role: 'TECHNICIAN' }),
    enabled: isAdminOrTech,
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = { ...data, deviceId: data.deviceId || undefined, assignedToUserId: data.assignedToUserId || undefined };
      return ticket ? ticketsApi.update(ticket.id, payload as Partial<Ticket>) : ticketsApi.create(payload as Partial<Ticket>);
    },
    onSuccess,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const TYPE_OPTS = [
    { value: 'INCIDENT', label: 'Incydent' },
    { value: 'REQUEST', label: 'Prośba' },
    { value: 'MAINTENANCE', label: 'Konserwacja' },
    { value: 'INSTALLATION', label: 'Instalacja' },
    { value: 'OTHER', label: 'Inne' },
  ];
  const PRIORITY_OPTS = [
    { value: 'LOW', label: 'Niski' },
    { value: 'MEDIUM', label: 'Średni' },
    { value: 'HIGH', label: 'Wysoki' },
    { value: 'CRITICAL', label: 'Krytyczny' },
  ];
  const SOURCE_OPTS = [
    { value: 'INTERNAL', label: 'Wewnętrzne' },
    { value: 'CLIENT_PORTAL', label: 'Portal klienta' },
    { value: 'PHONE', label: 'Telefon' },
    { value: 'EMAIL', label: 'Email' },
    { value: 'QR_SCAN', label: 'Skan QR' },
  ];

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {isAdminOrTech && (
          <Select label="Klient *" placeholder="Wybierz klienta" options={clients.map(c => ({ value: c.id, label: c.name }))} {...register('clientId')} error={errors.clientId?.message} />
        )}
        <Select label="Lokalizacja *" placeholder="Wybierz lokalizację" options={locations.map(l => ({ value: l.id, label: l.name }))} {...register('locationId')} error={errors.locationId?.message} />
        {devices.length > 0 && (
          <Select label="Urządzenie (opcjonalne)" placeholder="Brak" options={devices.map(d => ({ value: d.id, label: d.name }))} {...register('deviceId')} />
        )}
        {isAdminOrTech && (
          <>
            <Select label="Typ" options={TYPE_OPTS} {...register('type')} />
            <Select label="Priorytet" options={PRIORITY_OPTS} {...register('priority')} />
            <Select label="Źródło" options={SOURCE_OPTS} {...register('source')} />
            <Select label="Przypisz technika" placeholder="Nieprzypisane" options={technicians.map(t => ({ value: t.id, label: `${t.firstName} ${t.lastName}` }))} {...register('assignedToUserId')} />
          </>
        )}
      </div>
      <Input label="Tytuł *" {...register('title')} error={errors.title?.message} />
      <Textarea label="Opis *" rows={4} {...register('description')} error={errors.description?.message} />

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
        <Button type="submit" loading={mutation.isPending}>
          {ticket ? 'Zapisz zmiany' : 'Utwórz zgłoszenie'}
        </Button>
      </div>
    </form>
  );
}
