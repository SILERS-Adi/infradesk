import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TicketCreator } from './NewTicketModal';

export function NewTicketPage() {
  const nav = useNavigate();
  return (
    <div className="space-y-4 max-w-[56rem] mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => nav('/tickets')}>
          <ChevronLeft className="h-4 w-4" /> Wróć do listy
        </Button>
      </div>
      <TicketCreator variant="page" onClose={() => nav('/tickets')} />
    </div>
  );
}
