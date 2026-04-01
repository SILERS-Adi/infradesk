import { type ReactNode } from 'react';
import { Inbox, ShieldOff } from 'lucide-react';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  /** Entity name for scoped empty state message (e.g. "urządzenia", "zgłoszenia") */
  scopeEntity?: string;
}

export function EmptyState({
  title = 'Brak danych',
  description = 'Nie znaleziono żadnych rekordów.',
  action, icon, scopeEntity,
}: EmptyStateProps) {
  const { isScoped } = useWorkspaceContext();

  // When scoped and no data — show access-limited message instead of "no data"
  const showScopedMessage = isScoped && scopeEntity;
  const finalTitle = showScopedMessage ? 'Brak dostępu' : title;
  const finalDescription = showScopedMessage
    ? `Nie masz dostępu do żadnych ${scopeEntity} w tym workspace. Skontaktuj się z administratorem, aby rozszerzyć uprawnienia.`
    : description;
  const finalIcon = showScopedMessage
    ? <ShieldOff style={{ width: 22, height: 22, color: 'var(--accent)' }} />
    : (icon ?? <Inbox style={{ width: 22, height: 22, color: 'var(--td)' }} />);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', textAlign: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: 'var(--rs)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: showScopedMessage ? 'var(--accent-g)' : 'var(--hover-bg)', marginBottom: 16 }}>
        {finalIcon}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: showScopedMessage ? 'var(--accent)' : 'var(--tm)' }}>{finalTitle}</div>
      <div style={{ fontSize: 12, color: 'var(--td)', marginTop: 4, maxWidth: 320 }}>{finalDescription}</div>
      {!showScopedMessage && action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
