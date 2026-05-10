import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  mustEnable2FA?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  workspaceId: string | null;

  setSession: (user: AuthUser, accessToken: string, workspaceId?: string) => void;
  setAccessToken: (token: string) => void;
  setWorkspaceId: (workspaceId: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      workspaceId: null,
      setSession: (user, accessToken, workspaceId) => set({ user, accessToken, workspaceId: workspaceId ?? null }),
      setAccessToken: (token) => set({ accessToken: token }),
      setWorkspaceId: (workspaceId) => set({ workspaceId }),
      logout: () => set({ user: null, accessToken: null, workspaceId: null }),
    }),
    { name: 'idesk-auth', partialize: (s) => ({ user: s.user, workspaceId: s.workspaceId }) },
  ),
);
