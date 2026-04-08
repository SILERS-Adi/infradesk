import axios from 'axios';
import { getCurrentWorkspaceId } from '../store/workspaceStore';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Always send httpOnly cookies
});

apiClient.interceptors.request.use(config => {
  // Inject workspace context header
  let wsId = getCurrentWorkspaceId();
  if (!wsId) {
    try { wsId = localStorage.getItem('infradesk_workspace'); } catch { /* localStorage unavailable */ }
  }
  if (wsId) {
    config.headers['X-Workspace-Id'] = wsId;
  }

  // CSRF token — read from cookie, send as header (Double Submit Cookie pattern)
  if (config.method && !['get', 'head', 'options'].includes(config.method.toLowerCase())) {
    const csrfToken = document.cookie.split('; ').find(c => c.startsWith('infradesk_csrf='))?.split('=')[1];
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }

  return config;
});

apiClient.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        // Refresh via httpOnly cookie — no token in body needed
        await axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        // Retry original request — new cookies are set automatically
        return apiClient(originalRequest);
      } catch {
        localStorage.removeItem('infradesk_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;

// Legacy exports — kept for backward compatibility, return null (auth is cookie-based now)
export function getStoredToken(): string | null { return null; }
export function getStoredRefreshToken(): string | null { return null; }
