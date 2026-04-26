interface GaugeProps {
  pct: number;           // 0-100
  size?: number;         // px
  label?: string;        // under %
  thresholds?: { ok?: number; wn?: number; er?: number }; // for color switching
}

/**
 * Radial SVG gauge, 270deg sweep starting at 135deg (bottom-left).
 * Colour switches per threshold: >= ok → green, >= wn → pri, >= er → warning, else danger.
 */
export function Gauge({ pct, size = 180, label = '', thresholds = { ok: 90, wn: 50, er: 25 } }: GaugeProps) {
  const cx = size / 2;
  const r = size * 0.38;
  const sw = size * 0.07;
  const startAngle = 135;
  const sweep = 270;

  const toRad = (d: number) => (d * Math.PI) / 180;
  const pt = (a: number) => ({ x: cx + r * Math.cos(toRad(a)), y: cx + r * Math.sin(toRad(a)) });

  const s = pt(startAngle);
  const e = pt(startAngle + sweep);
  const bgPath = `M${s.x} ${s.y}A${r} ${r} 0 1 1 ${e.x} ${e.y}`;

  const clamped = Math.min(100, Math.max(0, pct));
  const fillAngle = startAngle + (sweep * clamped) / 100;
  const fe = pt(fillAngle);
  const largeArc = clamped > 50 ? 1 : 0;
  const fillPath = `M${s.x} ${s.y}A${r} ${r} 0 ${largeArc} 1 ${fe.x} ${fe.y}`;

  const color =
    clamped >= (thresholds.ok ?? 90) ? 'var(--ok)' :
    clamped >= (thresholds.wn ?? 50) ? 'var(--pri)' :
    clamped >= (thresholds.er ?? 25) ? 'var(--wn)' : 'var(--er)';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <filter id={`gauge-glow-${size}`}>
            <feGaussianBlur stdDeviation="3" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={bgPath} fill="none" stroke="var(--bd)" strokeWidth={sw} strokeLinecap="round" />
        {clamped > 0 && (
          <path
            d={fillPath}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            filter={`url(#gauge-glow-${size})`}
            style={{ transition: 'all .8s cubic-bezier(.4,0,.2,1)' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-black tabular-nums" style={{ fontSize: size * 0.22, color, lineHeight: 1 }}>
          {Math.round(clamped)}%
        </span>
        {label && <span className="text-[11px] font-semibold text-tx3 mt-1">{label}</span>}
      </div>
    </div>
  );
}
