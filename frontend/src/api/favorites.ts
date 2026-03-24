import apiClient from './client';

export const favoritesApi = {
  getFavoriteIds: async (): Promise<string[]> => {
    const { data } = await apiClient.get<string[]>('/clients/favorites');
    return data;
  },
  toggle: async (clientId: string): Promise<{ isFavorite: boolean }> => {
    const { data } = await apiClient.post<{ isFavorite: boolean }>(`/clients/${clientId}/favorite`, {});
    return data;
  },
};
