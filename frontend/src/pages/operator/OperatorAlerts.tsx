import { useQuery } from '@tanstack/react-query';
import { Bell, AlertTriangle } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';

export default function OperatorAlerts() {
  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Alerty i asystenci" subtitle="Alerty z agentów i automatyczne powiadomienia" />
      <EmptyState
        title="Brak aktywnych alertów"
        description="Alerty pojawią się automatycznie gdy agenty klientów wykryją problemy"
      />
    </div>
  );
}
