import { Navigate } from 'react-router-dom';
import { useMyPermissions, canSeeModule } from '../../hooks/useMyPermissions';

interface Props {
  moduleKey: string;
  children: React.ReactNode;
  /** Where to redirect when user lacks permission. Default: /dashboard */
  fallback?: string;
}

/**
 * Route-level guard: blocks rendering children if user lacks access to the module.
 * Guards against direct URL access bypassing sidebar filtering.
 */
export function RequireModule({ moduleKey, children, fallback = '/dashboard' }: Props) {
  const { data: perms, isLoading } = useMyPermissions();

  // While loading, don't redirect — show nothing briefly
  if (isLoading) return null;

  if (!canSeeModule(perms, moduleKey)) {
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
