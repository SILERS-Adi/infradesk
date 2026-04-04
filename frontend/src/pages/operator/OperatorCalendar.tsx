import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';

export default function OperatorCalendar() {
  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Kalendarz" subtitle="Przegląd terminów i wizyt u klientów" />
      <EmptyState
        title="Kalendarz jest pusty"
        description="Terminy wizyt serwisowych, deadliny zgłoszeń i zaplanowane zadania pojawią się tutaj"
      />
    </div>
  );
}
