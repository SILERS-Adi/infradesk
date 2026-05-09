// IDCore — the living "core" of the IDCORE / InfraDesk system.
// Original design: layered energy sphere with orbits, HUD ring, particle stream.
// State-driven: idle (cyan), thinking (violet), warning (amber), critical (red).
//
// Pure SVG + CSS. No external deps.
// Ported from designer handoff (idcore.jsx) on 2026-04-27 — kept pixel-identical.

import { useEffect, useMemo, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export type IDCoreState = 'idle' | 'thinking' | 'warning' | 'critical';

export interface IDCoreMetrics {
  sla?: number;
  alerts?: number;
  devices?: number;
  sessions?: number;
}

interface CorePalette {
  name: string;
  inner: string;
  mid: string;
  outer: string;
  glow: string;
  hud: string;
  accent: string;
  pulseHz: number;
  rotateMul: number;
  jitter: number;
}

export interface IDCoreProps {
  size?: number;
  state?: IDCoreState;
  healthScore?: number;
  metrics?: IDCoreMetrics;
  voice?: number;
  showHUD?: boolean;
  showOrbits?: boolean;
  showParticles?: boolean;
  showReadout?: boolean;
  background?: string;
  ambientGlow?: boolean;
}

// ── Palettes (oklch values from designer handoff) ───────────────────────────

const CORE_PALETTES: Record<IDCoreState, CorePalette> = {
  idle: {
    name: 'STABLE',
    inner: 'oklch(88% 0.14 200)',
    mid:   'oklch(72% 0.18 215)',
    outer: 'oklch(55% 0.20 230)',
    glow:  'oklch(72% 0.18 215)',
    hud:   'oklch(75% 0.14 210)',
    accent: '#7df0ff',
    pulseHz: 0.6,
    rotateMul: 1,
    jitter: 0,
  },
  thinking: {
    name: 'IRIS · PROCESSING',
    inner: 'oklch(90% 0.13 305)',
    mid:   'oklch(70% 0.22 295)',
    outer: 'oklch(48% 0.24 290)',
    glow:  'oklch(70% 0.22 295)',
    hud:   'oklch(75% 0.16 295)',
    accent: '#c79dff',
    pulseHz: 1.6,
    rotateMul: 2.4,
    jitter: 0,
  },
  warning: {
    name: 'WARNING',
    inner: 'oklch(92% 0.13 80)',
    mid:   'oklch(78% 0.18 70)',
    outer: 'oklch(58% 0.20 55)',
    glow:  'oklch(78% 0.18 70)',
    hud:   'oklch(80% 0.16 75)',
    accent: '#ffc26b',
    pulseHz: 2.4,
    rotateMul: 1.4,
    jitter: 1,
  },
  critical: {
    name: 'CRITICAL',
    inner: 'oklch(85% 0.18 25)',
    mid:   'oklch(65% 0.24 20)',
    outer: 'oklch(48% 0.26 25)',
    glow:  'oklch(65% 0.24 20)',
    hud:   'oklch(70% 0.20 25)',
    accent: '#ff7373',
    pulseHz: 3.6,
    rotateMul: 1.8,
    jitter: 3,
  },
};

// ── useClock — rAF-based ticker. Freezes at 0 if user prefers reduced motion ──

function useClock(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return; // freeze at t=0 — static snapshot
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setT((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

// ── SVG arc helpers ─────────────────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

// ── Core sphere (plasma + iris ring + waveform) ─────────────────────────────

interface CoreSphereProps {
  size: number;
  palette: CorePalette;
  t: number;
  healthScore: number;
  voice: number;
  jitterX: number;
  jitterY: number;
}

function CoreSphere({ size, palette, t, voice, jitterX, jitterY }: CoreSphereProps) {
  const cx = size / 2;
  const cy = size / 2;
  const rGlow = size * 0.50;
  const rIris = size * 0.42;
  const rCore = size * 0.30;
  const rInner = size * 0.18;

  const breath = 1 + 0.04 * Math.sin(t * palette.pulseHz * Math.PI * 2);
  const irisRot = (t * 30 * palette.rotateMul) % 360;
  const coreRot = (-t * 18 * palette.rotateMul) % 360;
  const fastRot = (t * 90 * palette.rotateMul) % 360;

  const plasmaPath = (i: number, phase: number): string => {
    const pts: [number, number][] = [];
    const N = 18;
    for (let k = 0; k < N; k++) {
      const ang = (k / N) * Math.PI * 2;
      const wob =
        0.10 * Math.sin(ang * 3 + t * 1.2 + phase) +
        0.06 * Math.cos(ang * 5 - t * 1.7 + phase * 1.3) +
        0.04 * Math.sin(ang * 7 + t * 2.4);
      const r = rCore * (0.92 + wob * (0.5 + 0.5 * i));
      pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
    }
    let d = `M ${pts[0]![0].toFixed(2)} ${pts[0]![1].toFixed(2)}`;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k]!;
      const b = pts[(k + 1) % pts.length]!;
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      d += ` Q ${a[0].toFixed(2)} ${a[1].toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
    }
    d += ' Z';
    return d;
  };

  const irisCirc = 2 * Math.PI * rIris;
  const irisDash = `${irisCirc * 0.012} ${irisCirc * 0.018}`;

  const waveform: { x1: number; y1: number; x2: number; y2: number; op: number }[] = [];
  if (voice > 0) {
    const bars = 64;
    for (let i = 0; i < bars; i++) {
      const ang = (i / bars) * Math.PI * 2;
      const seedA = Math.sin(i * 1.7 + t * 7) * 0.5 + 0.5;
      const seedB = Math.sin(i * 0.9 - t * 4) * 0.5 + 0.5;
      const amp = (seedA * 0.6 + seedB * 0.4) * voice;
      const r1 = rCore * 1.05;
      const r2 = rCore * (1.05 + 0.18 * amp);
      waveform.push({
        x1: cx + Math.cos(ang) * r1,
        y1: cy + Math.sin(ang) * r1,
        x2: cx + Math.cos(ang) * r2,
        y2: cy + Math.sin(ang) * r2,
        op: 0.3 + 0.7 * amp,
      });
    }
  }

  const safeName = palette.name.replace(/[^a-zA-Z0-9]/g, '_');

  return (
    <g transform={`translate(${jitterX}, ${jitterY})`}>
      <defs>
        <radialGradient id={`coreGrad-${safeName}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor={palette.inner} stopOpacity="1" />
          <stop offset="55%" stopColor={palette.mid}   stopOpacity="0.95" />
          <stop offset="100%" stopColor={palette.outer} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`coreInner-${safeName}`} cx="50%" cy="40%" r="40%">
          <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="40%" stopColor={palette.inner} stopOpacity="0.6" />
          <stop offset="100%" stopColor={palette.mid} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`coreHalo-${safeName}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor={palette.glow} stopOpacity="0.55" />
          <stop offset="60%" stopColor={palette.glow} stopOpacity="0.10" />
          <stop offset="100%" stopColor={palette.glow} stopOpacity="0" />
        </radialGradient>
        <filter id={`softBlur-${safeName}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={size * 0.012} />
        </filter>
        <filter id={`heavyBlur-${safeName}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={size * 0.04} />
        </filter>
        <clipPath id={`coreClip-${safeName}`}>
          <circle cx={cx} cy={cy} r={rCore * 1.05} />
        </clipPath>
      </defs>

      <g transform={`translate(${cx} ${cy}) scale(${breath}) translate(${-cx} ${-cy})`}>
        <circle cx={cx} cy={cy} r={rGlow} fill={`url(#coreHalo-${safeName})`} />
      </g>

      <g transform={`rotate(${irisRot} ${cx} ${cy})`} opacity="0.85">
        <circle cx={cx} cy={cy} r={rIris} fill="none" stroke={palette.hud}
          strokeWidth={size * 0.006} strokeDasharray={irisDash} strokeLinecap="round" />
      </g>
      <g transform={`rotate(${-fastRot} ${cx} ${cy})`} opacity="0.6">
        <circle cx={cx} cy={cy} r={rIris * 0.94} fill="none" stroke={palette.hud}
          strokeWidth={size * 0.0025} strokeDasharray={`${irisCirc * 0.002} ${irisCirc * 0.05}`} />
      </g>

      <circle cx={cx} cy={cy} r={rCore * 1.2} fill={`url(#coreGrad-${safeName})`}
        filter={`url(#heavyBlur-${safeName})`} opacity="0.7" />

      <g clipPath={`url(#coreClip-${safeName})`}>
        <circle cx={cx} cy={cy} r={rCore} fill={palette.outer} opacity="0.25" />
        <g transform={`rotate(${coreRot} ${cx} ${cy})`} style={{ mixBlendMode: 'screen' }}>
          <path d={plasmaPath(0, 0)} fill={palette.mid} opacity="0.6" filter={`url(#softBlur-${safeName})`} />
        </g>
        <g transform={`rotate(${-coreRot * 1.4} ${cx} ${cy})`} style={{ mixBlendMode: 'screen' }}>
          <path d={plasmaPath(1, 1.7)} fill={palette.inner} opacity="0.55" filter={`url(#softBlur-${safeName})`} />
        </g>
        <g transform={`rotate(${coreRot * 0.7 + 60} ${cx} ${cy})`} style={{ mixBlendMode: 'screen' }}>
          <path d={plasmaPath(0.6, 3.1)} fill={palette.mid} opacity="0.5" filter={`url(#softBlur-${safeName})`} />
        </g>
        <circle cx={cx} cy={cy - rCore * 0.2} r={rInner} fill={`url(#coreInner-${safeName})`} />
      </g>

      <circle cx={cx} cy={cy} r={rCore} fill="none" stroke={palette.inner}
        strokeWidth={size * 0.004} opacity="0.75" />

      {waveform.map((w, i) => (
        <line key={i} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
          stroke={palette.accent} strokeWidth={size * 0.003} strokeLinecap="round"
          opacity={w.op * 0.85} />
      ))}

      <ellipse
        cx={cx - rCore * 0.25} cy={cy - rCore * 0.45}
        rx={rCore * 0.30} ry={rCore * 0.16}
        fill="#ffffff" opacity="0.35" filter={`url(#softBlur-${safeName})`}
      />
    </g>
  );
}

// ── HUD ring (outer dashed arc + tick marks + sweeping pointer) ─────────────

interface HUDRingProps { size: number; palette: CorePalette; t: number; healthScore: number }

function HUDRing({ size, palette, t, healthScore }: HUDRingProps) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.485;
  const rTicks = size * 0.465;
  const rArc = size * 0.495;

  const tickCount = 64;
  const ticks = [];
  for (let i = 0; i < tickCount; i++) {
    const ang = (i / tickCount) * Math.PI * 2 - Math.PI / 2;
    const big = i % 8 === 0;
    const r1 = rTicks - (big ? size * 0.020 : size * 0.010);
    const r2 = rTicks;
    ticks.push({
      x1: cx + Math.cos(ang) * r1, y1: cy + Math.sin(ang) * r1,
      x2: cx + Math.cos(ang) * r2, y2: cy + Math.sin(ang) * r2,
      big,
    });
  }

  const arcLen = (healthScore / 100) * 360;
  const arcPath = describeArc(cx, cy, rArc, -90, -90 + arcLen);

  const sweep = (t * 30) % 360;
  const sweepRad = (sweep * Math.PI) / 180;
  const sx1 = cx + Math.cos(sweepRad - Math.PI / 2) * (rArc - size * 0.02);
  const sy1 = cy + Math.sin(sweepRad - Math.PI / 2) * (rArc - size * 0.02);
  const sx2 = cx + Math.cos(sweepRad - Math.PI / 2) * (rArc + size * 0.005);
  const sy2 = cy + Math.sin(sweepRad - Math.PI / 2) * (rArc + size * 0.005);

  return (
    <g>
      <circle cx={cx} cy={cy} r={rOuter} fill="none"
        stroke={palette.hud} strokeWidth={size * 0.001} opacity="0.25" />
      {ticks.map((tk, i) => (
        <line key={i} x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2}
          stroke={palette.hud}
          strokeWidth={tk.big ? size * 0.003 : size * 0.0015}
          opacity={tk.big ? 0.7 : 0.35} />
      ))}
      <circle cx={cx} cy={cy} r={rArc} fill="none"
        stroke={palette.hud} strokeWidth={size * 0.004} opacity="0.10" />
      <path d={arcPath} fill="none" stroke={palette.accent}
        strokeWidth={size * 0.005} strokeLinecap="round" opacity="0.95" />
      <line x1={sx1} y1={sy1} x2={sx2} y2={sy2}
        stroke={palette.accent} strokeWidth={size * 0.004}
        strokeLinecap="round" opacity="0.8" />
    </g>
  );
}

// ── Orbiting metric chips ───────────────────────────────────────────────────

interface MetricOrbitProps { size: number; palette: CorePalette; t: number; metrics: IDCoreMetrics }

function MetricOrbit({ size, palette, t, metrics }: MetricOrbitProps) {
  const cx = size / 2;
  const cy = size / 2;
  const items = [
    { label: 'SLA',      value: `${metrics.sla ?? 94}%`,        radius: size * 0.40, speed: 0.18, phase: 0 },
    { label: 'ALERTS',   value: String(metrics.alerts ?? 0),    radius: size * 0.40, speed: 0.18, phase: Math.PI * 0.5 },
    { label: 'DEVICES',  value: String(metrics.devices ?? 59),  radius: size * 0.40, speed: 0.18, phase: Math.PI },
    { label: 'SESSIONS', value: String(metrics.sessions ?? 8),  radius: size * 0.40, speed: 0.18, phase: Math.PI * 1.5 },
  ];

  return (
    <g>
      {items.map((it, i) => {
        const ang = it.phase + t * it.speed;
        const x = cx + Math.cos(ang) * it.radius;
        const y = cy + Math.sin(ang) * it.radius;
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <g transform={`translate(${-size * 0.05} ${-size * 0.025})`}>
              <rect x="0" y="0" width={size * 0.10} height={size * 0.05}
                rx={size * 0.012} fill="rgba(0,0,0,0.55)"
                stroke={palette.hud} strokeWidth={size * 0.0015} opacity="0.95" />
              <text x={size * 0.05} y={size * 0.018} fill={palette.hud}
                fontSize={size * 0.011} textAnchor="middle"
                fontFamily="JetBrains Mono, ui-monospace, monospace"
                letterSpacing="0.12em" opacity="0.7">{it.label}</text>
              <text x={size * 0.05} y={size * 0.040} fill={palette.accent}
                fontSize={size * 0.018} textAnchor="middle"
                fontFamily="JetBrains Mono, ui-monospace, monospace"
                fontWeight="600">{it.value}</text>
            </g>
          </g>
        );
      })}
    </g>
  );
}

// ── Particle field ──────────────────────────────────────────────────────────

interface ParticlesProps { size: number; palette: CorePalette; t: number; count?: number }

function Particles({ size, palette, t, count = 28 }: ParticlesProps) {
  const cx = size / 2;
  const cy = size / 2;
  const dots = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        rBase: size * (0.30 + Math.random() * 0.18),
        speed: 0.05 + Math.random() * 0.20,
        phase: Math.random() * Math.PI * 2,
        sizeMul: 0.5 + Math.random() * 1.4,
        op: 0.25 + Math.random() * 0.55,
        eccent: 0.85 + Math.random() * 0.3,
        tilt: Math.random() * Math.PI,
      });
    }
    return arr;
  }, [count, size]);

  return (
    <g>
      {dots.map((d, i) => {
        const ang = d.phase + t * d.speed;
        const x0 = Math.cos(ang) * d.rBase;
        const y0 = Math.sin(ang) * d.rBase * d.eccent;
        const ct = Math.cos(d.tilt), st = Math.sin(d.tilt);
        const x = cx + x0 * ct - y0 * st;
        const y = cy + x0 * st + y0 * ct;
        return (
          <circle key={i} cx={x} cy={y} r={size * 0.0028 * d.sizeMul}
            fill={palette.accent} opacity={d.op} />
        );
      })}
    </g>
  );
}

// ── Center readout ──────────────────────────────────────────────────────────

interface ReadoutProps { size: number; palette: CorePalette; healthScore: number; label: string }

function Readout({ size, palette, healthScore, label }: ReadoutProps) {
  const cx = size / 2;
  const cy = size / 2;
  const display = Math.round(healthScore);
  return (
    <g>
      <text x={cx} y={cy + size * 0.005} fill="#ffffff"
        fontSize={size * 0.16} fontWeight="300"
        fontFamily="'Space Grotesk', Inter, system-ui, sans-serif"
        textAnchor="middle" dominantBaseline="middle"
        letterSpacing="-0.02em"
        style={{ textShadow: `0 0 ${size * 0.04}px ${palette.accent}` }}>
        {display}
      </text>
      <text x={cx} y={cy + size * 0.10} fill={palette.accent}
        fontSize={size * 0.022}
        fontFamily="JetBrains Mono, ui-monospace, monospace"
        textAnchor="middle" letterSpacing="0.32em" opacity="0.95">
        {label}
      </text>
      <text x={cx} y={cy - size * 0.085} fill="rgba(255,255,255,0.55)"
        fontSize={size * 0.018}
        fontFamily="JetBrains Mono, ui-monospace, monospace"
        textAnchor="middle" letterSpacing="0.32em">
        ID·CORE
      </text>
    </g>
  );
}

// ── Main IDCore composite ───────────────────────────────────────────────────

export function IDCore({
  size = 360,
  state = 'idle',
  healthScore = 85,
  metrics = { sla: 94, alerts: 0, devices: 59, sessions: 8 },
  voice = 0,
  showHUD = true,
  showOrbits = true,
  showParticles = true,
  showReadout = true,
  background = 'transparent',
  ambientGlow = true,
}: IDCoreProps) {
  const t = useClock();
  const palette = CORE_PALETTES[state] ?? CORE_PALETTES.idle;

  const jitterX = palette.jitter ? Math.sin(t * 35) * palette.jitter * 0.6 : 0;
  const jitterY = palette.jitter ? Math.cos(t * 41) * palette.jitter * 0.6 : 0;

  return (
    <div
      role="img"
      aria-label={`System status: ${palette.name}`}
      style={{
        position: 'relative',
        width: size, height: size,
        background, borderRadius: '50%',
      }}
    >
      {ambientGlow && (
        <div style={{
          position: 'absolute', inset: -size * 0.2,
          background: `radial-gradient(circle, ${palette.glow} 0%, transparent 60%)`,
          opacity: 0.35, filter: 'blur(20px)',
          pointerEvents: 'none', mixBlendMode: 'screen',
        }} />
      )}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ display: 'block', position: 'relative', overflow: 'visible' }}>
        {showHUD && <HUDRing size={size} palette={palette} t={t} healthScore={healthScore} />}
        {showParticles && <Particles size={size} palette={palette} t={t} />}
        <CoreSphere size={size} palette={palette} t={t}
          healthScore={healthScore} voice={voice}
          jitterX={jitterX} jitterY={jitterY} />
        {showReadout && <Readout size={size} palette={palette} healthScore={healthScore} label={palette.name} />}
        {showOrbits && <MetricOrbit size={size} palette={palette} t={t} metrics={metrics} />}
      </svg>
    </div>
  );
}

export default IDCore;
export { CORE_PALETTES };
