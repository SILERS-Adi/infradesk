import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Save, Mail, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { SectionCard, Field } from '../SectionCard';

interface MeResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    avatarUrl: string | null;
    emailVerified: boolean;
  };
}

interface FormData {
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
}

export function AccountSection() {
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceId = useAuthStore((s) => s.workspaceId);

  const meQ = useQuery<MeResponse>({
    queryKey: ['users', 'me'],
    queryFn: async () => (await api.get<MeResponse>('/users/me')).data,
  });

  const { register, handleSubmit, reset, watch, formState: { isDirty, isSubmitting } } =
    useForm<FormData>({
      defaultValues: { firstName: '', lastName: '', phone: '', avatarUrl: '' },
    });

  useEffect(() => {
    if (meQ.data?.user) {
      const u = meQ.data.user;
      reset({
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone ?? '',
        avatarUrl: u.avatarUrl ?? '',
      });
    }
  }, [meQ.data, reset]);

  const saveMut = useMutation({
    mutationFn: async (values: FormData) => {
      const payload: Record<string, unknown> = {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone === '' ? null : values.phone,
        avatarUrl: values.avatarUrl === '' ? null : values.avatarUrl,
      };
      return (await api.patch<{ user: MeResponse['user'] }>('/users/me', payload)).data;
    },
    onSuccess: (data) => {
      toast.success('Zapisano zmiany konta');
      qc.invalidateQueries({ queryKey: ['users', 'me'] });
      // Keep Zustand authUser in sync with fresh firstName/lastName.
      if (authUser && data?.user && accessToken) {
        setSession(
          {
            ...authUser,
            firstName: data.user.firstName,
            lastName: data.user.lastName,
          },
          accessToken,
          workspaceId ?? undefined,
        );
      }
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Błąd zapisu';
      toast.error(msg);
    },
  });

  if (meQ.isLoading) {
    return (
      <SectionCard title="Konto" description="Twoje dane osobowe.">
        <SkeletonCard />
      </SectionCard>
    );
  }

  const user = meQ.data?.user;
  if (!user) return null;

  const avatarUrl = watch('avatarUrl');

  return (
    <SectionCard
      title="Konto"
      description="Podstawowe dane osobowe widoczne w systemie."
      footer={
        <Button
          onClick={handleSubmit((v) => saveMut.mutate(v))}
          disabled={!isDirty || isSubmitting || saveMut.isPending}
          className="gap-1.5"
        >
          <Save size={14} />
          {saveMut.isPending ? 'Zapisywanie…' : 'Zapisz'}
        </Button>
      }
    >
      <div className="flex items-start gap-[var(--sp-4)] mb-[var(--sp-4)]">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="avatar"
            className="w-16 h-16 rounded-full object-cover border border-[var(--bd)]"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <Avatar
            email={user.email}
            firstName={user.firstName}
            lastName={user.lastName}
            size={64}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold">
            {user.firstName} {user.lastName}
          </div>
          <div className="text-[12px] text-[var(--tx3)] flex items-center gap-1.5 mt-0.5">
            <Mail size={12} />
            <span className="font-mono truncate">{user.email}</span>
            {user.emailVerified && (
              <span className="inline-flex items-center gap-0.5" style={{ color: 'var(--ok)' }}>
                <CheckCircle2 size={12} /> zweryfikowany
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--tx3)] mt-1">
            Email zmienisz kontaktując się z administratorem workspace.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--sp-3)]">
        <Field label="Imię">
          <Input {...register('firstName', { required: true, maxLength: 100 })} />
        </Field>
        <Field label="Nazwisko">
          <Input {...register('lastName', { required: true, maxLength: 100 })} />
        </Field>
        <Field label="Telefon">
          <Input
            {...register('phone')}
            placeholder="+48 600 000 000"
            type="tel"
          />
        </Field>
        <Field label="Avatar URL" hint="Wklej link do zdjęcia (PNG/JPG).">
          <Input
            {...register('avatarUrl')}
            placeholder="https://…"
            type="url"
          />
        </Field>
      </div>
    </SectionCard>
  );
}
