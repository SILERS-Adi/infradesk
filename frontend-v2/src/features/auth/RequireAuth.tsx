import { Navigate, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuthStore } from '@/store/auth';

export function RequireAuth({ children }: { children: ReactElement }): ReactElement {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!user) {
    const next = location.pathname + location.search;
    const qs = next && next !== '/' ? '?next=' + encodeURIComponent(next) : '';
    return <Navigate to={'/login' + qs} replace />;
  }
  return children;
}
