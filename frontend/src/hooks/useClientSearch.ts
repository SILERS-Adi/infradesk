import { useQuery } from '@tanstack/react-query';
import { operatorApi } from '../api/operator';

/**
 * Search operator clients (workspace relations) by name.
 * Used in UserForm when adding a CLIENT-type user to link them to a client workspace.
 */
export function useClientSearch(query: string, enabled: boolean = true) {
  const { data: allClients = [], isLoading } = useQuery({
    queryKey: ['operator-clients-search'],
    queryFn: () => operatorApi.getClients(),
    enabled,
    staleTime: 60_000,
  });

  const q = query.toLowerCase().trim();
  const clients = q
    ? allClients.filter(c => c.name.toLowerCase().includes(q))
    : allClients;

  return { clients, isLoading };
}
