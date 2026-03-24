import { useQuery } from '@tanstack/react-query';
import { delegationsApi } from '../../../api/delegations';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { formatDateTime } from '../../../utils/helpers';
import { Plane } from 'lucide-react';

export function DelegationsPage() {
  const { data: delegations = [], isLoading } = useQuery({
    queryKey: ['delegations-all'],
    queryFn: () => delegationsApi.getAll(),
  });

  return (
    <div>
      <PageHeader title="Delegacje" subtitle={`${delegations.length} delegacji`} />
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
      ) : delegations.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><Plane className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>Brak delegacji</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {delegations.map(d => (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="font-mono text-xs font-bold text-indigo-600">{d.delegationNumber}</span>
                {d.scheduledAt && <span className="text-xs text-gray-500">{formatDateTime(d.scheduledAt)}</span>}
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{d.title}</h3>
              {d.description && <p className="text-sm text-gray-600 mb-2">{d.description}</p>}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
                <span>{d.client?.name}</span>
                {d.assignedTo && <><span>·</span><span>{d.assignedTo.firstName} {d.assignedTo.lastName}</span></>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
