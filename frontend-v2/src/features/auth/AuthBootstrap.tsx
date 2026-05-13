import { useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import { useAuthStore } from '@/store/auth';

// Po page reload `accessToken` znika (only-in-memory), ale `user` w localStorage zostaje.
// Bez tego komponentu pierwsza fala queries leci bez tokena i wala 401 zanim axios
// zdąży odświeżyć. Tu czekamy na jeden refresh przed renderem dzieci.
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const logout = useAuthStore((s) => s.logout);
  const needsBootstrap = !!user && !accessToken;
  const [ready, setReady] = useState(!needsBootstrap);

  useEffect(() => {
    if (!needsBootstrap) return;
    let cancelled = false;
    // setReady(true) PRZED setAccessToken/logout — inaczej store update
    // triggeruje re-render, useEffect cleanup ustawia cancelled=true,
    // a .finally() wykonuje się PO cleanup i guard blokuje setReady →
    // wieczny spinner. Deps celowo puste: effect ma odpalić raz przy mount.
    axios
      .post('/api/v2/auth/refresh', null, { withCredentials: true })
      .then((r) => {
        if (cancelled) return;
        setReady(true);
        setAccessToken(r.data.accessToken);
      })
      .catch(() => {
        if (cancelled) return;
        setReady(true);
        logout();
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: 'var(--tx3)' }} />
      </div>
    );
  }
  return <>{children}</>;
}
