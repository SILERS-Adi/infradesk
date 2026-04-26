import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { TicketCreateRouter } from '../../../components/forms/TicketCreateRouter';

/* ═══════════════════════════════════════════════════════════════════
   TicketNewPage — strona /tickets/new. Deleguje do TicketCreateRouter,
   który wybiera odpowiedni formularz zależnie od typu workspace:
   - MSP → MspTicketForm (z selektorem firmy klienta)
   - INTERNAL_IT / CLIENT → QuickTicketForm
   ═══════════════════════════════════════════════════════════════════ */

export default function TicketNewPage() {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader
        title="Nowe zgłoszenie"
        subtitle="Utwórz nowe zgłoszenie serwisowe"
        back="/tickets"
        helpKey="portalNewRequest"
      />

      <div className="page-card" style={{ padding: 0 }}>
        <TicketCreateRouter
          onSuccess={() => navigate('/tickets')}
          onCancel={() => navigate('/tickets')}
        />
      </div>
    </div>
  );
}
