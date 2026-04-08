import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';

export function ScopedAccessBanner() {
  const { isScoped } = useWorkspaceContext();

  if (!isScoped) return null;

  return (
    <div style={{
      padding: '10px 16px',
      marginBottom: '16px',
      borderRadius: '8px',
      border: '1px solid rgba(234, 179, 8, 0.3)',
      background: 'rgba(234, 179, 8, 0.08)',
      color: 'var(--t)',
      fontSize: '13px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    }}>
      <span style={{ fontSize: '16px' }}>&#128274;</span>
      <span>
        Twój dostęp jest ograniczony do wybranych lokalizacji i urządzeń.
        Skontaktuj się z administratorem, aby rozszerzyć uprawnienia.
      </span>
    </div>
  );
}
