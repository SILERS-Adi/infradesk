/**
 * IdCore v5 — 3-layer living system core.
 *
 * LAYER 1 · OUTER RING   · cienki + drifting micro-dashes + subtle pulse
 * LAYER 2 · MIDDLE RING  · grubszy + score fill + tick marks + glow
 * LAYER 3 · INNER CORE   · neural network (25 nodes, k-nearest edges,
 *                         energy packets traveling along connections)
 * + ambient radial glow (card-wide) + bloom on score number
 *
 * Target feel: żywy system, rdzeń energii, AI pracuje. Nie disco — premium.
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

interface ColorSet {
  primary: RGB;
  accent: RGB;
  glow: RGB;
}

function colorsFor(status: IdCoreStatus, aiActive: boolean): ColorSet {
  if (status === 'offline')  return { primary: [107, 114, 128], accent: [107, 114, 128], glow: [107, 114, 128] };
  if (status === 'warning')  return { primary: [245, 158, 11], accent: [251, 191, 36], glow: [252, 211, 77] };
  if (status === 'critical') return { primary: [239, 68, 68],  accent: [248, 113, 113], glow: [252, 165, 165] };
  if (aiActive)              return { primary: [59, 130, 246], accent: [34, 211, 238],  glow: [147, 197, 253] };
  return { primary: [59, 130, 246], accent: [96, 165, 250], glow: [147, 197, 253] };
}

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

interface Node {
  x: number; y: number;               /* unit -1..1 (actual drawn within inner radius) */
  vx: number; vy: number;
  phase: number;
  pulseIntensity: number;
}

interface Edge {
  a: number; b: number;
}

interface Packet {
  edge: number;
  progress: number;
  speed: number;
  startNode: number;
}

function buildNetwork(n: number): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  /* Distribute with golden angle but jittered for organic look */
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt((i + 0.5) / n) * 0.62 + (Math.random() - 0.5) * 0.08;
    const theta = i * golden + (Math.random() - 0.5) * 0.3;
    nodes.push({
      x: Math.cos(theta) * r,
      y: Math.sin(theta) * r,
      vx: (Math.random() - 0.5) * 0.00015,
      vy: (Math.random() - 0.5) * 0.00015,
      phase: Math.random() * Math.PI * 2,
      pulseIntensity: 0,
    });
  }

  /* Connect each node to 2-3 nearest neighbors (undirected, dedup) */
  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const neighbors = nodes
      .map((p, j) => ({ j, d: Math.hypot(p.x - nodes[i].x, p.y - nodes[i].y) }))
      .filter(nn => nn.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2 + (i % 2));
    for (const nn of neighbors) {
      const key = i < nn.j ? `${i}-${nn.j}` : `${nn.j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ a: Math.min(i, nn.j), b: Math.max(i, nn.j) });
      }
    }
  }
  return { nodes, edges };
}

export function IdCore({ score, status, aiActive = false, alerts = 0, size = 240 }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const stateRef = React.useRef({ score, status, aiActive, alerts });
  const networkRef = React.useRef(buildNetwork(25));
  const packetsRef = React.useRef<Packet[]>([]);
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
    let lastDrawTs = 0;

    function draw(now: number) {
      if (!running || !ctx) return;
      requestAnimationFrame(draw);
      const dt = Math.min(60, now - lastDrawTs);
      lastDrawTs = now;

      const t = reduced ? 0 : (now - startRef.current) / 1000;
      const { score: tgt, status, aiActive, alerts } = stateRef.current;
      const W = canvas!.width;
      const cx = W / 2, cy = W / 2;
      const c = colorsFor(status, aiActive);

      /* Radii for 3 layers (relative to W) */
      const rOuter  = W * 0.445;     /* thin outer ring */
      const rMiddle = W * 0.385;     /* score ring */
      const rCore   = W * 0.31;      /* inner network boundary */

      /* Eased score animation */
      if (!reduced) {
        const delta = scoreAnimRef.current.target - scoreAnimRef.current.current;
        scoreAnimRef.current.current += delta * 0.08;
      } else {
        scoreAnimRef.current.current = scoreAnimRef.current.target;
      }
      const displayScore = scoreAnimRef.current.current;

      ctx.clearRect(0, 0, W, W);

      /* ═════ AMBIENT: large soft halo behind everything (spotlight) ═════ */
      const ambR = W * 0.55;
      const amb = ctx.createRadialGradient(cx, cy, rCore * 0.5, cx, cy, ambR);
      if (status === 'offline') {
        amb.addColorStop(0, 'rgba(107,114,128,0.04)');
        amb.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        amb.addColorStop(0, rgba(c.primary, 0.12));
        amb.addColorStop(0.45, rgba(c.primary, 0.04));
        amb.addColorStop(1, 'rgba(0,0,0,0)');
      }
      ctx.fillStyle = amb;
      ctx.fillRect(0, 0, W, W);

      /* ═════ LAYER 1: OUTER RING — thin dashed drift + pulse ═════ */
      const pulseRate = status === 'critical' ? 0.55 : status === 'warning' ? 0.40 : 0.30;
      const pulse = status === 'offline' ? 0.5 : 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * pulseRate);

      /* Base outer ring (very faint) */
      ctx.beginPath();
      ctx.strokeStyle = rgba(c.primary, 0.05 + pulse * 0.04);
      ctx.lineWidth = 1 * dpr;
      ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      ctx.stroke();

      /* Drifting dashes on outer ring */
      const dashCount = 60;
      const drift = (t * 0.12) % 1;
      const dashStep = (Math.PI * 2) / dashCount;
      for (let i = 0; i < dashCount; i++) {
        const a = -Math.PI / 2 + (i + drift) * dashStep;
        const a2 = a + dashStep * 0.35;
        ctx.beginPath();
        ctx.strokeStyle = rgba(c.primary, 0.18 + pulse * 0.22);
        ctx.lineWidth = 1 * dpr;
        ctx.arc(cx, cy, rOuter, a, a2);
        ctx.stroke();
      }

      /* Outer ring glow halo (subtle bloom) */
      if (status !== 'offline') {
        ctx.save();
        ctx.shadowColor = rgba(c.glow, 0.55 + pulse * 0.3);
        ctx.shadowBlur = (8 + pulse * 6) * dpr;
        ctx.beginPath();
        ctx.strokeStyle = rgba(c.primary, 0.3);
        ctx.lineWidth = 1.2 * dpr;
        ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      /* ═════ LAYER 2: MIDDLE RING — score fill + tick marks + glow ═════ */
      /* Tick marks (4 major, 16 minor) just outside middle ring */
      for (let i = 0; i < 40; i++) {
        const a = -Math.PI / 2 + (i / 40) * Math.PI * 2;
        const isMajor = i % 10 === 0;
        const len = isMajor ? 5 : 2.5;
        const x1 = cx + Math.cos(a) * (rMiddle + 8 * dpr);
        const y1 = cy + Math.sin(a) * (rMiddle + 8 * dpr);
        const x2 = cx + Math.cos(a) * (rMiddle + (8 + len) * dpr);
        const y2 = cy + Math.sin(a) * (rMiddle + (8 + len) * dpr);
        ctx.beginPath();
        ctx.strokeStyle = rgba(c.primary, isMajor ? 0.4 : 0.15);
        ctx.lineWidth = (isMajor ? 1 : 0.6) * dpr;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      /* Middle ring base track */
      ctx.beginPath();
      ctx.strokeStyle = rgba(c.primary, 0.08);
      ctx.lineWidth = 6 * dpr;
      ctx.arc(cx, cy, rMiddle, 0, Math.PI * 2);
      ctx.stroke();

      /* Score progress arc with gradient + glow */
      if (status !== 'offline') {
        const pct = Math.max(0, Math.min(100, displayScore)) / 100;
        const endAngle = -Math.PI / 2 + pct * Math.PI * 2;

        /* Glow pass */
        ctx.save();
        ctx.shadowColor = rgba(c.glow, 0.75);
        ctx.shadowBlur = 14 * dpr;
        ctx.beginPath();
        ctx.strokeStyle = rgba(c.accent, 0.9);
        ctx.lineWidth = 5 * dpr;
        ctx.lineCap = 'round';
        ctx.arc(cx, cy, rMiddle, -Math.PI / 2, endAngle);
        ctx.stroke();
        ctx.restore();

        /* Top highlight pass (brighter line inside the arc) */
        const grad = ctx.createLinearGradient(cx - rMiddle, cy, cx + rMiddle, cy);
        grad.addColorStop(0, rgba(c.primary, 1));
        grad.addColorStop(1, rgba(c.accent, 1));
        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3 * dpr;
        ctx.lineCap = 'round';
        ctx.arc(cx, cy, rMiddle, -Math.PI / 2, endAngle);
        ctx.stroke();

        /* Leading head — bright dot at current position */
        if (pct > 0.02) {
          const hx = cx + Math.cos(endAngle) * rMiddle;
          const hy = cy + Math.sin(endAngle) * rMiddle;
          const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 8 * dpr);
          hg.addColorStop(0, rgba(c.glow, 1));
          hg.addColorStop(0.5, rgba(c.accent, 0.55));
          hg.addColorStop(1, rgba(c.accent, 0));
          ctx.fillStyle = hg;
          ctx.beginPath();
          ctx.arc(hx, hy, 8 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* ═════ LAYER 3: INNER CORE — NEURAL NETWORK ═════ */
      const net = networkRef.current;

      /* Drift nodes gently */
      if (!reduced && status !== 'offline') {
        for (const n of net.nodes) {
          n.x += n.vx * (aiActive ? 1.6 : 1);
          n.y += n.vy * (aiActive ? 1.6 : 1);
          n.pulseIntensity *= 0.92;
          /* soft boundary */
          const rr = Math.hypot(n.x, n.y);
          if (rr > 0.72) { n.vx *= -1; n.vy *= -1; n.x *= 0.99; n.y *= 0.99; }
        }
      }

      /* Spawn energy packets occasionally */
      if (!reduced && status !== 'offline') {
        const interval = aiActive ? 220 : status === 'critical' ? 140 : status === 'warning' ? 450 : 600;
        if (now - lastPacketRef.current > interval + Math.random() * 250) {
          lastPacketRef.current = now;
          if (net.edges.length > 0 && packetsRef.current.length < 12) {
            const ei = Math.floor(Math.random() * net.edges.length);
            const edge = net.edges[ei];
            const startNode = Math.random() > 0.5 ? edge.a : edge.b;
            packetsRef.current.push({
              edge: ei,
              progress: 0,
              speed: 0.008 + Math.random() * 0.012,
              startNode,
            });
          }
        }
      }

      /* Draw network edges — base layer */
      if (status !== 'offline') {
        ctx.save();
        ctx.lineCap = 'round';
        for (const e of net.edges) {
          const a = net.nodes[e.a], b = net.nodes[e.b];
          const ax = cx + a.x * rCore, ay = cy + a.y * rCore;
          const bx = cx + b.x * rCore, by = cy + b.y * rCore;
          ctx.beginPath();
          ctx.strokeStyle = rgba(c.primary, 0.12);
          ctx.lineWidth = 0.6 * dpr;
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
        ctx.restore();
      }

      /* Advance + draw packets (energy flowing along edges) */
      if (status !== 'offline') {
        const remaining: Packet[] = [];
        for (const p of packetsRef.current) {
          p.progress += p.speed * (dt / 16);
          if (p.progress >= 1) {
            /* On arrival, pulse the end node */
            const e = net.edges[p.edge];
            const endNode = p.startNode === e.a ? e.b : e.a;
            net.nodes[endNode].pulseIntensity = Math.min(1, net.nodes[endNode].pulseIntensity + 0.8);
            continue;
          }
          remaining.push(p);
          const e = net.edges[p.edge];
          const startN = net.nodes[p.startNode === e.a ? e.a : e.b];
          const endN = net.nodes[p.startNode === e.a ? e.b : e.a];
          const px = cx + (startN.x + (endN.x - startN.x) * p.progress) * rCore;
          const py = cy + (startN.y + (endN.y - startN.y) * p.progress) * rCore;

          /* Packet glow + dot */
          ctx.save();
          ctx.shadowColor = rgba(c.glow, 0.85);
          ctx.shadowBlur = 6 * dpr;
          ctx.fillStyle = rgba(c.glow, 0.95);
          ctx.beginPath();
          ctx.arc(px, py, 1.8 * dpr, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          /* Trail — brighten segment behind packet */
          const trailStart = Math.max(0, p.progress - 0.18);
          const tsx = cx + (startN.x + (endN.x - startN.x) * trailStart) * rCore;
          const tsy = cy + (startN.y + (endN.y - startN.y) * trailStart) * rCore;
          const trailGrad = ctx.createLinearGradient(tsx, tsy, px, py);
          trailGrad.addColorStop(0, rgba(c.accent, 0));
          trailGrad.addColorStop(1, rgba(c.accent, 0.55));
          ctx.beginPath();
          ctx.strokeStyle = trailGrad;
          ctx.lineWidth = 1.2 * dpr;
          ctx.moveTo(tsx, tsy);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
        packetsRef.current = remaining;
      }

      /* Draw nodes (on top of edges & packets) */
      if (status !== 'offline') {
        for (let i = 0; i < net.nodes.length; i++) {
          const n = net.nodes[i];
          const breath = 0.6 + 0.4 * Math.sin(t * 1.2 + n.phase);
          const nx = cx + n.x * rCore, ny = cy + n.y * rCore;
          const intensity = Math.min(1, breath * 0.6 + n.pulseIntensity);

          /* Outer soft halo */
          ctx.fillStyle = rgba(c.glow, 0.12 * intensity);
          ctx.beginPath();
          ctx.arc(nx, ny, 4 * dpr, 0, Math.PI * 2);
          ctx.fill();

          /* Inner bright dot */
          ctx.fillStyle = rgba(c.glow, 0.55 + intensity * 0.4);
          ctx.beginPath();
          ctx.arc(nx, ny, 1.6 * dpr, 0, Math.PI * 2);
          ctx.fill();

          /* Active node flare (when recently hit by packet) */
          if (n.pulseIntensity > 0.1) {
            ctx.save();
            ctx.shadowColor = rgba(c.glow, 0.8);
            ctx.shadowBlur = 10 * dpr * n.pulseIntensity;
            ctx.fillStyle = rgba(c.glow, 0.9);
            ctx.beginPath();
            ctx.arc(nx, ny, (2.2 + 1.5 * n.pulseIntensity) * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }

      /* ═════ INNER CORE BLOOM — central glow under score ═════ */
      if (status !== 'offline') {
        const bloomR = rCore * 0.6;
        const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, bloomR);
        const bloomAlpha = 0.16 + pulse * 0.08;
        bloom.addColorStop(0, rgba(c.glow, bloomAlpha));
        bloom.addColorStop(0.5, rgba(c.primary, bloomAlpha * 0.5));
        bloom.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(cx, cy, bloomR, 0, Math.PI * 2);
        ctx.fill();
      }

      /* ═════ CENTER: Score number + label (with breathing bloom) ═════ */
      ctx.save();
      if (status !== 'offline') {
        ctx.shadowColor = rgba(c.glow, 0.5 + pulse * 0.35);
        ctx.shadowBlur = (14 + pulse * 8) * dpr;
      }
      ctx.fillStyle = status === 'offline' ? rgba(c.primary, 0.65) : '#FFFFFF';
      ctx.font = `800 ${Math.round(W / 6)}px Inter, ui-sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(displayScore)), cx, cy - W * 0.008);
      ctx.shadowBlur = 0;

      ctx.fillStyle = status === 'offline' ? rgba(c.primary, 0.45) : rgba(c.glow, 0.55);
      ctx.font = `600 ${Math.round(W / 32)}px 'JetBrains Mono', ui-monospace, monospace`;
      ctx.fillText('SCORE / 100', cx, cy + W * 0.08);

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

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size, height: size,
        maxWidth: '100%', maxHeight: '100%',
        display: 'block',
      }}
    />
  );
}

export function idCoreMessage(status: IdCoreStatus, aiActive: boolean): string {
  if (status === 'offline')  return 'Brak danych / brak połączenia';
  if (status === 'critical') return 'Wymagana natychmiastowa reakcja';
  if (status === 'warning')  return 'Wymagana uwaga';
  if (aiActive)              return 'AI analizuje system';
  return 'System działa poprawnie';
}
