import { useEffect, useCallback } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Warns user about unsaved changes when navigating away.
 * Uses both React Router blocker (SPA navigation) and beforeunload (tab close).
 *
 * @param isDirty - whether the form has unsaved changes
 * @param message - custom message (used in beforeunload, browsers may override)
 */
export function useUnsavedChanges(isDirty: boolean, message = 'Masz niezapisane zmiany. Czy na pewno chcesz opuścić tę stronę?') {
  // Block SPA navigation via React Router
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (blocker.state === 'blocked') {
      const confirmed = window.confirm(message);
      if (confirmed) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker, message]);

  // Block browser navigation (tab close, back button, refresh)
  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = message;
    }
  }, [isDirty, message]);

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);
}
