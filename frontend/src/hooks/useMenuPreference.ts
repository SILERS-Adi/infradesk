import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { menuPreferencesApi } from '../api/menuPreferences';
import { useMenuStore } from '../store/menuStore';
import { useAuth } from '../store/authStore';
import { useWorkspace } from '../store/workspaceStore';

/**
 * Fetches the user's menu layout from API and syncs to the menu store.
 * Should be mounted once in the sidebar.
 */
export function useMenuPreference() {
  const { isAuthenticated } = useAuth();
  const wsId = useWorkspace(s => s.current?.workspaceId);
  const { setLayout, setLoaded } = useMenuStore();

  const { data, isFetched } = useQuery({
    queryKey: ['menu-preferences', wsId],
    queryFn: menuPreferencesApi.get,
    enabled: !!isAuthenticated && !!wsId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isFetched) {
      setLayout(data ?? null);
      setLoaded();
    }
  }, [data, isFetched, setLayout, setLoaded]);
}

/**
 * Provides save/reset functions that handle API calls + store updates.
 */
export function useMenuActions() {
  const qc = useQueryClient();
  const store = useMenuStore();

  const save = async () => {
    store.setSaving(true);
    store.setSaveError(null);
    try {
      const layout = store.commitEdit();
      await menuPreferencesApi.save(layout);
      qc.invalidateQueries({ queryKey: ['menu-preferences'] });
    } catch (err: any) {
      store.setSaveError(err?.response?.data?.error || 'Nie udało się zapisać');
      // Re-enter edit mode with the layout that failed to save
      store.enterEditMode();
      throw err;
    } finally {
      store.setSaving(false);
    }
  };

  const reset = async () => {
    store.setSaving(true);
    try {
      await menuPreferencesApi.reset();
      store.resetLayout();
      qc.invalidateQueries({ queryKey: ['menu-preferences'] });
    } catch (err: any) {
      store.setSaveError(err?.response?.data?.error || 'Nie udało się zresetować');
      throw err;
    } finally {
      store.setSaving(false);
    }
  };

  return { save, reset };
}
