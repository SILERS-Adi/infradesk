import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';

export default function OperatorSessions() {
  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Sesje pracy" subtitle="Rejestracja czasu pracy u klientów" />
      <EmptyState
        title="Brak sesji"
        description="Sesje pracy będą rejestrowane automatycznie lub możesz je dodać ręcznie"
      />
    </div>
  );
}
