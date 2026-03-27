import { create } from 'zustand';

type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeStore {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

function getAutoTheme(): 'light' | 'dark' {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 20 ? 'light' : 'dark';
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'auto') return getAutoTheme();
  return mode;
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
}

const stored = (localStorage.getItem('infradesk_theme') as ThemeMode) ?? 'dark';
const initialResolved = resolveTheme(stored);
applyTheme(initialResolved);

export const useTheme = create<ThemeStore>((set) => ({
  mode: stored,
  resolved: initialResolved,
  setMode: (mode) => {
    localStorage.setItem('infradesk_theme', mode);
    const resolved = resolveTheme(mode);
    applyTheme(resolved);
    set({ mode, resolved });
  },
}));

// Auto-update every minute when in auto mode
setInterval(() => {
  const state = useTheme.getState();
  if (state.mode === 'auto') {
    const resolved = getAutoTheme();
    if (resolved !== state.resolved) {
      applyTheme(resolved);
      useTheme.setState({ resolved });
    }
  }
}, 60_000);
