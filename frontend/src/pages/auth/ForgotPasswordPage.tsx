import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mail, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { authApi } from '../../api/auth';
import { useTheme } from '../../store/themeStore';

export function ForgotPasswordPage() {
  const { resolved } = useTheme();
  const isLight = resolved === 'light';
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) { toast.error('Podaj poprawny adres e-mail'); return; }
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch { toast.error('Nie udało się wysłać wiadomości'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="absolute inset-0" style={{ background: isLight ? 'var(--bg)' : 'linear-gradient(160deg, #060B1A 0%, #040a16 50%, #0D1525 100%)' }} />

      <div className="w-full max-w-[420px] relative z-10">
        <div className="text-center mb-8">
          <img src={isLight ? '/logo-dark.png' : '/logo.png'} alt="InfraDesk" style={{ height: 100, margin: '0 auto 12px' }} />
        </div>

        <div className="rounded-[22px] overflow-hidden" style={{
          background: isLight ? 'var(--bg-card)' : 'rgba(255,255,255,0.025)',
          border: '1px solid var(--border)',
          backdropFilter: 'blur(16px)',
        }}>
          <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #6D28D9, #2563EB, transparent)' }} />
          <div className="p-8">
            {sent ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <CheckCircle className="h-8 w-8" style={{ color: '#22C55E' }} />
                </div>
                <h2 className="text-[20px] font-semibold text-[color:var(--t)] mb-2">Sprawdź e-mail</h2>
                <p className="text-[13px] mb-2" style={{ color: 'var(--tm)' }}>
                  Jeśli konto z adresem <strong style={{ color: 'var(--ts)' }}>{email}</strong> istnieje, wysłaliśmy link do resetowania hasła.
                </p>
                <p className="text-[12px]" style={{ color: 'var(--tm)' }}>
                  Link jest ważny przez 24 godziny.
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-[22px] font-semibold text-[color:var(--t)] mb-1">Resetuj hasło</h2>
                <p className="text-[13px] mb-6" style={{ color: 'var(--ts)' }}>
                  Podaj adres e-mail — wyślemy link do ustawienia nowego hasła
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-[0.08em] mb-2" style={{ color: 'var(--ts)' }}>
                      Adres e-mail
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--td)' }} />
                      <input type="email" placeholder="jan@firma.pl" value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full pl-11 pr-4 py-[14px] rounded-[14px] text-[14px] outline-none placeholder:opacity-30"
                        style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--t)' }} />
                    </div>
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-[14px] rounded-[14px] text-[14px] font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5 opacity-60" />}
                    {loading ? 'Wysyłam...' : 'Wyślij link resetujący'}
                  </button>
                </form>
              </>
            )}

            <div className="mt-6 text-center">
              <Link to="/login" className="inline-flex items-center gap-1.5 text-[12px] transition-colors hover:text-violet-400"
                style={{ color: 'var(--tm)' }}>
                <ArrowLeft className="h-3.5 w-3.5" /> Powrót do logowania
              </Link>
            </div>
            <p className="text-center text-[10px] mt-6" style={{ color: 'var(--td)' }}>
              InfraDesk © {new Date().getFullYear()} · by SILERS
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
