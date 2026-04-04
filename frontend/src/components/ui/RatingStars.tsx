import { useState } from 'react';
import { Star } from 'lucide-react';

interface RatingStarsProps {
  value: number | null;
  onChange?: (rating: number) => void;
  readonly?: boolean;
  size?: number;
}

export function RatingStars({ value, onChange, readonly = false, size = 20 }: RatingStarsProps) {
  const [hover, setHover] = useState(0);

  return (
    <div style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3].map(star => {
        const filled = star <= (hover || value || 0);
        return (
          <button
            key={star}
            onClick={() => !readonly && onChange?.(star)}
            onMouseEnter={() => !readonly && setHover(star)}
            onMouseLeave={() => !readonly && setHover(0)}
            disabled={readonly && !onChange}
            style={{
              background: 'none', border: 'none', padding: 1, cursor: readonly ? 'default' : 'pointer',
              transition: 'transform 0.15s',
              transform: !readonly && hover === star ? 'scale(1.2)' : 'scale(1)',
            }}
          >
            <Star
              size={size}
              fill={filled ? '#F59E0B' : 'none'}
              color={filled ? '#F59E0B' : 'var(--border)'}
              strokeWidth={filled ? 0 : 1.5}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Compact display for table cells */
export function RatingDisplay({ value, size = 14 }: { value: number | null; size?: number }) {
  if (!value) return <span style={{ color: 'var(--td)', fontSize: 11 }}>—</span>;
  return (
    <div style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3].map(star => (
        <Star
          key={star}
          size={size}
          fill={star <= value ? '#F59E0B' : 'none'}
          color={star <= value ? '#F59E0B' : 'var(--border)'}
          strokeWidth={star <= value ? 0 : 1.5}
        />
      ))}
    </div>
  );
}
