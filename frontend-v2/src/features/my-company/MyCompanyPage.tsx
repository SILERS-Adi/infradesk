import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Building2, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';

interface Workspace {
  id: string;
  slug: string;
  name: string;
  type: string;
  taxId: string | null;
  regon: string | null;
  krs: string | null;
  logoUrl: string | null;
  primaryColor: string;
  locale: string;
  timezone: string;
  currency: string;
  plan: string;
  planStartedAt: string | null;
  planExpiresAt: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  createdAt: string;
}

type FormData = Omit<Workspace, 'id' | 'slug' | 'type' | 'plan' | 'planStartedAt' | 'planExpiresAt' | 'createdAt'>;

export function MyCompanyPage() {
  const qc = useQueryClient();
  const wsQ = useQuery<{ workspace: Workspace }>({
    queryKey: ['workspace', 'current'],
    queryFn: async () => (await api.get<{ workspace: Workspace }>('/workspaces/current')).data,
  });

  const { register, handleSubmit, reset, formState: { isDirty, isSubmitting } } = useForm<FormData>();

  useEffect(() => {
    if (wsQ.data?.workspace) {
      const { id, slug, type, plan, planStartedAt, planExpiresAt, createdAt, ...rest } = wsQ.data.workspace;
      void id; void slug; void type; void plan; void planStartedAt; void planExpiresAt; void createdAt;
      reset(rest);
    }
  }, [wsQ.data, reset]);

  const saveMut = useMutation({
    mutationFn: async (values: FormData) => {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === '' || v === null) payload[k] = null;
        else payload[k] = v;
      }
      return api.patch('/workspaces/current', payload);
    },
    onSuccess: () => {
      toast.success('Zapisano dane firmy');
      qc.invalidateQueries({ queryKey: ['workspace', 'current'] });
    },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd zapisu'),
  });

  if (wsQ.isLoading) return <SkeletonCard />;
  const ws = wsQ.data?.workspace;
  if (!ws) return null;

  return (
    <form onSubmit={handleSubmit((v) => saveMut.mutate(v))} className="space-y-[var(--sp-4)]">
      <div className="flex items-start justify-between gap-[var(--sp-3)] flex-wrap">
        <div className="flex items-start gap-3">
          <div
            className="w-14 h-14 rounded-[var(--r-m)] flex items-center justify-center shrink-0"
            style={{ background: 'var(--pri-l)' }}
          >
            {ws.logoUrl ? (
              <img src={ws.logoUrl} alt="logo" className="w-full h-full rounded-[var(--r-m)] object-cover" />
            ) : (
              <Building2 size={24} style={{ color: 'var(--pri)' }} />
            )}
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight">{ws.name}</h1>
            <div className="flex items-center gap-2 mt-1 text-[12px] text-[var(--tx3)]">
              <code>{ws.slug}.infradesk.pl</code>
              <Badge variant="accent">{ws.type}</Badge>
              <Badge variant="neutral">Plan {ws.plan}</Badge>
            </div>
          </div>
        </div>
        <Button type="submit" disabled={!isDirty || isSubmitting || saveMut.isPending} className="gap-1.5">
          <Save size={14} />
          Zapisz zmiany
        </Button>
      </div>

      <Card className="p-[var(--sp-4)]">
        <h2 className="text-[14px] font-semibold mb-[var(--sp-3)]">Dane podstawowe</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--sp-3)]">
          <Field label="Nazwa firmy"><Input {...register('name')} /></Field>
          <Field label="NIP"><Input {...register('taxId')} /></Field>
          <Field label="REGON"><Input {...register('regon')} /></Field>
          <Field label="KRS"><Input {...register('krs')} /></Field>
          <Field label="Logo URL"><Input {...register('logoUrl')} placeholder="https://…" /></Field>
          <Field label="Kolor marki">
            <Input type="color" {...register('primaryColor')} className="h-10 w-24 cursor-pointer" />
          </Field>
        </div>
      </Card>

      <Card className="p-[var(--sp-4)]">
        <h2 className="text-[14px] font-semibold mb-[var(--sp-3)]">Adres</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--sp-3)]">
          <Field label="Ulica i numer" wide><Input {...register('addressLine1')} /></Field>
          <Field label="Kod pocztowy"><Input {...register('postalCode')} placeholder="00-000" /></Field>
          <Field label="Miasto"><Input {...register('city')} /></Field>
          <Field label="Kraj (ISO-2)"><Input {...register('country')} maxLength={2} /></Field>
        </div>
      </Card>

      <Card className="p-[var(--sp-4)]">
        <h2 className="text-[14px] font-semibold mb-[var(--sp-3)]">Kontakt</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--sp-3)]">
          <Field label="Email"><Input type="email" {...register('email')} /></Field>
          <Field label="Telefon"><Input {...register('phone')} /></Field>
          <Field label="WWW" wide><Input {...register('website')} placeholder="https://…" /></Field>
        </div>
      </Card>

      <Card className="p-[var(--sp-4)]">
        <h2 className="text-[14px] font-semibold mb-[var(--sp-3)]">Regionalne</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--sp-3)]">
          <Field label="Język">
            <Select {...register('locale')}>
              <option value="pl-PL">Polski</option>
              <option value="en-US">English (US)</option>
              <option value="de-DE">Deutsch</option>
            </Select>
          </Field>
          <Field label="Strefa czasowa">
            <Select {...register('timezone')}>
              <option value="Europe/Warsaw">Europe/Warsaw</option>
              <option value="Europe/Berlin">Europe/Berlin</option>
              <option value="Europe/London">Europe/London</option>
              <option value="UTC">UTC</option>
            </Select>
          </Field>
          <Field label="Waluta">
            <Select {...register('currency')}>
              <option value="PLN">PLN</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </Select>
          </Field>
        </div>
      </Card>
    </form>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? 'md:col-span-2' : undefined}>
      <label className="text-[11px] text-[var(--tx3)] uppercase tracking-wider block mb-1">{label}</label>
      {children}
    </div>
  );
}
