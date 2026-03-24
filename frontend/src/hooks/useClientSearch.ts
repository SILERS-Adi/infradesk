import { useQuery } from '@tanstack/react-query';
import { clientsApi } from '../api/clients';
import { useDebounce } from './useDebounce';
import type { Client } from '../types';

/**
 * Server-side client search with debouncing.
 * - Empty search: returns first 8 clients
 * - Typed search: debounces 350ms then queries backend
 */
export function useClientSearch(search: string, enabled = true): {
  clients: Client[];
  isLoading: boolean;
} {
  const debouncedSearch = useDebounce(search.trim(), 350);

  const { data = [], isLoading } = useQuery({
    queryKey: ['clients', 'search', debouncedSearch],
    queryFn: () => clientsApi.getAll({
      search: debouncedSearch || undefined,
      limit: debouncedSearch ? 30 : 8,
    }),
    enabled,
    staleTime: 10_000,
  });

  return { clients: data, isLoading };
}
