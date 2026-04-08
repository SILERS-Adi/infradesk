import { useQuery } from '@tanstack/react-query';
import { delegationsApi } from '../../../api/delegations';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { formatDateTime } from '../../../utils/helpers';
import { Plane } from 'lucide-react';

export function DelegationsPage() {
  const { data: delegations = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['delegations-all'],
    queryFn: () => delegationsApi.getAll(),
  });

  return (
    <div>
      <PageHeader title="Delegacje" subtitle={`${delegations.length} delegacji`} />
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" /></div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : delegations.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--tm)' }}><Plane className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>Brak delegacji</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {delegations.map(d => (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="font-mono text-xs font-bold text-violet-400">{d.delegationNumber}</span>
                {d.scheduledAt && <span className="text-xs" style={{ color: 'var(--tm)' }}>{formatDateTime(d.scheduledAt)}</span>}
              </div>
              <h3 className="font-semibold mb-1" style={{ color: 'var(--t)' }}>{d.title}</h3>
              {d.description && <p className="text-sm mb-2" style={{ color: 'var(--ts)' }}>{d.description}</p>}
              <div className="flex items-center gap-2 mt-3 pt-3 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--tm)' }}>
                <span>{d.location?.name || '—'}</span>
                {d.assignedTo && <><span>·</span><span>{d.assignedTo.firstName} {d.assignedTo.lastName}</span></>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
