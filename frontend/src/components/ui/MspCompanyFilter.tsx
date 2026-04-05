import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { operatorApi } from '../../api/operator';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';

interface MspCompanyFilterProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Company filter dropdown — only renders for MSP workspace type.
 * Returns null for internal_it and client.
 */
export function MspCompanyFilter({ value, onChange }: MspCompanyFilterProps) {
  const { wsType } = useWorkspaceContext();

  const { data: clients } = useQuery({
    queryKey: ['operator', 'clients'],
    queryFn: operatorApi.getClients,
    enabled: wsType === 'msp',
  });

  if (wsType !== 'msp') return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Building2 size={14} color="var(--tm)" />
      <select
        className="input"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ minWidth: 200, fontSize: 12, padding: '6px 10px' }}
      >
        <option value="">Wszystkie firmy</option>
        {(clients ?? []).map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}
