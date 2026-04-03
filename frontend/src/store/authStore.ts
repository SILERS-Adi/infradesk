import { createContext, useContext, useState, useEffect, useCallback, type ReactNode, createElement } from 'react';
import type { User } from '../types';
import { unsubscribeFromPush } from '../utils/pushNotifications';
import { useWorkspace } from './workspaceStore';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'infradesk_access_token',
  REFRESH_TOKEN: 'infradesk_refresh_token',
  USER: 'infradesk_user',
};

/** Decode JWT payload without verification (for reading claims like isSuperAdmin) */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1];
    return JSON.parse(atob(base64));
  } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    const userStr = localStorage.getItem(STORAGE_KEYS.USER);

    if (accessToken && userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        // Merge isSuperAdmin from JWT if missing in cached user
        if (user.isSuperAdmin == null) {
          const jwt = decodeJwtPayload(accessToken);
          if (jwt?.isSuperAdmin) user.isSuperAdmin = true;
        }
        setState({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch {
        setState(s => ({ ...s, isLoading: false }));
      }
    } else {
      // No localStorage tokens — try cookie-based session (cross-subdomain)
      const hasCookie = document.cookie.includes('infradesk_logged_in=1');
      if (hasCookie) {
        // Cookie exists but no localStorage — we're on a different subdomain
        fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
          .then(r => { if (!r.ok) throw new Error(); return r.json(); })
          .then(data => {
            localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.accessToken);
            localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);
            // Fetch user profile
            return fetch('/api/auth/me', { headers: { Authorization: `Bearer ${data.accessToken}` } });
          })
          .then(r => { if (!r.ok) throw new Error(); return r.json(); })
          .then(user => {
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
            setState({ user, accessToken: localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN), refreshToken: localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN), isAuthenticated: true, isLoading: false });
          })
          .catch(() => setState(s => ({ ...s, isLoading: false })));
      } else {
        setState(s => ({ ...s, isLoading: false }));
      }
    }
  }, []);

  const setTokens = useCallback((accessToken: string, refreshToken: string) => {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    setState(s => ({ ...s, accessToken, refreshToken, isAuthenticated: true }));
  }, []);

  const setUser = useCallback((user: User) => {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    setState(s => ({ ...s, user, isAuthenticated: true }));
  }, []);

  const logout = useCallback(() => {
    unsubscribeFromPush().catch(() => {});
    // Clear server cookies (cross-subdomain)
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    useWorkspace.getState().clear();
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  return createElement(
    AuthContext.Provider,
    { value: { ...state, setTokens, setUser, logout } },
    children
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
}
