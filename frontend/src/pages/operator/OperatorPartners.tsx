import { Lock, Star } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';

export default function OperatorPartners() {
  const { features } = useWorkspaceContext();

  // If enterprise plan — show real content (placeholder for now)
  if (features.PARTNERS) {
    return (
      <div style={{ padding: '0 0 40px' }}>
        <PageHeader title="Partnerzy IT" subtitle="Zarządzanie partnerami i podwykonawcami" />
        <div className="page-card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>Partnerzy IT</div>
          <p style={{ fontSize: 13, color: 'var(--tm)' }}>Moduł w przygotowaniu — zarządzanie partnerami, podwykonawcami i umowami partnerskimi.</p>
        </div>
      </div>
    );
  }

  // Upsell screen for non-enterprise plans
  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Partnerzy IT" subtitle="Zarządzanie partnerami i podwykonawcami" />
      <div style={{
        maxWidth: 480, margin: '40px auto', textAlign: 'center', padding: 40,
        background: 'var(--bg-card, var(--bg2))', borderRadius: 16,
        border: '1px solid var(--border)',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16, margin: '0 auto 20px',
          background: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lock size={28} color="#fff" />
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--t)', margin: '0 0 8px' }}>
          Odblokuj Partnerów IT
        </h2>
        <p style={{ fontSize: 14, color: 'var(--tm)', margin: '0 0 24px', lineHeight: 1.6 }}>
          Zarządzaj siecią partnerów IT, podwykonawcami i umowami.
          Deleguj zgłoszenia do partnerów i śledź realizację.
        </p>

        <div style={{
          padding: 16, borderRadius: 12, marginBottom: 24, textAlign: 'left',
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Star size={14} /> Plan Enterprise obejmuje:
          </div>
          <ul style={{ fontSize: 12, color: 'var(--ts)', margin: 0, paddingLeft: 16, lineHeight: 2 }}>
            <li>Zarządzanie partnerami i podwykonawcami</li>
            <li>Delegowanie zgłoszeń do partnerów</li>
            <li>Umowy partnerskie i SLA</li>
            <li>Rozliczenia międzyfirmowe</li>
            <li>Raportowanie cross-partner</li>
          </ul>
        </div>

        <button
          className="btn-primary"
          style={{ padding: '12px 32px', fontSize: 14, fontWeight: 700 }}
          onClick={() => window.open('mailto:kontakt@infradesk.pl?subject=Plan Enterprise', '_blank')}
        >
          Skontaktuj się z nami
        </button>

        <p style={{ fontSize: 11, color: 'var(--td)', marginTop: 12 }}>
          Napisz do nas — pomożemy dobrać plan
        </p>
      </div>
    </div>
  );
}
