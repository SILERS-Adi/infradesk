import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { credentialsApi } from '../../api/credentials';
import { locationsApi } from '../../api/locations';
import { devicesApi } from '../../api/devices';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../utils/helpers';

/* ═══════════════════════════════════════════════════════════════════
   QuickCredentialForm — prosty formularz kartowy do dodawania hasła.
   ═══════════════════════════════════════════════════════════════════ */

const schema = z.object({
  name: z.string().min(2, 'Nazwa jest wymagana'),
  username: z.string().optional(),
  password: z.string().optional(),
  url: z.string().optional(),
  port: z.string().optional(),
  notes: z.string().optional(),
  locationId: z.string().optional(),
  deviceId: z.string().optional(),
  shareWithClient: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

function generatePassword(len = 16): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)), b => chars[b % chars.length]).join('');
}

export function QuickCredentialForm({ onSuccess, onCancel }: Props) {
  const qc = useQueryClient();
  const [showPw, setShowPw] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationsApi.getAll(),
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.getAll(),
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload: Record<string, unknown> = { name: data.name };
      if (data.username?.trim()) payload.username = data.username.trim();
      if (data.password?.trim()) payload.password = data.password.trim();
      if (data.url?.trim()) payload.url = data.url.trim();
      if (data.port?.trim()) payload.port = data.port.trim();
      if (data.notes?.trim()) payload.notes = data.notes.trim();
      if (data.locationId) payload.locationId = data.locationId;
      if (data.deviceId) payload.deviceId = data.deviceId;
      if (data.shareWithClient) payload.shareWithClient = true;
      return credentialsApi.create(payload as any);
    },
    onSuccess: () => {
      toast.success('Wpis dodany do sejfu');
      qc.invalidateQueries({ queryKey: ['credentials'] });
      onSuccess();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} style={{ padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="Nazwa wpisu *" placeholder="np. Router biuro — admin panel" {...register('name')} error={errors.name?.message} />
          <Input label="Login / Użytkownik" placeholder="admin" {...register('username')} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tm)' }}>Hasło</label>
              <button type="button" onClick={() => setValue('password', generatePassword())}
                title="Generuj silne hasło"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 2 }}>
                <RefreshCw size={12} />
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                {...register('password')}
                style={{
                  width: '100%', padding: '8px 36px 8px 12px', fontSize: 13, borderRadius: 10,
                  background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)',
                }}
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)' }}>
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <Input label="URL / Host" placeholder="192.168.1.1" {...register('url')} />
            <Input label="Port" placeholder="443" {...register('port')} />
          </div>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Select label="Lokalizacja" placeholder="Opcjonalnie..." options={locations.map(l => ({ value: l.id, label: l.name }))} {...register('locationId')} />
          <Select label="Urządzenie" placeholder="Opcjonalnie..." options={devices.map(d => ({ value: d.id, label: d.name }))} {...register('deviceId')} />
          <Textarea label="Notatki" placeholder="Dodatkowe informacje..." rows={3} {...register('notes')} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
            <input type="checkbox" {...register('shareWithClient')} />
            <span style={{ fontSize: 12, color: 'var(--ts)' }}>Udostępnij klientowi w portalu</span>
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <Button variant="secondary" type="button" onClick={onCancel}>Anuluj</Button>
        <Button type="submit" loading={mutation.isPending}>Dodaj do sejfu</Button>
      </div>
    </form>
  );
}
