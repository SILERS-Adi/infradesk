import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import { QuickTicketForm } from './QuickTicketForm';
import { MspTicketForm } from './MspTicketForm';

/* ═══════════════════════════════════════════════════════════════════
   TicketCreateRouter — wybiera odpowiedni formularz na podstawie
   typu workspace:
   - msp           → MspTicketForm (z selektorem klienta jako Step 0)
   - internal_it   → QuickTicketForm (klasyczny, własny workspace)
   - client        → QuickTicketForm (klient zgłasza we własnym ws)
   ═══════════════════════════════════════════════════════════════════ */

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export function TicketCreateRouter({ onSuccess, onCancel }: Props) {
  const { wsType } = useWorkspaceContext();

  if (wsType === 'msp') {
    return <MspTicketForm onSuccess={onSuccess} onCancel={onCancel} />;
  }

  // internal_it i client — używają tego samego klasycznego formularza
  return <QuickTicketForm onSuccess={onSuccess} onCancel={onCancel} />;
}
