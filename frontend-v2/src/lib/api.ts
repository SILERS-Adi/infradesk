import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/auth';

export const api: AxiosInstance = axios.create({
  baseURL: '/api/v2',
  withCredentials: true, // refresh cookie is HttpOnly; sent automatically
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Iris embed mode: short-lived Bearer token injected by IrisEmbedPage on window.
  const embedToken = (typeof window !== 'undefined'
    ? (window as unknown as { __IRIS_EMBED_TOKEN__?: string }).__IRIS_EMBED_TOKEN__
    : undefined);
  if (embedToken) {
    config.headers.set('Authorization', `Bearer ${embedToken}`);
    return config;
  }
  const { accessToken, workspaceId } = useAuthStore.getState();
  if (accessToken) config.headers.set('Authorization', `Bearer ${accessToken}`);
  if (workspaceId) config.headers.set('X-Workspace-Id', workspaceId);
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const { data } = await axios.post('/api/v2/auth/refresh', null, { withCredentials: true });
    useAuthStore.getState().setAccessToken(data.accessToken);
    return data.accessToken as string;
  } catch {
    useAuthStore.getState().logout();
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (!original || original._retry) throw error;
    if (error.response?.status !== 401) throw error;
    // Don't try to refresh in embed mode (no session cookie).
    const hasEmbed = typeof window !== 'undefined' && (window as unknown as { __IRIS_EMBED_TOKEN__?: string }).__IRIS_EMBED_TOKEN__;
    if (hasEmbed) throw error;

    original._retry = true;
    refreshing ??= refreshAccessToken().finally(() => { refreshing = null; });
    const next = await refreshing;
    if (!next) throw error;
    original.headers!.Authorization = `Bearer ${next}`;
    return api.request(original);
  },
);
