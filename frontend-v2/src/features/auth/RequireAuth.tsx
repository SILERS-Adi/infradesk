import { Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuthStore } from '@/store/auth';

export function RequireAuth({ children }: { children: ReactElement }): ReactElement {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
