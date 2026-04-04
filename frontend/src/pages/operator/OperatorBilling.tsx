import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';

export default function OperatorBilling() {
  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Rozliczenia" subtitle="Rozliczenia z klientami za usługi IT" />
      <EmptyState
        title="Brak rozliczeń"
        description="Tutaj pojawią się podsumowania sesji pracy, zgłoszeń i faktur dla klientów"
      />
    </div>
  );
}
