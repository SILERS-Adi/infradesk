import { createContext, useContext, useState, useEffect, useCallback, type ReactNode, createElement } from 'react';
import type { User } from '../types';
import { unsubscribeFromPush } from '../utils/pushNotifications';
import { useWorkspace } from './workspaceStore';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_KEY = 'infradesk_user';

// Legacy cleanup — remove tokens that were previously stored in localStorage
function cleanupLegacyStorage() {
  localStorage.removeItem('infradesk_access_token');
  localStorage.removeItem('infradesk_refresh_token');
}

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
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    cleanupLegacyStorage();

    // Auth is now cookie-based (httpOnly). Check if we have a valid session:
    // 1. Check infradesk_logged_in cookie (non-httpOnly, set by backend)
    // 2. If present, fetch /api/auth/me to get user data
    const hasCookie = document.cookie.includes('infradesk_logged_in=1');
    const cachedUserStr = localStorage.getItem(USER_KEY);

    if (hasCookie && cachedUserStr) {
      // Fast path: use cached user data, then revalidate in background
      try {
        const user = JSON.parse(cachedUserStr) as User;
        setState({ user, isAuthenticated: true, isLoading: false });
      } catch {
        setState(s => ({ ...s, isLoading: false }));
      }
      // Background revalidate
      fetch('/api/auth/me', { credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(user => {
          localStorage.setItem(USER_KEY, JSON.stringify(user));
          setState({ user, isAuthenticated: true, isLoading: false });
        })
        .catch(() => {
          // Session expired — try refresh via cookie
          fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(() => fetch('/api/auth/me', { credentials: 'include' }))
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(user => {
              localStorage.setItem(USER_KEY, JSON.stringify(user));
              setState({ user, isAuthenticated: true, isLoading: false });
            })
            .catch(() => {
              localStorage.removeItem(USER_KEY);
              setState({ user: null, isAuthenticated: false, isLoading: false });
            });
        });
    } else if (hasCookie) {
      // Cookie exists but no cached user — fetch from server
      fetch('/api/auth/me', { credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(user => {
          localStorage.setItem(USER_KEY, JSON.stringify(user));
          setState({ user, isAuthenticated: true, isLoading: false });
        })
        .catch(() => setState(s => ({ ...s, isLoading: false })));
    } else {
      setState(s => ({ ...s, isLoading: false }));
    }
  }, []);

  // setTokens: called after login/refresh — tokens are in httpOnly cookies (set by server),
  // we just need to update local state. Tokens params are kept for API compatibility but not stored.
  const setTokens = useCallback((_accessToken: string, _refreshToken: string) => {
    setState(s => ({ ...s, isAuthenticated: true }));
  }, []);

  const setUser = useCallback((user: User) => {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setState(s => ({ ...s, user, isAuthenticated: true }));
  }, []);

  const logout = useCallback(() => {
    unsubscribeFromPush().catch(() => {});
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    useWorkspace.getState().clear();
    localStorage.removeItem(USER_KEY);
    setState({ user: null, isAuthenticated: false, isLoading: false });
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

// These return null now — auth is cookie-based. Kept for backward compat with API client interceptor.
export function getStoredToken(): string | null {
  return null;
}

export function getStoredRefreshToken(): string | null {
  return null;
}
