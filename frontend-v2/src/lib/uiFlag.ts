/**
 * Silers Design System feature flag dla InfraDesk (Faza 2D Batch 1).
 *
 * Aktywacja:
 *   - URL `?ui=new` → włącza DS shell (zapisuje w localStorage, działa cross-route)
 *   - URL `?ui=legacy` → wyłącza
 *   - Bez parametru → czyta z localStorage (default `legacy`)
 *
 * Rollback: dodaj `?ui=legacy` do URL lub wyczyść localStorage["sd-ui"].
 *
 * Hook `useUiFlag()` reaguje na zmiany URL i StorageEvent.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export type UiVariant = 'new' | 'legacy';

const STORAGE_KEY = 'sd-ui';

function readSync(): UiVariant {
  if (typeof window === 'undefined') return 'legacy';

  // URL param ma priorytet — i jednocześnie ustawia persistent storage
  const param = new URLSearchParams(window.location.search).get('ui');
  if (param === 'new') {
    try { localStorage.setItem(STORAGE_KEY, 'new'); } catch { /* ignore */ }
    return 'new';
  }
  if (param === 'legacy') {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return 'legacy';
  }

  try {
    return localStorage.getItem(STORAGE_KEY) === 'new' ? 'new' : 'legacy';
  } catch {
    return 'legacy';
  }
}

export function useUiFlag(): UiVariant {
  const location = useLocation();
  const [variant, setVariant] = useState<UiVariant>(readSync);

  // Reaguj na zmiany URL (nawigacja React Router)
  useEffect(() => {
    setVariant(readSync());
  }, [location.search, location.pathname]);

  // Reaguj na storage events (toggle z innej karty lub setUiFlag w tej samej)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) {
        setVariant(readSync());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return variant;
}

export function setUiFlag(variant: UiVariant): void {
  try {
    if (variant === 'new') localStorage.setItem(STORAGE_KEY, 'new');
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
  // Wymuszamy re-render w bieżącej karcie — natywny StorageEvent fires tylko
  // w INNYCH kartach. Bieżąca musi nasłuchiwać własnego dispatchEvent.
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
}

/** Sync read — gdy potrzeba flagi poza komponentem React. */
export function getUiFlag(): UiVariant {
  return readSync();
}
