import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const schema = z.object({
  title: z.string().min(3, 'Min. 3 znaki').max(200),
  description: z.string().min(1, 'Opisz problem').max(10_000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
});
type Form = z.infer<typeof schema>;

export function CreateTicketForm() {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM' },
  });

  const mutation = useMutation({
    mutationFn: async (data: Form) => (await api.post('/tickets', { ...data, source: 'MANUAL' })).data,
    onSuccess: () => {
      toast.success('Zgłoszenie utworzone');
      qc.invalidateQueries({ queryKey: ['tickets'] });
      reset();
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast.error(axiosErr.response?.data?.message ?? 'Błąd');
    },
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4" noValidate>
      <div>
        <label className="text-xs text-tm mb-1.5 block" htmlFor="t-title">Tytuł</label>
        <Input id="t-title" placeholder="Co się dzieje?" {...register('title')} />
        {errors.title && <p className="text-xs text-danger mt-1">{errors.title.message}</p>}
      </div>
      <div>
        <label className="text-xs text-tm mb-1.5 block" htmlFor="t-desc">Opis</label>
        <textarea
          id="t-desc"
          rows={6}
          className="w-full rounded-[var(--rs)] border border-border bg-bg2 px-3 py-2 text-sm text-t placeholder:text-tm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          placeholder="Szczegóły problemu, kroki, komunikaty błędów…"
          {...register('description')}
        />
        {errors.description && <p className="text-xs text-danger mt-1">{errors.description.message}</p>}
      </div>
      <div>
        <label className="text-xs text-tm mb-1.5 block" htmlFor="t-prio">Priorytet</label>
        <select
          id="t-prio"
          className="h-10 w-full rounded-[var(--rs)] border border-border bg-bg2 px-3 text-sm text-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          {...register('priority')}
        >
          <option value="LOW">Niski</option>
          <option value="MEDIUM">Średni</option>
          <option value="HIGH">Wysoki</option>
          <option value="CRITICAL">Krytyczny</option>
        </select>
      </div>
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isSubmitting}>Utwórz zgłoszenie</Button>
      </div>
    </form>
  );
}
