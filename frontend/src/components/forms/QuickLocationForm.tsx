import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { locationsApi } from '../../api/locations';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../utils/helpers';

/* ═══════════════════════════════════════════════════════════════════
   QuickLocationForm — prosty formularz kartowy do tworzenia lokalizacji.
   ═══════════════════════════════════════════════════════════════════ */

const schema = z.object({
  name: z.string().min(2, 'Nazwa jest wymagana (min 2 znaki)'),
  type: z.string().optional(),
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

const TYPE_OPTIONS = [
  { value: 'OFFICE', label: 'Biuro' },
  { value: 'WAREHOUSE', label: 'Magazyn' },
  { value: 'SHOP', label: 'Sklep' },
  { value: 'SERVER_ROOM', label: 'Serwerownia' },
  { value: 'BRANCH', label: 'Oddział' },
  { value: 'SCHOOL', label: 'Szkoła' },
  { value: 'FACTORY', label: 'Fabryka' },
  { value: 'OTHER', label: 'Inne' },
];

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export function QuickLocationForm({ onSuccess, onCancel }: Props) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { country: 'Polska' },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'string' && v.trim()) payload[k] = v.trim();
      }
      return locationsApi.create(payload as any);
    },
    onSuccess: () => {
      toast.success('Lokalizacja dodana');
      qc.invalidateQueries({ queryKey: ['locations'] });
      onSuccess();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} style={{ padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="Nazwa lokalizacji *" placeholder="np. Biuro Warszawa" {...register('name')} error={errors.name?.message} />
          <Select label="Typ" placeholder="Wybierz..." options={TYPE_OPTIONS} {...register('type')} />
          <Input label="Adres" placeholder="ul. Przykładowa 10" {...register('addressLine1')} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
            <Input label="Kod pocztowy" placeholder="00-000" {...register('postalCode')} />
            <Input label="Miasto" placeholder="Warszawa" {...register('city')} />
          </div>
          <Input label="Kraj" placeholder="Polska" {...register('country')} />
        </div>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            padding: 16, borderRadius: 12,
            background: 'rgba(139,92,246,0.04)',
            border: '1px solid rgba(139,92,246,0.1)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Osoba kontaktowa
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Input label="Imię i nazwisko" placeholder="Jan Kowalski" {...register('contactPersonName')} />
              <Input label="Telefon" placeholder="+48 123 456 789" {...register('contactPersonPhone')} />
              <Input label="Email" placeholder="jan@firma.pl" {...register('contactPersonEmail')} />
            </div>
          </div>
          <Textarea label="Notatki" placeholder="Dodatkowe informacje..." rows={3} {...register('notes')} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
        <Button type="submit" loading={mutation.isPending}>Dodaj lokalizację</Button>
      </div>
    </form>
  );
}
