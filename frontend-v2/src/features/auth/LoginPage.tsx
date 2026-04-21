import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const schema = z.object({
  email: z.string().email('Nieprawidłowy email'),
  password: z.string().min(1, 'Podaj hasło'),
  twoFactorCode: z.string().optional(),
});
type LoginForm = z.infer<typeof schema>;

export function LoginPage() {
  const { user, setSession } = useAuthStore();
  const navigate = useNavigate();
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(schema),
  });

  if (user) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (data: LoginForm) => {
    try {
      const res = await api.post('/auth/login', data);
      setSession(res.data.user, res.data.accessToken, res.data.defaultWorkspaceId);
      toast.success('Zalogowano');
      navigate('/dashboard');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
      const code = axiosErr.response?.data?.error;
      const message = axiosErr.response?.data?.message ?? 'Błąd logowania';
      if (code === 'two_factor_required') {
        setTwoFactorRequired(true);
        toast('Podaj kod 2FA');
        return;
      }
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6 relative">
      <div className="absolute top-6 right-6"><ThemeToggle /></div>
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-6">
            <div className="h-10 w-10 rounded-md bg-gradient-to-br from-accent to-accent/50 flex items-center justify-center font-bold text-accent-fg">I</div>
            <div>
              <h1 className="text-lg font-semibold text-t">InfraDesk v2</h1>
              <p className="text-xs text-tm">IT helpdesk. Polski pierwszy.</p>
            </div>
          </div>
          <h2 className="text-2xl font-semibold text-t">Zaloguj się</h2>
          <p className="text-sm text-tm mt-1">Podaj email i hasło do konta.</p>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <label className="text-xs text-tm mb-1.5 block" htmlFor="email">Email</label>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
            {errors.email && <p className="text-xs text-danger mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="text-xs text-tm mb-1.5 block" htmlFor="password">Hasło</label>
            <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
            {errors.password && <p className="text-xs text-danger mt-1">{errors.password.message}</p>}
          </div>
          {twoFactorRequired && (
            <div>
              <label className="text-xs text-tm mb-1.5 block" htmlFor="twoFactorCode">Kod 2FA (6 cyfr lub kod zapasowy)</label>
              <Input id="twoFactorCode" inputMode="numeric" autoComplete="one-time-code" {...register('twoFactorCode')} />
            </div>
          )}
          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Logowanie…' : 'Zaloguj się'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
