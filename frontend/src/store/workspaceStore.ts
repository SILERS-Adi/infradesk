import { create } from 'zustand';
import type { WorkspaceMembership, MemberRole, ScopeType } from '../types';

const STORAGE_KEY = 'infradesk_workspace';

/** Simulated membership for preview mode */
export interface PreviewMembership {
  userName: string;
  role: string;
  scopeType: string;
  grants: { resourceType: string; resourceId: string }[];
}

interface WorkspaceStore {
  /** All workspaces the user has membership in */
  workspaces: WorkspaceMembership[];
  /** Currently active workspace */
  current: WorkspaceMembership | null;
  /** True until setWorkspaces / markResolved is called for the first time */
  isLoading: boolean;
  /** True once workspace resolution finished (success, empty, or error) */
  resolved: boolean;
  /** Preview mode — simulates another user's access */
  preview: PreviewMembership | null;

  /** Set workspaces from API response and auto-select current */
  setWorkspaces: (workspaces: WorkspaceMembership[]) => void;
  /** Mark resolution complete without data (e.g. API error) */
  markResolved: () => void;
  /** Switch to a different workspace */
  switchWorkspace: (workspaceId: string) => void;
  /** Enter preview mode */
  startPreview: (preview: PreviewMembership) => void;
  /** Exit preview mode */
  stopPreview: () => void;
  /** Clear on logout */
  clear: () => void;
}

export const useWorkspace = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  current: null,
  isLoading: true,
  resolved: false,
  preview: null,

  setWorkspaces: (workspaces) => {
    // Restore last selected workspace from localStorage
    const storedId = localStorage.getItem(STORAGE_KEY);
    const restored = storedId ? workspaces.find(w => w.workspaceId === storedId) : null;

    // Priority: stored > isDefault > first
    const current = restored ?? workspaces.find(w => w.isDefault) ?? workspaces[0] ?? null;

    if (current) {
      localStorage.setItem(STORAGE_KEY, current.workspaceId);
    }

    set({ workspaces, current, isLoading: false, resolved: true });
  },

  markResolved: () => {
    set({ isLoading: false, resolved: true });
  },

  switchWorkspace: (workspaceId) => {
    const ws = get().workspaces.find(w => w.workspaceId === workspaceId);
    if (ws) {
      localStorage.setItem(STORAGE_KEY, workspaceId);
      set({ current: ws });
    }
  },

  startPreview: (preview) => set({ preview }),
  stopPreview: () => set({ preview: null }),

  clear: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ workspaces: [], current: null, isLoading: true, resolved: false, preview: null });
  },
}));

/** Convenience helpers */
export function getCurrentWorkspaceId(): string | null {
  return useWorkspace.getState().current?.workspaceId ?? null;
}

export function getCurrentRole(): MemberRole | null {
  return useWorkspace.getState().current?.role ?? null;
}

export function getCurrentScopeType(): ScopeType | null {
  return useWorkspace.getState().current?.scopeType ?? null;
}
