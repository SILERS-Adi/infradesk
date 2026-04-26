import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { ticketsApi } from '../../api/tickets';
import { operatorApi } from '../../api/operator';
import { usersApi } from '../../api/users';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../utils/helpers';

/* ═══════════════════════════════════════════════════════════════════
   MspTicketForm — formularz tworzenia zgłoszenia W IMIENIU klienta.
   Krok 0: wybór firmy klienta. Po wyborze pojawiają się lokalizacje
   i urządzenia tej firmy (przez /operator/locations + /operator/devices).
   Submit wysyła clientWorkspaceId do POST /tickets — backend tworzy
   ticket w workspace klienta z providerWorkspaceId = MSP.
   ═══════════════════════════════════════════════════════════════════ */

const schema = z.object({
  clientWorkspaceId: z.string().min(1, 'Wybierz firmę klienta'),
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
  { value: 'INTERNAL', label: 'Wewnętrzne (MSP)' },
  { value: 'PHONE', label: 'Telefon' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'IN_PERSON', label: 'Osobiście' },
];

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export function MspTicketForm({ onSuccess, onCancel }: Props) {
  const qc = useQueryClient();

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'INCIDENT', priority: 'MEDIUM', source: 'INTERNAL' },
  });

  const clientWorkspaceId = watch('clientWorkspaceId');
  const locationId = watch('locationId');

  // Lista klientów MSP
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ['operator-clients'],
    queryFn: () => operatorApi.getClients(),
  });

  // Lokalizacje wybranego klienta
  const { data: locations = [] } = useQuery({
    queryKey: ['operator-locations', clientWorkspaceId],
    queryFn: () => operatorApi.getLocations({ clientWorkspaceId }),
    enabled: !!clientWorkspaceId,
  });

  // Urządzenia wybranego klienta (opcjonalnie filtrowane po lokalizacji)
  const { data: allDevices = [] } = useQuery({
    queryKey: ['operator-devices', clientWorkspaceId],
    queryFn: () => operatorApi.getDevices({ clientWorkspaceId }),
    enabled: !!clientWorkspaceId,
  });
  const devices = useMemo(
    () => locationId ? allDevices.filter((d: any) => d.locationId === locationId) : allDevices,
    [allDevices, locationId],
  );

  // Technicy MSP (z własnego workspace, nie klienta)
  const { data: users = [] } = useQuery({
    queryKey: ['users-staff'],
    queryFn: () => usersApi.getAll(),
  });
  const technicians = users.filter(u => (u as any).role !== 'CLIENT' && u.isActive);

  const selectedClient = clients.find(c => c.id === clientWorkspaceId);

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
    } as any),
    onSuccess: () => {
      toast.success(`Zgłoszenie utworzone dla ${selectedClient?.name ?? 'klienta'}`);
      qc.invalidateQueries({ queryKey: ['tickets-all'] });
      qc.invalidateQueries({ queryKey: ['operator', 'tickets'] });
      onSuccess();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Reset zależnych pól przy zmianie klienta
  const onClientChange = (val: string) => {
    setValue('clientWorkspaceId', val);
    setValue('locationId', '');
    setValue('deviceId', '');
  };

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} style={{ padding: 24 }}>
      {/* ── Step 0: Wybór klienta ──────────────────────────────── */}
      <div style={{
        padding: 16,
        marginBottom: 20,
        borderRadius: 14,
        background: clientWorkspaceId
          ? 'linear-gradient(135deg, rgba(91,95,239,0.08), rgba(139,92,246,0.04))'
          : 'rgba(245,158,11,0.06)',
        border: `1px solid ${clientWorkspaceId ? 'rgba(139,92,246,0.2)' : 'rgba(245,158,11,0.2)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: clientWorkspaceId ? '#6366F1' : '#F59E0B',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Building2 size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>
              Krok 1 — Dla którego klienta tworzysz zgłoszenie?
            </div>
            <div style={{ fontSize: 11, color: 'var(--tm)' }}>
              Zgłoszenie zostanie utworzone w workspace tej firmy. Twoje Centrum IT będzie obsługą.
            </div>
          </div>
        </div>
        <Select
          label="Firma klienta *"
          placeholder={clientsLoading ? 'Ładowanie...' : 'Wybierz firmę z listy'}
          options={clients.map(c => ({
            value: c.id,
            label: c.city ? `${c.name} (${c.city})` : c.name,
          }))}
          value={clientWorkspaceId ?? ''}
          onChange={e => onClientChange(e.target.value)}
          error={errors.clientWorkspaceId?.message}
        />
      </div>

      {/* ── Step 1+: Reszta formularza (disabled bez klienta) ── */}
      <div style={{ opacity: clientWorkspaceId ? 1 : 0.4, pointerEvents: clientWorkspaceId ? 'auto' : 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input label="Tytuł *" placeholder="Krótki opis problemu" {...register('title')} error={errors.title?.message} />
            <Select label="Typ *" options={TYPE_OPTIONS} {...register('type')} error={errors.type?.message} />
            <Select label="Priorytet *" options={PRIORITY_OPTIONS} {...register('priority')} error={errors.priority?.message} />
            <Select label="Źródło zgłoszenia" options={SOURCE_OPTIONS} {...register('source')} />
          </div>

          {/* Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Select
              label="Lokalizacja klienta"
              placeholder={clientWorkspaceId && locations.length === 0 ? 'Brak lokalizacji u klienta' : 'Opcjonalnie...'}
              options={locations.map((l: any) => ({ value: l.id, label: l.name }))}
              {...register('locationId')}
            />
            <Select
              label="Urządzenie klienta"
              placeholder={!locationId ? 'Najpierw wybierz lokalizację (opcjonalne)' : devices.length === 0 ? 'Brak urządzeń' : 'Opcjonalnie...'}
              options={devices.map((d: any) => ({
                value: d.id,
                label: `${d.name}${d.ipAddress ? ` (${d.ipAddress})` : ''}`,
              }))}
              {...register('deviceId')}
            />
            <Select
              label="Przypisz technika MSP"
              placeholder="Opcjonalnie..."
              options={technicians.map(t => ({ value: t.id, label: `${t.firstName} ${t.lastName}` }))}
              {...register('assignedToUserId')}
            />
            <Select
              label="Realizacja"
              placeholder="Opcjonalnie..."
              options={[{ value: 'REMOTE', label: 'Zdalna' }, { value: 'ONSITE', label: 'Na miejscu' }]}
              {...register('serviceMode')}
            />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <Textarea label="Opis *" placeholder="Opisz szczegółowo problem, kontekst, kroki reprodukcji..." rows={4} {...register('description')} error={errors.description?.message} />
        </div>

        {clientWorkspaceId && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 12, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
            fontSize: 11, color: 'var(--tm)',
          }}>
            <Info size={14} color="#818CF8" style={{ flexShrink: 0 }} />
            <span>
              Zgłoszenie powstanie w workspace <strong style={{ color: 'var(--t)' }}>{selectedClient?.name}</strong>.
              Klient zobaczy je w swoim portalu, a Ty obsługujesz je z poziomu Operator → Zgłoszenia.
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
        <Button type="submit" loading={mutation.isPending} disabled={!clientWorkspaceId}>
          Utwórz zgłoszenie
        </Button>
      </div>
    </form>
  );
}
