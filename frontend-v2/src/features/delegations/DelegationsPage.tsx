import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Car, Calendar, MapPin, User, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { StatusPill } from '@/components/ui/StatusPill';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatDatePl } from '@/lib/utils';

interface Delegation {
  id: string;
  delegationNumber: string;
  title: string;
  description: string | null;
  status: 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  scheduledAt: string;
  estimatedHours: number | null;
  distanceKm: number | null;
  vehicleLicensePlate: string | null;
  notes: string | null;
  assignedTo: { id: string; firstName: string; lastName: string };
  createdBy: { id: string; firstName: string; lastName: string };
}

export function DelegationsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<{ items: Delegation[] }>({
    queryKey: ['delegations'],
    queryFn: async () => (await api.get('/delegations')).data,
  });

  const changeStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await api.post(`/delegations/${id}/status`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delegations'] }),
  });

  const items = data?.items ?? [];
  const upcoming = items.filter((d) => new Date(d.scheduledAt) >= new Date(Date.now() - 24 * 3600_000));
  const past = items.filter((d) => new Date(d.scheduledAt) < new Date(Date.now() - 24 * 3600_000));

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Delegacje</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            {upcoming.length > 0 ? `${upcoming.length} zaplanowanych` : 'Brak zaplanowanych delegacji'}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Nowa delegacja</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <Car className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak delegacji</p>
          <p className="text-[13px] text-tx3">Dodaj pierwsze planowane wyjazdy techników.</p>
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx3 mb-2">Zaplanowane</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stg">
                {upcoming.map((d) => <DelegationCard key={d.id} d={d} onStatus={changeStatus.mutate} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx3 mb-2 mt-6">Historia</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {past.slice(0, 9).map((d) => <DelegationCard key={d.id} d={d} onStatus={changeStatus.mutate} />)}
              </div>
            </div>
          )}
        </>
      )}

      {showCreate && <CreateDelegationModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function DelegationCard({ d, onStatus }: { d: Delegation; onStatus: (p: { id: string; status: string }) => void }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-mono text-tx3">{d.delegationNumber}</span>
        <StatusPill entity="delegation" value={d.status} />
      </div>
      <h3 className="text-[14px] font-semibold text-tx mb-2">{d.title}</h3>
      <div className="space-y-1 text-[11px] text-tx2">
        <div className="flex items-center gap-2"><User className="h-3 w-3 text-tx3" /> {d.assignedTo.firstName} {d.assignedTo.lastName}</div>
        <div className="flex items-center gap-2"><Calendar className="h-3 w-3 text-tx3" /> {formatDatePl(d.scheduledAt)}</div>
        {d.estimatedHours && <div className="flex items-center gap-2 text-tx3"><span className="h-3 w-3 inline-flex items-center justify-center">⏱</span> ~{d.estimatedHours}h</div>}
        {d.distanceKm && <div className="flex items-center gap-2 text-tx3"><MapPin className="h-3 w-3" /> ~{d.distanceKm} km</div>}
        {d.vehicleLicensePlate && <div className="text-tx3">Auto: {d.vehicleLicensePlate}</div>}
      </div>
      {d.status === 'PLANNED' && (
        <Button size="sm" variant="outline" className="w-full mt-3" onClick={() => onStatus({ id: d.id, status: 'IN_PROGRESS' })}>
          Rozpocznij
        </Button>
      )}
      {d.status === 'IN_PROGRESS' && (
        <Button size="sm" variant="success" className="w-full mt-3" onClick={() => onStatus({ id: d.id, status: 'DONE' })}>
          Zakończ
        </Button>
      )}
    </Card>
  );
}

const schema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  assignedToUserId: z.string().uuid(),
  scheduledAt: z.string().min(1),
  estimatedHours: z.coerce.number().positive().optional(),
  distanceKm: z.coerce.number().nonnegative().optional(),
  vehicleLicensePlate: z.string().optional(),
  notes: z.string().optional(),
});
type Form = z.infer<typeof schema>;

function CreateDelegationModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: members } = useQuery<{ memberships: Array<{ user: { id: string; firstName: string; lastName: string } }> }>({
    queryKey: ['memberships', 'list'],
    queryFn: async () => (await api.get('/memberships')).data,
  });

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: async (data: Form) => (await api.post('/delegations', {
      ...data,
      scheduledAt: new Date(data.scheduledAt).toISOString(),
    })).data,
    onSuccess: () => { toast.success('Delegacja utworzona'); qc.invalidateQueries({ queryKey: ['delegations'] }); onClose(); },
    onError: () => toast.error('Błąd tworzenia delegacji'),
  });

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm anim-up" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-xl)] anim-scale"
          style={{ background: 'var(--sf)', boxShadow: 'var(--sh4)', border: '1px solid var(--bd)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd">
            <Dialog.Title className="text-[16px] font-bold text-tx">Nowa delegacja</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <form className="px-6 py-5 space-y-4" onSubmit={handleSubmit((d) => mutation.mutate(d))}>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Tytuł</label>
              <Input {...register('title')} placeholder="np. Serwis Dwór Osmolice" />
              {errors.title && <p className="text-[11px] text-er mt-1">{errors.title.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Technik</label>
                <Select {...register('assignedToUserId')}>
                  <option value="">—</option>
                  {(members?.memberships ?? []).map((m) => (
                    <option key={m.user.id} value={m.user.id}>{m.user.firstName} {m.user.lastName}</option>
                  ))}
                </Select>
                {errors.assignedToUserId && <p className="text-[11px] text-er mt-1">Wybierz technika</p>}
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Kiedy</label>
                <Input type="datetime-local" {...register('scheduledAt')} />
                {errors.scheduledAt && <p className="text-[11px] text-er mt-1">Wybierz datę</p>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Godziny</label>
                <Input type="number" step="0.5" {...register('estimatedHours')} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Km</label>
                <Input type="number" {...register('distanceKm')} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Auto</label>
                <Input {...register('vehicleLicensePlate')} placeholder="LU 12345" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-tx2">Opis / notatki</label>
              <Textarea rows={3} {...register('notes')} />
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-bd">
              <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Utwórz'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
