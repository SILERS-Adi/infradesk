import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'auto';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'auto',
      setTheme: (theme) => { applyTheme(theme); set({ theme }); },
    }),
    {
      name: 'idesk-theme',
      onRehydrateStorage: () => (state) => { if (state) applyTheme(state.theme); },
    },
  ),
);
