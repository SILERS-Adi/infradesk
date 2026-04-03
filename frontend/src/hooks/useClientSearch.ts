/**
 * Stub — useClientSearch was removed during workspace migration.
 * Returns empty results. Client concept is now handled by Workspace.
 */
export function useClientSearch(_query: string, _enabled: boolean = true) {
  return { clients: [] as any[], isLoading: false };
}
