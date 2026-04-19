/**
 * IdCore v7 — FINAL LEVEL 4 premium living core.
 *
 * 4 distinct layers per spec:
 *   1. OUTER SEGMENTED RING  — 30 segments, random seed-based activation
 *                               (not all at once — subtle shimmer of aliveness)
 *   2. ENERGY FLOW LAYER     — single thin arc traveling full ring in 5s
 *                               ease-in-out (slows at beginning/end per cycle)
 *   3. SCORE RING            — thicker, score progress, SMALL GAP at bottom
 *                               (tech feel, not closed circle)
 *   4. INNER AI CORE         — 8 nodes (1 hub + 7 satellites) + ring/spoke edges
 *                               + 2-3 energy packets flowing
 *
 * ASYMMETRIC DIRECTIONAL LIGHT: top-left specular highlight (not radial-symmetric)
 * AMBIENT: strong blue halo behind everything
 * CENTER: eased score number + label + alert count
 */

import React from 'react';

export type IdCoreStatus = 'ok' | 'warning' | 'critical' | 'offline';

interface Props {
  score: number;
  status: IdCoreStatus;
  aiActive?: boolean;
  alerts?: number;
  devicesOnline?: number;
  lastScan?: string;
  size?: number;
}

type RGB = [number, number, number];
interface Colors { primary: RGB; accent: RGB; glow: RGB }

function colorsFor(status: IdCoreStatus, aiActive: boolean): Colors {
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

/** easeInOutCubic — slow at start + end for the flow wave */
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

/** Build per-segment seeds so each segment has its own breathing pattern */
function buildSegmentSeeds(n: number): SegmentSeed[] {
  return Array.from({ length: n }, (_, i) => ({
    baseOffset: (i * 0.7) % (Math.PI * 2),
    freq: 0.18 + Math.random() * 0.32,      /* per-segment breath frequency */
    amp: 0.25 + Math.random() * 0.35,       /* how much it breathes */
  }));
}

export function IdCore({ score, status, aiActive = false, alerts = 0, size = 280 }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const stateRef = React.useRef({ score, status, aiActive, alerts });
  const netRef = React.useRef(buildNetwork());
  const packetsRef = React.useRef<Packet[]>([]);
  const seedsRef = React.useRef<SegmentSeed[]>(buildSegmentSeeds(30));
  const startRef = React.useRef(performance.now());
  const lastPacketRef = React.useRef(0);
  const scoreAnimRef = React.useRef({ current: score, target: score });

  React.useEffect(() => {
    stateRef.current = { score, status, aiActive, alerts };
    scoreAnimRef.current.target = score;
  }, [score, status, aiActive, alerts]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const s = canvas.clientWidth || size;
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
      const { score: _sTarget, status, aiActive, alerts } = stateRef.current;
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

      /* ═ Ambient halo ═ */
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

      /* ═════ LAYER 1: OUTER SEGMENTED RING — seed-based random activation ═════ */
      const SEG = 30;
      const gapAngle = 0.017;
      const segArc = (Math.PI * 2) / SEG - gapAngle;
      const seeds = seedsRef.current;

      for (let i = 0; i < SEG; i++) {
        const a0 = -Math.PI / 2 + i * ((Math.PI * 2) / SEG);
        const a1 = a0 + segArc;
        const seed = seeds[i];

        /* Each segment has its own breathing, NOT synchronized.
           Some briefly light up brighter at independent times. */
        const individualBreath = Math.sin(t * Math.PI * 2 * seed.freq + seed.baseOffset);
        /* Only positive half of sine → segment is dark most of the time, brief flare */
        const activation = Math.max(0, individualBreath) * seed.amp;

        const baseAlpha = status === 'offline' ? 0.2 : 0.16;
        const totalAlpha = Math.min(0.9, baseAlpha + activation);

        ctx.beginPath();
        ctx.strokeStyle = rgba(c.primary, totalAlpha);
        ctx.lineWidth = (1 + activation * 1.5) * dpr;
        ctx.arc(cx, cy, rOuter, a0, a1);
        ctx.stroke();

        /* Bright flare glow on highly-activated segments */
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

      /* ═════ LAYER 2: ENERGY FLOW — ONE thin line, 5s ease-in-out loop ═════ */
      if (status !== 'offline' && !reduced) {
        const periodSec = status === 'critical' ? 3.5 : status === 'warning' ? 4.5 : 5.5;
        const phase = (t % periodSec) / periodSec;       /* 0..1 */
        const eased = easeInOut(phase);                  /* slow at start/end, fast mid */
        const headAngle = -Math.PI / 2 + eased * Math.PI * 2;
        const tailSpan = Math.PI * 0.55;                 /* ~100° tail */

        /* Draw gradient arc from head backwards */
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

        /* Bright head bloom */
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

      /* ═════ LAYER 3: SCORE RING — with GAP at bottom (tech feel) ═════ */
      /* Small tick marks */
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

      /* Score ring: small gap at BOTTOM — ring sweeps from -90° - (span/2) to -90° + (span/2) counter-clockwise */
      const SCORE_GAP = 0.15;                           /* ~8.6° gap at bottom */
      const scoreStart = Math.PI / 2 + SCORE_GAP / 2;  /* just clockwise of bottom center */
      const scoreEnd   = Math.PI / 2 - SCORE_GAP / 2 + Math.PI * 2;  /* wrap around */
      const scoreSpan  = Math.PI * 2 - SCORE_GAP;

      /* Base track */
      ctx.beginPath();
      ctx.strokeStyle = rgba(c.primary, 0.08);
      ctx.lineWidth = 6 * dpr;
      ctx.arc(cx, cy, rMiddle, scoreStart, scoreEnd);
      ctx.stroke();

      if (status !== 'offline') {
        const pct = Math.max(0, Math.min(100, displayScore)) / 100;
        const fillEnd = scoreStart + pct * scoreSpan;

        /* Breath for score ring glow intensity */
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

        /* Sharp line */
        const g = ctx.createLinearGradient(cx - rMiddle, cy, cx + rMiddle, cy);
        g.addColorStop(0, rgba(c.primary, 1));
        g.addColorStop(1, rgba(c.accent, 1));
        ctx.beginPath();
        ctx.strokeStyle = g;
        ctx.lineWidth = 3 * dpr;
        ctx.lineCap = 'round';
        ctx.arc(cx, cy, rMiddle, scoreStart, fillEnd);
        ctx.stroke();

        /* Leading head dot */
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

      /* ═════ LAYER 4: INNER AI CORE — 8 nodes + edges + packets ═════ */
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

      /* Edges base */
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

      /* Packets + trails */
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
          const px = cx + (s.x + (d.x - s.x) * p.progress) * rCore;
          const py = cy + (s.y + (d.y - s.y) * p.progress) * rCore;

          const trailStart = Math.max(0, p.progress - 0.22);
          const tx = cx + (s.x + (d.x - s.x) * trailStart) * rCore;
          const ty = cy + (s.y + (d.y - s.y) * trailStart) * rCore;
          const tg = ctx.createLinearGradient(tx, ty, px, py);
          tg.addColorStop(0, rgba(c.accent, 0));
          tg.addColorStop(1, rgba(c.accent, 0.7));
          ctx.beginPath();
          ctx.strokeStyle = tg;
          ctx.lineWidth = 1.3 * dpr;
          ctx.moveTo(tx, ty);
          ctx.lineTo(px, py);
          ctx.stroke();

          ctx.save();
          ctx.shadowColor = rgba(c.glow, 0.85);
          ctx.shadowBlur = 8 * dpr;
          ctx.fillStyle = rgba(c.glow, 0.95);
          ctx.beginPath();
          ctx.arc(px, py, 2 * dpr, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        packetsRef.current = remaining;
      }

      /* Nodes */
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

      /* ═════ Directional light (asymmetric specular top-left) ═════ */
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

      /* ═════ Inner bloom + score ═════ */
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
        ctx.fillText(`▲ ${alerts} ALERT${alerts === 1 ? '' : 'S'}`, cx, cy + W * 0.145);
      }
      ctx.restore();
    }

    const raf = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [size]);

  return <canvas ref={canvasRef} style={{ width: size, height: size, maxWidth: '100%', maxHeight: '100%', display: 'block' }} />;
}

export function idCoreMessage(status: IdCoreStatus, aiActive: boolean): string {
  if (status === 'offline')  return 'Brak danych / brak połączenia';
  if (status === 'critical') return 'Wymagana natychmiastowa reakcja';
  if (status === 'warning')  return 'Wymagana uwaga';
  if (aiActive)              return 'AI analizuje system';
  return 'System działa poprawnie';
}
