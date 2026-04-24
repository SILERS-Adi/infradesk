/**
 * IrisCore — port of V1 IdCore v7 (client-facing panel core).
 * Canvas-based, 4 layers:
 *   1) Outer segmented ring (30 segments, per-seed breath)
 *   2) Energy flow arc (single traveling arc, 5s easeInOut loop)
 *   3) Score ring with gap at bottom + 16 tick marks
 *   4) Inner AI network (1 hub + 7 satellites + edges + 2-3 packets with trails)
 *
 * V2 API wrapper: size enum sm|md|lg|hero + state variants.
 */

import * as React from 'react';

export type IrisStatus = 'ok' | 'warning' | 'critical' | 'offline';
export type IrisState =
  | 'idle'
  | 'thinking'
  | 'active'
  | 'speaking'
  | 'listening'
  | 'error';
export type IrisSize = 'sm' | 'md' | 'lg' | 'hero';

interface Props {
  size?: IrisSize;
  score?: number;
  status?: IrisStatus;
  aiActive?: boolean;
  alerts?: number;
  state?: IrisState;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
  /** Not used in V1-port canvas path — kept for API compat. */
  plasmaAsset?: string;
}

const SIZE_PX: Record<IrisSize, number> = { sm: 28, md: 56, lg: 96, hero: 200 };

type RGB = [number, number, number];
interface Colors { primary: RGB; accent: RGB; glow: RGB }

function colorsFor(status: IrisStatus, aiActive: boolean): Colors {
  if (status === 'offline')  return { primary: [107, 114, 128], accent: [107, 114, 128], glow: [107, 114, 128] };
  if (status === 'warning')  return { primary: [245, 158, 11], accent: [251, 191, 36], glow: [252, 211, 77] };
  if (status === 'critical') return { primary: [239, 68, 68],  accent: [248, 113, 113], glow: [252, 165, 165] };
  if (aiActive)              return { primary: [59, 130, 246], accent: [34, 211, 238],  glow: [147, 197, 253] };
  return { primary: [59, 130, 246], accent: [96, 165, 250], glow: [147, 197, 253] };
}

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

interface Node { x: number; y: number; vx: number; vy: number; phase: number; pulse: number; }
interface Edge { a: number; b: number; }
interface Packet { edge: number; progress: number; speed: number; forward: boolean; }
interface SegmentSeed { baseOffset: number; freq: number; amp: number; }

const easeInOut = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function buildNetwork(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  nodes.push({ x: 0, y: 0, vx: 0, vy: 0, phase: 0, pulse: 0 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.25;
    const r = 0.48 + (i % 2 === 0 ? 0.05 : -0.03);
    nodes.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      vx: (Math.random() - 0.5) * 0.00012,
      vy: (Math.random() - 0.5) * 0.00012,
      phase: Math.random() * Math.PI * 2,
      pulse: 0,
    });
  }
  const edges: Edge[] = [];
  for (let i = 1; i <= 7; i++) edges.push({ a: 0, b: i });
  for (let i = 1; i <= 7; i++) edges.push({ a: i, b: i === 7 ? 1 : i + 1 });
  return { nodes, edges };
}

function buildSegmentSeeds(n: number): SegmentSeed[] {
  return Array.from({ length: n }, (_, i) => ({
    baseOffset: (i * 0.7) % (Math.PI * 2),
    freq: 0.18 + Math.random() * 0.32,
    amp: 0.25 + Math.random() * 0.35,
  }));
}

/** Map V2 state → V1 aiActive flag. Speaking/thinking/active → true. */
function stateToAiActive(state: IrisState | undefined, explicit: boolean): boolean {
  if (explicit) return true;
  return state === 'thinking' || state === 'speaking' || state === 'active';
}

export default function IrisCore({
  size = 'md',
  score = 85,
  status = 'ok',
  aiActive = false,
  alerts = 0,
  state = 'idle',
  onClick,
  ariaLabel = 'Rdzeń AI Iris',
  className = '',
}: Props) {
  const px = SIZE_PX[size];
  const effectiveStatus: IrisStatus = state === 'error' ? 'critical' : status;
  const effectiveAiActive = stateToAiActive(state, aiActive);
  const showScoreText = px >= 96; // only lg/hero show the number+label
  const showNetwork = px >= 56;   // md+ shows inner AI network

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const stateRef = React.useRef({ score, status: effectiveStatus, aiActive: effectiveAiActive, alerts });
  const netRef = React.useRef(buildNetwork());
  const packetsRef = React.useRef<Packet[]>([]);
  const seedsRef = React.useRef<SegmentSeed[]>(buildSegmentSeeds(30));
  const startRef = React.useRef(performance.now());
  const lastPacketRef = React.useRef(0);
  const scoreAnimRef = React.useRef({ current: score, target: score });

  React.useEffect(() => {
    stateRef.current = { score, status: effectiveStatus, aiActive: effectiveAiActive, alerts };
    scoreAnimRef.current.target = score;
  }, [score, effectiveStatus, effectiveAiActive, alerts]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const s = canvas.clientWidth || px;
      canvas.width = s * dpr;
      canvas.height = s * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let running = true;
    let lastTs = performance.now();

    function draw(now: number) {
      if (!running || !ctx) return;
      requestAnimationFrame(draw);
      const dt = Math.min(60, now - lastTs); lastTs = now;
      const t = reduced ? 0 : (now - startRef.current) / 1000;
      const { status, aiActive, alerts } = stateRef.current;
      const W = canvas!.width;
      const cx = W / 2, cy = W / 2;
      const c = colorsFor(status, aiActive);

      const rOuter  = W * 0.455;
      const rMiddle = W * 0.385;
      const rCore   = W * 0.285;

      if (!reduced) scoreAnimRef.current.current += (scoreAnimRef.current.target - scoreAnimRef.current.current) * 0.08;
      else scoreAnimRef.current.current = scoreAnimRef.current.target;
      const displayScore = scoreAnimRef.current.current;

      ctx.clearRect(0, 0, W, W);

      /* Ambient halo */
      const amb = ctx.createRadialGradient(cx, cy, rCore * 0.3, cx, cy, W * 0.55);
      if (status === 'offline') {
        amb.addColorStop(0, 'rgba(107,114,128,0.05)');
        amb.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        amb.addColorStop(0, rgba(c.primary, 0.16));
        amb.addColorStop(0.5, rgba(c.primary, 0.05));
        amb.addColorStop(1, 'rgba(0,0,0,0)');
      }
      ctx.fillStyle = amb;
      ctx.fillRect(0, 0, W, W);

      /* LAYER 1: Outer segmented ring */
      const SEG = 30;
      const gapAngle = 0.017;
      const segArc = (Math.PI * 2) / SEG - gapAngle;
      const seeds = seedsRef.current;

      for (let i = 0; i < SEG; i++) {
        const a0 = -Math.PI / 2 + i * ((Math.PI * 2) / SEG);
        const a1 = a0 + segArc;
        const seed = seeds[i];

        const individualBreath = Math.sin(t * Math.PI * 2 * seed.freq + seed.baseOffset);
        const activation = Math.max(0, individualBreath) * seed.amp;

        const baseAlpha = status === 'offline' ? 0.2 : 0.16;
        const totalAlpha = Math.min(0.9, baseAlpha + activation);

        ctx.beginPath();
        ctx.strokeStyle = rgba(c.primary, totalAlpha);
        ctx.lineWidth = (1 + activation * 1.5) * dpr;
        ctx.arc(cx, cy, rOuter, a0, a1);
        ctx.stroke();

        if (activation > 0.35 && status !== 'offline' && !reduced) {
          ctx.save();
          ctx.shadowColor = rgba(c.glow, activation);
          ctx.shadowBlur = 6 * dpr * activation;
          ctx.beginPath();
          ctx.strokeStyle = rgba(c.accent, activation * 0.9);
          ctx.lineWidth = 1.2 * dpr;
          ctx.arc(cx, cy, rOuter, a0, a1);
          ctx.stroke();
          ctx.restore();
        }
      }

      /* LAYER 2: Energy flow arc */
      if (status !== 'offline' && !reduced) {
        const periodSec = status === 'critical' ? 3.5 : status === 'warning' ? 4.5 : 5.5;
        const phase = (t % periodSec) / periodSec;
        const eased = easeInOut(phase);
        const headAngle = -Math.PI / 2 + eased * Math.PI * 2;
        const tailSpan = Math.PI * 0.55;

        const steps = 40;
        for (let k = 0; k < steps; k++) {
          const kt = k / steps;
          const segAngle = headAngle - kt * tailSpan;
          const segA0 = segAngle - (tailSpan / steps) * 0.5;
          const segA1 = segAngle + (tailSpan / steps) * 0.5;
          const alpha = (1 - kt) * 0.75;

          ctx.beginPath();
          ctx.strokeStyle = rgba(c.glow, alpha);
          ctx.lineWidth = 1.3 * dpr;
          ctx.arc(cx, cy, rOuter + 1 * dpr, segA0, segA1);
          ctx.stroke();
        }

        const hx = cx + Math.cos(headAngle) * (rOuter + 1 * dpr);
        const hy = cy + Math.sin(headAngle) * (rOuter + 1 * dpr);
        const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 10 * dpr);
        hg.addColorStop(0, 'rgba(255,255,255,0.95)');
        hg.addColorStop(0.4, rgba(c.glow, 0.8));
        hg.addColorStop(1, rgba(c.accent, 0));
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(hx, hy, 10 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      /* LAYER 3: Score ring + ticks */
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI / 2 + (i / 16) * Math.PI * 2;
        const isMajor = i % 4 === 0;
        const len = isMajor ? 5 : 2.5;
        const innerPt = rMiddle + 7 * dpr;
        const outerPt = innerPt + len * dpr;
        ctx.beginPath();
        ctx.strokeStyle = rgba(c.primary, isMajor ? 0.5 : 0.18);
        ctx.lineWidth = (isMajor ? 1 : 0.6) * dpr;
        ctx.moveTo(cx + Math.cos(a) * innerPt, cy + Math.sin(a) * innerPt);
        ctx.lineTo(cx + Math.cos(a) * outerPt, cy + Math.sin(a) * outerPt);
        ctx.stroke();
      }

      const SCORE_GAP = 0.15;
      const scoreStart = Math.PI / 2 + SCORE_GAP / 2;
      const scoreEnd   = Math.PI / 2 - SCORE_GAP / 2 + Math.PI * 2;
      const scoreSpan  = Math.PI * 2 - SCORE_GAP;

      ctx.beginPath();
      ctx.strokeStyle = rgba(c.primary, 0.08);
      ctx.lineWidth = 6 * dpr;
      ctx.arc(cx, cy, rMiddle, scoreStart, scoreEnd);
      ctx.stroke();

      if (status !== 'offline') {
        const pct = Math.max(0, Math.min(100, displayScore)) / 100;
        const fillEnd = scoreStart + pct * scoreSpan;

        const breathPeriod = status === 'critical' ? 1.0 : status === 'warning' ? 1.7 : 2.5;
        const breath = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / breathPeriod);

        ctx.save();
        ctx.shadowColor = rgba(c.glow, 0.7 + breath * 0.2);
        ctx.shadowBlur = (12 + breath * 6) * dpr;
        ctx.beginPath();
        ctx.strokeStyle = rgba(c.accent, 0.9);
        ctx.lineWidth = 5 * dpr;
        ctx.lineCap = 'round';
        ctx.arc(cx, cy, rMiddle, scoreStart, fillEnd);
        ctx.stroke();
        ctx.restore();

        const g = ctx.createLinearGradient(cx - rMiddle, cy, cx + rMiddle, cy);
        g.addColorStop(0, rgba(c.primary, 1));
        g.addColorStop(1, rgba(c.accent, 1));
        ctx.beginPath();
        ctx.strokeStyle = g;
        ctx.lineWidth = 3 * dpr;
        ctx.lineCap = 'round';
        ctx.arc(cx, cy, rMiddle, scoreStart, fillEnd);
        ctx.stroke();

        if (pct > 0.01) {
          const hx = cx + Math.cos(fillEnd) * rMiddle;
          const hy = cy + Math.sin(fillEnd) * rMiddle;
          const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 9 * dpr);
          hg.addColorStop(0, 'rgba(255,255,255,0.95)');
          hg.addColorStop(0.35, rgba(c.glow, 0.8));
          hg.addColorStop(1, rgba(c.accent, 0));
          ctx.fillStyle = hg;
          ctx.beginPath();
          ctx.arc(hx, hy, 9 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* LAYER 4: Inner AI network */
      if (showNetwork) {
        const net = netRef.current;

        if (!reduced && status !== 'offline') {
          for (let i = 1; i < net.nodes.length; i++) {
            const n = net.nodes[i];
            n.x += n.vx * (aiActive ? 1.8 : 1);
            n.y += n.vy * (aiActive ? 1.8 : 1);
            n.pulse *= 0.92;
            const rr = Math.hypot(n.x, n.y);
            if (rr > 0.58 || rr < 0.3) { n.vx *= -1; n.vy *= -1; }
          }
        }

        if (!reduced && status !== 'offline') {
          const interval = aiActive ? 320 : status === 'critical' ? 200 : status === 'warning' ? 550 : 700;
          if (now - lastPacketRef.current > interval && packetsRef.current.length < 3) {
            lastPacketRef.current = now;
            packetsRef.current.push({
              edge: Math.floor(Math.random() * net.edges.length),
              progress: 0,
              speed: 0.010 + Math.random() * 0.010,
              forward: Math.random() > 0.5,
            });
          }
        }

        if (status !== 'offline') {
          for (const e of net.edges) {
            const a = net.nodes[e.a], b = net.nodes[e.b];
            ctx.beginPath();
            ctx.strokeStyle = rgba(c.primary, 0.15);
            ctx.lineWidth = 0.7 * dpr;
            ctx.moveTo(cx + a.x * rCore, cy + a.y * rCore);
            ctx.lineTo(cx + b.x * rCore, cy + b.y * rCore);
            ctx.stroke();
          }
        }

        if (status !== 'offline') {
          const remaining: Packet[] = [];
          for (const p of packetsRef.current) {
            p.progress += p.speed * (dt / 16);
            if (p.progress >= 1) {
              const e = net.edges[p.edge];
              const end = p.forward ? e.b : e.a;
              net.nodes[end].pulse = Math.min(1, net.nodes[end].pulse + 0.9);
              continue;
            }
            remaining.push(p);

            const e = net.edges[p.edge];
            const s = p.forward ? net.nodes[e.a] : net.nodes[e.b];
            const d = p.forward ? net.nodes[e.b] : net.nodes[e.a];
            const pxx = cx + (s.x + (d.x - s.x) * p.progress) * rCore;
            const py = cy + (s.y + (d.y - s.y) * p.progress) * rCore;

            const trailStart = Math.max(0, p.progress - 0.22);
            const tx = cx + (s.x + (d.x - s.x) * trailStart) * rCore;
            const ty = cy + (s.y + (d.y - s.y) * trailStart) * rCore;
            const tg = ctx.createLinearGradient(tx, ty, pxx, py);
            tg.addColorStop(0, rgba(c.accent, 0));
            tg.addColorStop(1, rgba(c.accent, 0.7));
            ctx.beginPath();
            ctx.strokeStyle = tg;
            ctx.lineWidth = 1.3 * dpr;
            ctx.moveTo(tx, ty);
            ctx.lineTo(pxx, py);
            ctx.stroke();

            ctx.save();
            ctx.shadowColor = rgba(c.glow, 0.85);
            ctx.shadowBlur = 8 * dpr;
            ctx.fillStyle = rgba(c.glow, 0.95);
            ctx.beginPath();
            ctx.arc(pxx, py, 2 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          packetsRef.current = remaining;
        }

        if (status !== 'offline') {
          for (let i = 0; i < net.nodes.length; i++) {
            const n = net.nodes[i];
            const breath = 0.55 + 0.45 * Math.sin(t * 1.5 + n.phase);
            const isCenter = i === 0;
            const nx = cx + n.x * rCore, ny = cy + n.y * rCore;
            const intensity = Math.min(1, breath * 0.65 + n.pulse);

            ctx.fillStyle = rgba(c.glow, 0.14 * intensity);
            ctx.beginPath();
            ctx.arc(nx, ny, (isCenter ? 7 : 5) * dpr, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = rgba(c.glow, 0.6 + intensity * 0.4);
            ctx.beginPath();
            ctx.arc(nx, ny, (isCenter ? 2.4 : 1.8) * dpr, 0, Math.PI * 2);
            ctx.fill();

            if (n.pulse > 0.08) {
              ctx.save();
              ctx.shadowColor = rgba(c.glow, 0.85);
              ctx.shadowBlur = 12 * dpr * n.pulse;
              ctx.fillStyle = rgba(c.glow, 0.95);
              ctx.beginPath();
              ctx.arc(nx, ny, ((isCenter ? 3 : 2.2) + 1.5 * n.pulse) * dpr, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
        }
      }

      /* Directional light */
      if (status !== 'offline') {
        const lightR = rMiddle * 0.95;
        const lg = ctx.createRadialGradient(
          cx - lightR * 0.38, cy - lightR * 0.45, 0,
          cx - lightR * 0.38, cy - lightR * 0.45, lightR,
        );
        lg.addColorStop(0, 'rgba(255,255,255,0.14)');
        lg.addColorStop(0.35, 'rgba(255,255,255,0.04)');
        lg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(cx, cy, rMiddle, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Inner bloom */
      if (status !== 'offline') {
        const bloomR = rCore * 0.75;
        const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, bloomR);
        const pulseBloom = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / 2.5);
        bg.addColorStop(0, rgba(c.glow, 0.2 + pulseBloom * 0.1));
        bg.addColorStop(0.5, rgba(c.primary, 0.09));
        bg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(cx, cy, bloomR, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Center text — only for lg/hero */
      if (showScoreText) {
        ctx.save();
        if (status !== 'offline') {
          ctx.shadowColor = rgba(c.glow, 0.55);
          ctx.shadowBlur = 16 * dpr;
        }
        ctx.fillStyle = status === 'offline' ? rgba(c.primary, 0.6) : '#FFFFFF';
        ctx.font = `800 ${Math.round(W / 5)}px Inter, ui-sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.round(displayScore)), cx, cy - W * 0.01);
        ctx.shadowBlur = 0;

        ctx.fillStyle = status === 'offline' ? rgba(c.primary, 0.45) : rgba(c.glow, 0.55);
        ctx.font = `600 ${Math.round(W / 32)}px 'JetBrains Mono', ui-monospace, monospace`;
        ctx.fillText('SCORE / 100', cx, cy + W * 0.085);

        if (alerts > 0 && status !== 'offline') {
          ctx.fillStyle = rgba([239, 68, 68], 0.9);
          ctx.font = `700 ${Math.round(W / 32)}px 'JetBrains Mono', ui-monospace, monospace`;
          ctx.fillText(`\u25B2 ${alerts} ALERT${alerts === 1 ? '' : 'S'}`, cx, cy + W * 0.145);
        }
        ctx.restore();
      }
    }

    const raf = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [px, showScoreText, showNetwork]);

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
      style={{
        width: px,
        height: px,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        display: 'inline-block',
        lineHeight: 0,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: px, height: px, maxWidth: '100%', maxHeight: '100%', display: 'block' }}
      />
    </Wrapper>
  );
}

export { IrisCore };
