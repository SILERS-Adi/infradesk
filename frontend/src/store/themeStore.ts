import { create } from 'zustand';

type ThemeMode = 'light' | 'dark' | 'auto';
type AccentPreset = 'violet' | 'ocean' | 'sunset' | 'rose' | 'emerald';

interface ThemeStore {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  accent: AccentPreset;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentPreset) => void;
}

function getAutoTheme(): 'light' | 'dark' {
  // Prefer system preference if available
  if (typeof window !== 'undefined' && window.matchMedia) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    if (prefersDark.media !== 'not all') return prefersDark.matches ? 'dark' : 'light';
  }
  // Fallback to time-based
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

function applyAccent(accent: AccentPreset) {
  // 'violet' is default (no data-accent attribute needed)
  if (accent === 'violet') {
    document.documentElement.removeAttribute('data-accent');
  } else {
    document.documentElement.setAttribute('data-accent', accent);
  }
}

const stored = (localStorage.getItem('infradesk_theme') as ThemeMode) ?? 'auto';
const storedAccent = (localStorage.getItem('infradesk_accent') as AccentPreset) ?? 'violet';
const initialResolved = resolveTheme(stored);
applyTheme(initialResolved);
applyAccent(storedAccent);

export const useTheme = create<ThemeStore>((set) => ({
  mode: stored,
  resolved: initialResolved,
  accent: storedAccent,
  setMode: (mode) => {
    localStorage.setItem('infradesk_theme', mode);
    const resolved = resolveTheme(mode);
    applyTheme(resolved);
    set({ mode, resolved });
  },
  setAccent: (accent) => {
    localStorage.setItem('infradesk_accent', accent);
    applyAccent(accent);
    set({ accent });
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

// Listen for system preference changes (instant switch in auto mode)
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const state = useTheme.getState();
    if (state.mode === 'auto') {
      const resolved = getAutoTheme();
      applyTheme(resolved);
      useTheme.setState({ resolved });
    }
  });
}

export const ACCENT_PRESETS: { id: AccentPreset; label: string; color: string }[] = [
  { id: 'violet', label: 'Royal Violet', color: '#7C3AED' },
  { id: 'ocean', label: 'Ocean Blue', color: '#2563EB' },
  { id: 'sunset', label: 'Sunset Orange', color: '#EA580C' },
  { id: 'rose', label: 'Rose Premium', color: '#DB2777' },
  { id: 'emerald', label: 'Emerald Tech', color: '#059669' },
];
