interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="page-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: '40px', opacity: 0.25, marginBottom: '12px' }}>&#9888;</div>
      <h3 style={{ color: 'var(--t)', margin: '0 0 8px', fontSize: '16px', fontWeight: 600 }}>
        Nie udało się załadować danych
      </h3>
      <p style={{ color: 'var(--tm)', margin: '0 0 16px', fontSize: '14px' }}>
        {message || 'Wystąpił błąd podczas pobierania danych. Sprawdź połączenie i spróbuj ponownie.'}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn btn-secondary"
          style={{
            padding: '8px 20px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--t)',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Spróbuj ponownie
        </button>
      )}
    </div>
  );
}
