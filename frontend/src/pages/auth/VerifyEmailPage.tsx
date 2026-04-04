import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useTheme } from '../../store/themeStore';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { resolved } = useTheme();
  const isLight = resolved === 'light';

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');
  const [workspace, setWorkspace] = useState<{ slug: string; type: string } | null>(null);

  useEffect(() => {
    if (!token) { setStatus('error'); setError('Brak tokenu weryfikacyjnego w linku.'); return; }

    apiClient.post('/auth/verify-email', { token })
      .then(r => {
        const data = r.data;
        // Save auth
        localStorage.setItem('infradesk_access_token', data.accessToken);
        localStorage.setItem('infradesk_refresh_token', data.refreshToken);
        localStorage.setItem('infradesk_user', JSON.stringify(data.user));
        if (data.workspace?.id) localStorage.setItem('infradesk_workspace', data.workspace.id);
        setWorkspace(data.workspace);
        setStatus('success');
      })
      .catch(err => {
        setError(err?.response?.data?.error || 'Weryfikacja nie powiodła się');
        setStatus('error');
      });
  }, [token]);

  const redirectUrl = '/dashboard';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
        <img src={isLight ? '/logo-dark.png' : '/logo.png'} alt="InfraDesk" style={{ height: 50, margin: '0 auto 32px', objectFit: 'contain' }} />

        {status === 'loading' && (
          <div style={{ padding: '48px 0' }}>
            <Loader2 size={40} color="#4F46E5" className="animate-spin" style={{ margin: '0 auto 20px' }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>Weryfikacja adresu e-mail...</div>
            <div style={{ fontSize: 14, color: 'var(--ts)' }}>Proszę czekać</div>
          </div>
        )}

        {status === 'success' && (
          <div style={{
            padding: 40, borderRadius: 22,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20, margin: '0 auto 20px',
              background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CheckCircle size={32} color="#10B981" />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t)', marginBottom: 8 }}>Email potwierdzony!</div>
            <div style={{ fontSize: 15, color: 'var(--ts)', marginBottom: 28, lineHeight: 1.6 }}>
              Twoje konto jest w pełni aktywne. Możesz teraz korzystać z InfraDesk.
            </div>
            <a href={redirectUrl} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '16px 32px', borderRadius: 14, border: 'none', textDecoration: 'none',
              background: 'linear-gradient(135deg, #4F46E5, #6D28D9)', color: '#fff',
              fontSize: 16, fontWeight: 750,
              boxShadow: '0 6px 20px rgba(79,70,229,0.35)',
            }}>
              Przejdź do panelu
            </a>
          </div>
        )}

        {status === 'error' && (
          <div style={{
            padding: 40, borderRadius: 22,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20, margin: '0 auto 20px',
              background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <XCircle size={32} color="#EF4444" />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t)', marginBottom: 8 }}>Nie udało się zweryfikować</div>
            <div style={{ fontSize: 15, color: 'var(--ts)', marginBottom: 28, lineHeight: 1.6 }}>{error}</div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Link to="/login" style={{
                padding: '14px 28px', borderRadius: 14, textDecoration: 'none',
                background: 'linear-gradient(135deg, #4F46E5, #6D28D9)', color: '#fff',
                fontSize: 14, fontWeight: 700,
              }}>
                Zaloguj się
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
