import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { authApi } from '../../api/auth';
import { useAuth } from '../../store/authStore';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

const schema = z.object({
  email: z.string().email('Podaj poprawny email'),
  password: z.string().min(1, 'Hasło jest wymagane'),
});

type FormData = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuth();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const response = await authApi.login(data.email, data.password);
      setTokens(response.accessToken, response.refreshToken);
      setUser(response.user);
      if (response.user.role === 'CLIENT') navigate('/portal');
      else navigate('/dashboard');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg ?? 'Nieprawidłowy email lub hasło');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* LEFT — branding panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1e40af 100%)' }}
      >
        {/* dekoracyjne kółka */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #f59e0b, transparent)' }} />
        <div className="absolute -bottom-32 -right-16 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />

        <div className="relative z-10 text-center">
          <img src="/logo.png" alt="InfraDesk" className="h-28 mx-auto mb-8 drop-shadow-2xl" />
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-3">InfraDesk</h1>
          <p className="text-lg font-semibold tracking-widest uppercase mb-8"
            style={{ color: '#f59e0b' }}>
            Zarządzanie Infrastrukturą IT
          </p>
          <div className="w-16 h-0.5 mx-auto mb-8" style={{ background: '#f59e0b' }} />
          <p className="text-blue-200 text-sm leading-relaxed max-w-xs mx-auto">
            Kompleksowe zarządzanie urządzeniami, zgłoszeniami i serwisem IT dla firm.
          </p>
        </div>

        <p className="absolute bottom-6 text-blue-300 text-xs tracking-widest">
          by SILERS · infradesk.pl
        </p>
      </div>

      {/* RIGHT — login form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-50">
        {/* logo mobile */}
        <div className="lg:hidden text-center mb-8">
          <img src="/logo.png" alt="InfraDesk" className="h-20 mx-auto mb-3" />
          <h1 className="text-2xl font-bold" style={{ color: '#0f172a' }}>InfraDesk</h1>
          <p className="text-xs font-semibold tracking-widest uppercase mt-1" style={{ color: '#f59e0b' }}>
            Zarządzanie Infrastrukturą IT
          </p>
        </div>

        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            {/* accent bar */}
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #1e40af, #f59e0b)' }} />

            <div className="p-10">
              <h2 className="text-2xl font-bold mb-1" style={{ color: '#0f172a' }}>Zaloguj się</h2>
              <p className="text-sm text-gray-500 mb-8">Wprowadź dane dostępowe do systemu</p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <Input
                  label="Adres e-mail"
                  type="email"
                  placeholder="jan@firma.pl"
                  {...register('email')}
                  error={errors.email?.message}
                />
                <Input
                  label="Hasło"
                  type="password"
                  placeholder="••••••••"
                  {...register('password')}
                  error={errors.password?.message}
                />
                <Button
                  type="submit"
                  className="w-full !py-3 !text-base font-semibold"
                  size="lg"
                  loading={loading}
                  style={{ background: 'linear-gradient(90deg, #1e40af, #1d4ed8)' } as React.CSSProperties}
                >
                  Zaloguj się
                </Button>
              </form>

              <p className="text-center text-xs text-gray-400 mt-8">
                InfraDesk © {new Date().getFullYear()} · by SILERS
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
