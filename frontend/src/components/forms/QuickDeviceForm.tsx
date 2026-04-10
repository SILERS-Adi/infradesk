import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { devicesApi } from '../../api/devices';
import { locationsApi } from '../../api/locations';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../utils/helpers';

/* ═══════════════════════════════════════════════════════════════════
   QuickDeviceForm — prosty formularz kartowy do dodawania urządzenia.
   Wszystko na jednej stronie, bez kroków.
   ═══════════════════════════════════════════════════════════════════ */

const schema = z.object({
  name: z.string().min(2, 'Nazwa jest wymagana (min 2 znaki)'),
  locationId: z.string().min(1, 'Wybierz lokalizację'),
  assetTag: z.string().optional(),
  status: z.string().optional(),
  criticality: z.string().optional(),
  type: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  hostname: z.string().optional(),
  ipAddress: z.string().optional(),
  macAddress: z.string().optional(),
  os: z.string().optional(),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Aktywne' },
  { value: 'INACTIVE', label: 'Nieaktywne' },
  { value: 'BROKEN', label: 'Zepsute' },
  { value: 'RETIRED', label: 'Wycofane' },
];

const CRITICALITY_OPTIONS = [
  { value: 'LOW', label: 'Niska' },
  { value: 'MEDIUM', label: 'Średnia' },
  { value: 'HIGH', label: 'Wysoka' },
  { value: 'CRITICAL', label: 'Krytyczna' },
];

const TYPE_OPTIONS = [
  { value: 'COMPUTER', label: 'Komputer' },
  { value: 'LAPTOP', label: 'Laptop' },
  { value: 'SERVER', label: 'Serwer' },
  { value: 'PRINTER', label: 'Drukarka' },
  { value: 'NETWORK', label: 'Urządzenie sieciowe' },
  { value: 'PHONE', label: 'Telefon' },
  { value: 'MONITOR', label: 'Monitor' },
  { value: 'OTHER', label: 'Inne' },
];

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export function QuickDeviceForm({ onSuccess, onCancel }: Props) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'ACTIVE', criticality: 'MEDIUM' },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.getAll(),
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'string' && v.trim()) payload[k] = v.trim();
      }
      return devicesApi.create(payload as any);
    },
    onSuccess: () => {
      toast.success('Urządzenie dodane');
      qc.invalidateQueries({ queryKey: ['devices'] });
      onSuccess();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} style={{ padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left — podstawowe */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--tm)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
          }}>Podstawowe</div>
          <Input label="Nazwa urządzenia *" placeholder="np. PC-BIURO-001" {...register('name')} error={errors.name?.message} />
          <Select label="Lokalizacja *" placeholder="Wybierz..." options={locations.map(l => ({ value: l.id, label: l.name }))} {...register('locationId')} error={errors.locationId?.message} />
          <Input label="Tag" placeholder="np. INV-2024-001" {...register('assetTag')} />
          <Select label="Status" options={STATUS_OPTIONS} {...register('status')} />
          <Select label="Krytyczność" options={CRITICALITY_OPTIONS} {...register('criticality')} />
          <Select label="Typ urządzenia" placeholder="Wybierz..." options={TYPE_OPTIONS} {...register('type')} />
        </div>

        {/* Right — techniczne */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--tm)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
          }}>Dane techniczne (opcjonalne)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Input label="Producent" placeholder="Dell, HP..." {...register('manufacturer')} />
            <Input label="Model" placeholder="OptiPlex 7090" {...register('model')} />
          </div>
          <Input label="Numer seryjny" placeholder="SN123456" {...register('serialNumber')} />
          <Input label="Hostname" placeholder="PC-BIURO-001" {...register('hostname')} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Input label="Adres IP" placeholder="192.168.1.10" {...register('ipAddress')} />
            <Input label="Adres MAC" placeholder="AA:BB:CC:DD:EE:FF" {...register('macAddress')} />
          </div>
          <Input label="System operacyjny" placeholder="Windows 11 Pro" {...register('os')} />
          <Textarea label="Notatki" placeholder="Dodatkowe informacje..." rows={2} {...register('notes')} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
        <Button type="submit" loading={mutation.isPending}>Dodaj urządzenie</Button>
      </div>
    </form>
  );
}
