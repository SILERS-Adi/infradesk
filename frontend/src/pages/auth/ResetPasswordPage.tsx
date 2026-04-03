import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Lock, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { authApi } from '../../api/auth';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error('Hasło musi mieć min. 6 znaków'); return; }
    if (password !== confirm) { toast.error('Hasła nie są identyczne'); return; }
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as any).response?.data?.error || (err as any).response?.data?.message : null;
      toast.error(msg ?? 'Nie udało się zresetować hasła');
    } finally { setLoading(false); }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#040a16' }}>
        <div className="text-center">
          <p className="text-white/60 mb-4">Brak tokenu resetowania w linku.</p>
          <Link to="/login" className="text-violet-400 text-sm hover:underline">Powrót do logowania</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#040a16' }}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #060B1A 0%, #040a16 50%, #0D1525 100%)' }} />

      <div className="w-full max-w-[420px] relative z-10">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="InfraDesk" style={{ height: 100, margin: '0 auto 12px' }} />
        </div>

        <div className="rounded-[22px] overflow-hidden" style={{
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(16px)',
        }}>
          <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #6D28D9, #2563EB, transparent)' }} />
          <div className="p-8">
            {done ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <CheckCircle className="h-8 w-8" style={{ color: '#22C55E' }} />
                </div>
                <h2 className="text-[20px] font-semibold text-white/90 mb-2">Hasło zmienione</h2>
                <p className="text-[13px] mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Możesz teraz zalogować się nowym hasłem.
                </p>
                <Link to="/login"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold text-white transition-all active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>
                  Zaloguj się
                </Link>
              </div>
            ) : (
              <>
                <h2 className="text-[22px] font-semibold text-white/90 mb-1">Nowe hasło</h2>
                <p className="text-[13px] mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Ustaw nowe hasło do swojego konta
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-[0.08em] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      Nowe hasło
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
                      <input type="password" placeholder="Min. 6 znaków" value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full pl-11 pr-4 py-[14px] rounded-[14px] text-[14px] outline-none placeholder:text-white/20"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.9)' }} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-[0.08em] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      Powtórz hasło
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
                      <input type="password" placeholder="Powtórz hasło" value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        className="w-full pl-11 pr-4 py-[14px] rounded-[14px] text-[14px] outline-none placeholder:text-white/20"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.9)' }} />
                    </div>
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-[14px] rounded-[14px] text-[14px] font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5 opacity-60" />}
                    {loading ? 'Zapisuję...' : 'Ustaw nowe hasło'}
                  </button>
                </form>
              </>
            )}

            <div className="mt-6 text-center">
              <Link to="/login" className="inline-flex items-center gap-1.5 text-[12px] transition-colors hover:text-violet-400"
                style={{ color: 'rgba(255,255,255,0.3)' }}>
                <ArrowLeft className="h-3.5 w-3.5" /> Powrót do logowania
              </Link>
            </div>
            <p className="text-center text-[10px] mt-6" style={{ color: 'rgba(255,255,255,0.15)' }}>
              InfraDesk © {new Date().getFullYear()} · by SILERS
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
