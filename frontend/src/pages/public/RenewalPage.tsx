/**
 * Renewal / Reactivation page
 * For users with expired/paused subscriptions who want to resume or reconfigure.
 * Loads last saved config into the configurator for editing.
 */
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../store/authStore';
import { useWorkspace } from '../../store/workspaceStore';
import { useTheme } from '../../store/themeStore';
import { apiClient } from '../../api/client';
import toast from 'react-hot-toast';
import {
  RefreshCw, Settings2, CreditCard, FileText, ArrowRight, Check, Package, Loader2,
} from 'lucide-react';

interface WorkspaceSubscription {
  name: string;
  type: string;
  subscriptionStatus: string;
  trialEndDate: string | null;
  billingCycle: string;
  monthlyPrice: number;
  lastConfig: any;
  paidUntil: string | null;
}

export default function RenewalPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { current } = useWorkspace();
  const { resolved } = useTheme();
  const isLight = resolved === 'light';

  const [sub, setSub] = useState<WorkspaceSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { navigate('/login?returnTo=/wznowienie'); return; }
    if (!current) return;

    apiClient.get(`/workspaces/${current.workspaceId}/subscription`)
      .then(r => setSub(r.data))
      .catch(() => toast.error('Nie udało się pobrać danych subskrypcji'))
      .finally(() => setLoading(false));
  }, [isAuthenticated, authLoading, current, navigate]);

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} color="var(--tm)" className="animate-spin" />
      </div>
    );
  }

  if (!sub) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--ts)' }}>
          <p>Nie znaleziono danych subskrypcji.</p>
          <Link to="/dashboard" style={{ color: '#4F46E5', fontWeight: 600 }}>Wróć do panelu</Link>
        </div>
      </div>
    );
  }

  const isCompany = sub.type === 'COMPANY';
  const hasConfig = !!sub.lastConfig;
  const isExpired = sub.subscriptionStatus === 'EXPIRED' || sub.subscriptionStatus === 'PAUSED';
  const ease = 'cubic-bezier(0.16,1,0.3,1)';

  const handleResumeLast = () => {
    // Go to payment with last config
    toast.success('Konfiguracja przywrócona — przejdź do płatności');
    // TODO: integrate with payment gateway
  };

  const handleReconfigure = () => {
    // Navigate to configurator with preloaded config
    const configParam = hasConfig ? encodeURIComponent(JSON.stringify(sub.lastConfig)) : '';
    navigate(`/konfigurator?mode=renewal${configParam ? `&config=${configParam}` : ''}`);
  };

  const handlePayOnline = async () => {
    try {
      const res = await apiClient.post('/billing/create-payment', {
        workspaceId: current?.workspaceId,
        billingCycle: sub.billingCycle,
        amount: sub.billingCycle === 'YEARLY' ? Math.round(sub.monthlyPrice * 12 * 0.9) : sub.monthlyPrice,
      });
      if (res.data.message) toast(res.data.message, { icon: '💳', duration: 5000 });
    } catch {
      toast.error('Nie udało się zainicjować płatności');
    }
  };

  const [sendingProforma, setSendingProforma] = useState(false);
  const handleProforma = async () => {
    setSendingProforma(true);
    try {
      const res = await apiClient.post('/billing/send-proforma', { workspaceId: current?.workspaceId });
      toast.success(`Proforma wysłana na ${res.data.sentTo || 'adres email'}`);
    } catch {
      toast.error('Nie udało się wysłać proformy');
    } finally { setSendingProforma(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--t)', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid var(--border)', background: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(6,11,24,0.8)', backdropFilter: 'blur(20px)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <img src={isLight ? '/logo-dark.png' : '/logo.png'} alt="InfraDesk" style={{ height: 40 }} />
          <Link to="/dashboard" style={{ fontSize: 13, color: 'var(--ts)', textDecoration: 'none', fontWeight: 500 }}>Wróć do panelu</Link>
        </div>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 120px' }}>
        {/* Status badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 18px', borderRadius: 20, marginBottom: 24,
          background: isExpired ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
          color: isExpired ? '#EF4444' : '#F59E0B',
          fontSize: 13, fontWeight: 700,
        }}>
          <RefreshCw size={14} />
          {isExpired ? 'Usługa wygasła' : 'Usługa wstrzymana'}
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 850, letterSpacing: '-0.03em', marginBottom: 12, color: 'var(--t)' }}>
          Wznów swoją usługę
        </h1>

        <p style={{ fontSize: 16, color: 'var(--ts)', lineHeight: 1.7, maxWidth: 540, marginBottom: 40 }}>
          {hasConfig
            ? 'To konto ma zapisaną wcześniejszą konfigurację. Możesz wznowić ją jednym kliknięciem albo dopasować usługi do obecnych potrzeb.'
            : 'Skonfiguruj usługi i wznów konto.'}
        </p>

        {/* Last config summary */}
        {hasConfig && (
          <div style={{
            padding: 28, borderRadius: 20, marginBottom: 32,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--tm)', marginBottom: 14 }}>
              Ostatnia konfiguracja
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--t)' }}>{sub.name}</span>
              <span style={{ fontSize: 20, fontWeight: 850, color: '#4F46E5' }}>{sub.monthlyPrice} zł <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--tm)' }}>/ msc</span></span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ts)' }}>
              Rozliczenie: {sub.billingCycle === 'YEARLY' ? 'roczne (-10%)' : 'miesięczne'}
            </div>
          </div>
        )}

        {/* Action cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Resume last config */}
          {hasConfig && (
            <button onClick={handleResumeLast} style={{
              display: 'flex', alignItems: 'center', gap: 20, padding: 28, borderRadius: 18,
              background: 'var(--bg-card)', border: '2px solid var(--border)',
              cursor: 'pointer', textAlign: 'left', width: '100%',
              transition: `all 0.25s ${ease}`,
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#818CF8'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(79,70,229,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}>
                <RefreshCw size={22} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 750, color: 'var(--t)', marginBottom: 4 }}>Wznów ostatnią konfigurację</div>
                <div style={{ fontSize: 14, color: 'var(--ts)' }}>Powrót do poprzedniego pakietu bez zmian</div>
              </div>
              <ArrowRight size={18} color="var(--tm)" />
            </button>
          )}

          {/* Reconfigure */}
          <button onClick={handleReconfigure} style={{
            display: 'flex', alignItems: 'center', gap: 20, padding: 28, borderRadius: 18,
            background: 'var(--bg-card)', border: '2px solid var(--border)',
            cursor: 'pointer', textAlign: 'left', width: '100%',
            transition: `all 0.25s ${ease}`,
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#818CF8'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(79,70,229,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #F1F5F9, #E2E8F0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Settings2 size={22} color="#64748B" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 750, color: 'var(--t)', marginBottom: 4 }}>Dostosuj konfigurację</div>
              <div style={{ fontSize: 14, color: 'var(--ts)' }}>Zmień moduły, liczbę stanowisk lub plan rozliczenia</div>
            </div>
            <ArrowRight size={18} color="var(--tm)" />
          </button>

          {/* Pay online */}
          <button onClick={handlePayOnline} style={{
            display: 'flex', alignItems: 'center', gap: 20, padding: 28, borderRadius: 18,
            background: 'var(--bg-card)', border: '2px solid var(--border)',
            cursor: 'pointer', textAlign: 'left', width: '100%',
            transition: `all 0.25s ${ease}`,
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#10B981'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #059669, #10B981)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
              <CreditCard size={22} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 750, color: 'var(--t)', marginBottom: 4 }}>Zapłać online</div>
              <div style={{ fontSize: 14, color: 'var(--ts)' }}>Szybka płatność kartą lub przelewem</div>
            </div>
            <ArrowRight size={18} color="var(--tm)" />
          </button>

          {/* Proforma — companies only */}
          {isCompany && (
            <button onClick={handleProforma} style={{
              display: 'flex', alignItems: 'center', gap: 20, padding: 28, borderRadius: 18,
              background: 'var(--bg-card)', border: '2px solid var(--border)',
              cursor: 'pointer', textAlign: 'left', width: '100%',
              transition: `all 0.25s ${ease}`,
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#818CF8'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #F1F5F9, #E2E8F0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={22} color="#64748B" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 750, color: 'var(--t)', marginBottom: 4 }}>Wyślij proformę na e-mail</div>
                <div style={{ fontSize: 14, color: 'var(--ts)' }}>Otrzymasz fakturę proforma do opłacenia przelewem</div>
              </div>
              <ArrowRight size={18} color="var(--tm)" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
