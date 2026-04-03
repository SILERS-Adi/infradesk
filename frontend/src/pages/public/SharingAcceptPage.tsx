import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useTheme } from '../../store/themeStore';

export default function SharingAcceptPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { resolved } = useTheme();
  const isLight = resolved === 'light';
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'login'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setError('Brak tokenu w linku.'); return; }
    const accessToken = localStorage.getItem('infradesk_access_token');
    if (!accessToken) { setStatus('login'); return; }

    apiClient.post('/sharing/accept', { token })
      .then(() => setStatus('success'))
      .catch(err => { setError(err?.response?.data?.error || 'Nie udało się zaakceptować'); setStatus('error'); });
  }, [token]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
        <img src={isLight ? '/logo-dark.png' : '/logo.png'} alt="InfraDesk" style={{ height: 50, margin: '0 auto 32px' }} />

        {status === 'loading' && <Loader2 size={40} color="#4F46E5" className="animate-spin" style={{ margin: '40px auto' }} />}

        {status === 'login' && (
          <div style={{ padding: 40, borderRadius: 22, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)', marginBottom: 12 }}>Zaloguj się aby kontynuować</div>
            <p style={{ fontSize: 14, color: 'var(--ts)', marginBottom: 24 }}>Musisz być zalogowany żeby zaakceptować zaproszenie.</p>
            <Link to={`/login?returnTo=${encodeURIComponent(window.location.href)}`} style={{
              display: 'inline-block', padding: '14px 32px', borderRadius: 14, textDecoration: 'none',
              background: 'linear-gradient(135deg, #4F46E5, #6D28D9)', color: '#fff', fontWeight: 700,
            }}>Zaloguj się</Link>
          </div>
        )}

        {status === 'success' && (
          <div style={{ padding: 40, borderRadius: 22, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <CheckCircle size={48} color="#10B981" style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t)', marginBottom: 8 }}>Zaproszenie zaakceptowane!</div>
            <p style={{ fontSize: 14, color: 'var(--ts)', marginBottom: 24 }}>Współpraca została nawiązana. Możesz teraz zarządzać udostępnionymi zasobami.</p>
            <Link to="/dashboard" style={{
              display: 'inline-block', padding: '14px 32px', borderRadius: 14, textDecoration: 'none',
              background: 'linear-gradient(135deg, #4F46E5, #6D28D9)', color: '#fff', fontWeight: 700,
            }}>Przejdź do panelu</Link>
          </div>
        )}

        {status === 'error' && (
          <div style={{ padding: 40, borderRadius: 22, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <XCircle size={48} color="#EF4444" style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t)', marginBottom: 8 }}>Błąd</div>
            <p style={{ fontSize: 14, color: 'var(--ts)', marginBottom: 24 }}>{error}</p>
            <Link to="/login" style={{ color: '#4F46E5', fontWeight: 600, textDecoration: 'none' }}>Zaloguj się</Link>
          </div>
        )}
      </div>
    </div>
  );
}
