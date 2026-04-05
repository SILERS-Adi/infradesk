import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { activityLogsApi } from '../../../api/activityLogs';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { formatDateTime } from '../../../utils/helpers';
import { MspCompanyFilter } from '../../../components/ui/MspCompanyFilter';

const ENTITY_COLORS: Record<string, 'blue' | 'indigo' | 'purple' | 'orange' | 'red' | 'green' | 'gray'> = {
  CLIENT: 'blue',
  LOCATION: 'indigo',
  DEVICE: 'purple',
  TICKET: 'orange',
  CREDENTIAL: 'red',
  USER: 'green',
};

const ACTION_COLORS: Record<string, 'gray' | 'green' | 'orange' | 'red' | 'blue'> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  STATUS_CHANGE: 'orange',
  LOGIN: 'gray',
  VIEW_SECRET: 'red',
  ASSIGN: 'blue',
  CLOSE: 'gray',
  COMMENT: 'gray',
  OTHER: 'gray',
};

const ENTITY_TYPES = ['CLIENT', 'LOCATION', 'DEVICE', 'TICKET', 'CREDENTIAL', 'USER'];
const ACTION_TYPES = ['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'LOGIN', 'VIEW_SECRET', 'ASSIGN', 'CLOSE', 'COMMENT', 'OTHER'];

export function ActivityLogsPage() {
  const [entityType, setEntityType] = useState('');
  const [actionType, setActionType] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['activity-logs', { entityType, actionType }],
    queryFn: () => activityLogsApi.getAll({
      entityType: entityType || undefined,
      actionType: actionType || undefined,
      limit: 200,
    }),
  });

  return (
    <div>
      <PageHeader title="Logi aktywności" subtitle={`${logs.length} wpisów`} />

      <div className="rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="p-4 flex flex-wrap gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <MspCompanyFilter value={companyFilter} onChange={setCompanyFilter} />
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
          >
            <option value="">Wszystkie encje</option>
            {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
            className="text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
          >
            <option value="">Wszystkie akcje</option>
            {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {isLoading ? <LoadingSpinner /> : (
          <div>
            {logs.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--tm)' }}>Brak logów</p>
            ) : logs.map(log => (
              <div key={log.id} className="px-6 py-3 flex items-start gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="text-xs w-32 flex-shrink-0 mt-0.5 font-mono" style={{ color: 'var(--tm)' }}>
                  {formatDateTime(log.createdAt)}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge color={ENTITY_COLORS[log.entityType] ?? 'gray'}>{log.entityType}</Badge>
                  <Badge color={ACTION_COLORS[log.actionType] ?? 'gray'}>{log.actionType}</Badge>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: 'var(--ts)' }}>{log.description}</p>
                  {log.performedBy && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--tm)' }}>
                      {log.performedBy.firstName} {log.performedBy.lastName}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
