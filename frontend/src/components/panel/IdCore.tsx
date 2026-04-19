/**
 * IdCore v6 — LEVEL 3 premium living core.
 *
 * Per spec:
 *   OUTER RING  — 30 distinct segments with small gaps (not 60 dashes).
 *                 One ENERGY WAVE travels around it (brighter arc moving).
 *   MIDDLE RING — score fill arc with head dot + tick marks + glow.
 *   INNER CORE  — 8 nodes + 10-12 edges + 2-3 energy packets flowing.
 *                 Asymmetric top-left light source (specular highlight).
 *   CENTER      — eased score number + label + alert.
 *
 * ⅓ reduction in noise vs v5. Iconic, not chaotic.
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
  x: number; y: number;
  vx: number; vy: number;
  phase: number;
  pulse: number;
}

interface Edge {
  a: number; b: number;
}

interface Packet {
  edge: number;
  progress: number;
  speed: number;
  forward: boolean;
}

/** Build a smaller, iconic neural network: 8 nodes, ~10-12 edges. */
function buildNetwork(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  /* 1 center node + 7 satellites arranged in slightly irregular ring */
  nodes.push({ x: 0, y: 0, vx: 0, vy: 0, phase: 0, pulse: 0 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2;
    const r = 0.48 + (i % 2 === 0 ? 0.06 : -0.03);
    nodes.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      vx: (Math.random() - 0.5) * 0.00012,
      vy: (Math.random() - 0.5) * 0.00012,
      phase: Math.random() * Math.PI * 2,
      pulse: 0,
    });
  }

  /* Center connects to all 7 (hub), plus ring connections between neighbors */
  const edges: Edge[] = [];
  for (let i = 1; i <= 7; i++) edges.push({ a: 0, b: i });                 /* hub spokes */
  for (let i = 1; i <= 7; i++) edges.push({ a: i, b: i === 7 ? 1 : i + 1 }); /* ring */

  return { nodes, edges };
}

export function IdCore({ score, status, aiActive = false, alerts = 0, size = 260 }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const stateRef = React.useRef({ score, status, aiActive, alerts });
  const netRef = React.useRef(buildNetwork());
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
    let lastTs = performance.now();

    function draw(now: number) {
      if (!running || !ctx) return;
      requestAnimationFrame(draw);
      const dt = Math.min(60, now - lastTs); lastTs = now;
      const t = reduced ? 0 : (now - startRef.current) / 1000;
      const { score: _s, status, aiActive, alerts } = stateRef.current;
      const W = canvas!.width;
      const cx = W / 2, cy = W / 2;
      const c = colorsFor(status, aiActive);

      /* Radii */
      const rOuter  = W * 0.445;
      const rMiddle = W * 0.38;
      const rCore   = W * 0.28;

      /* Eased score */
      if (!reduced) {
        scoreAnimRef.current.current += (scoreAnimRef.current.target - scoreAnimRef.current.current) * 0.08;
      } else {
        scoreAnimRef.current.current = scoreAnimRef.current.target;
      }
      const displayScore = scoreAnimRef.current.current;

      ctx.clearRect(0, 0, W, W);

      /* ═ Ambient backdrop radial (subtle) ═ */
      const amb = ctx.createRadialGradient(cx, cy, rCore * 0.4, cx, cy, W * 0.55);
      if (status === 'offline') {
        amb.addColorStop(0, 'rgba(107,114,128,0.05)');
        amb.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        amb.addColorStop(0, rgba(c.primary, 0.14));
        amb.addColorStop(0.5, rgba(c.primary, 0.04));
        amb.addColorStop(1, 'rgba(0,0,0,0)');
      }
      ctx.fillStyle = amb;
      ctx.fillRect(0, 0, W, W);

      /* ═════ LAYER 1: OUTER RING — 30 segments + traveling energy wave ═════ */
      const SEG = 30;
      const gapAngle = 0.015;
      const segArc = (Math.PI * 2) / SEG - gapAngle;

      /* Pulse breath (2.5s period for OK, faster for critical) */
      const breathPeriod = status === 'critical' ? 1.0 : status === 'warning' ? 1.8 : 2.5;
      const breath = status === 'offline' ? 0.5 : 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / breathPeriod);

      /* Energy wave position (one continuous bright arc traveling around) */
      const waveSpeed = status === 'critical' ? 0.7 : status === 'warning' ? 0.45 : 0.3;
      const waveHead = reduced ? 0 : (-Math.PI / 2 + t * waveSpeed) % (Math.PI * 2);
      const waveSpan = Math.PI * 0.45; /* ~80° tail */

      for (let i = 0; i < SEG; i++) {
        const a0 = -Math.PI / 2 + i * ((Math.PI * 2) / SEG);
        const a1 = a0 + segArc;
        const segCenter = (a0 + a1) / 2;

        /* Calculate distance to wave head (negative direction = behind wave) */
        let dToWave = segCenter - waveHead;
        while (dToWave > Math.PI) dToWave -= Math.PI * 2;
        while (dToWave < -Math.PI) dToWave += Math.PI * 2;
        /* Only segments behind the wave head are brightened */
        const waveIntensity = (dToWave <= 0 && dToWave > -waveSpan)
          ? Math.pow(1 - Math.abs(dToWave) / waveSpan, 1.5)
          : 0;

        const baseAlpha = status === 'offline' ? 0.18 : 0.20 + breath * 0.12;
        const totalAlpha = Math.min(0.95, baseAlpha + waveIntensity * 0.7);

        ctx.beginPath();
        ctx.strokeStyle = rgba(c.primary, totalAlpha);
        ctx.lineWidth = (1 + waveIntensity * 1.2) * dpr;
        ctx.lineCap = 'butt';
        ctx.arc(cx, cy, rOuter, a0, a1);
        ctx.stroke();
      }

      /* Bright wave head — small bloom dot at wave front */
      if (status !== 'offline' && !reduced) {
        const hx = cx + Math.cos(waveHead) * rOuter;
        const hy = cy + Math.sin(waveHead) * rOuter;
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 8 * dpr);
        g.addColorStop(0, rgba(c.glow, 0.9));
        g.addColorStop(0.5, rgba(c.accent, 0.5));
        g.addColorStop(1, rgba(c.accent, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(hx, hy, 8 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      /* ═════ LAYER 2: MIDDLE RING — score fill + ticks + head ═════ */
      /* Tick marks outside middle ring (4 major, 12 minor = 16 total) */
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI / 2 + (i / 16) * Math.PI * 2;
        const isMajor = i % 4 === 0;
        const len = isMajor ? 5 : 2.5;
        const innerPt = rMiddle + 7 * dpr;
        const outerPt = innerPt + len * dpr;
        ctx.beginPath();
        ctx.strokeStyle = rgba(c.primary, isMajor ? 0.45 : 0.18);
        ctx.lineWidth = (isMajor ? 1 : 0.6) * dpr;
        ctx.moveTo(cx + Math.cos(a) * innerPt, cy + Math.sin(a) * innerPt);
        ctx.lineTo(cx + Math.cos(a) * outerPt, cy + Math.sin(a) * outerPt);
        ctx.stroke();
      }

      /* Base track */
      ctx.beginPath();
      ctx.strokeStyle = rgba(c.primary, 0.08);
      ctx.lineWidth = 6 * dpr;
      ctx.arc(cx, cy, rMiddle, 0, Math.PI * 2);
      ctx.stroke();

      if (status !== 'offline') {
        const pct = Math.max(0, Math.min(100, displayScore)) / 100;
        const endAngle = -Math.PI / 2 + pct * Math.PI * 2;

        /* Glow pass */
        ctx.save();
        ctx.shadowColor = rgba(c.glow, 0.7 + breath * 0.2);
        ctx.shadowBlur = (12 + breath * 6) * dpr;
        ctx.beginPath();
        ctx.strokeStyle = rgba(c.accent, 0.85);
        ctx.lineWidth = 5 * dpr;
        ctx.lineCap = 'round';
        ctx.arc(cx, cy, rMiddle, -Math.PI / 2, endAngle);
        ctx.stroke();
        ctx.restore();

        /* Sharp top line */
        const grad = ctx.createLinearGradient(cx - rMiddle, cy, cx + rMiddle, cy);
        grad.addColorStop(0, rgba(c.primary, 1));
        grad.addColorStop(1, rgba(c.accent, 1));
        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3 * dpr;
        ctx.lineCap = 'round';
        ctx.arc(cx, cy, rMiddle, -Math.PI / 2, endAngle);
        ctx.stroke();

        /* Leading head dot */
        if (pct > 0.02) {
          const hx = cx + Math.cos(endAngle) * rMiddle;
          const hy = cy + Math.sin(endAngle) * rMiddle;
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

      /* ═════ LAYER 3: INNER CORE — 8 nodes + 14 edges + packets ═════ */
      const net = netRef.current;

      /* Drift center + satellites */
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

      /* Spawn packet */
      if (!reduced && status !== 'offline') {
        const baseInterval = aiActive ? 320 : status === 'critical' ? 180 : status === 'warning' ? 550 : 700;
        if (now - lastPacketRef.current > baseInterval && packetsRef.current.length < 3) {
          lastPacketRef.current = now;
          const ei = Math.floor(Math.random() * net.edges.length);
          packetsRef.current.push({
            edge: ei,
            progress: 0,
            speed: 0.010 + Math.random() * 0.010,
            forward: Math.random() > 0.5,
          });
        }
      }

      /* Draw edges (base) */
      if (status !== 'offline') {
        for (const e of net.edges) {
          const a = net.nodes[e.a], b = net.nodes[e.b];
          const ax = cx + a.x * rCore, ay = cy + a.y * rCore;
          const bx = cx + b.x * rCore, by = cy + b.y * rCore;
          ctx.beginPath();
          ctx.strokeStyle = rgba(c.primary, 0.14);
          ctx.lineWidth = 0.7 * dpr;
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }

      /* Draw packets + trails */
      if (status !== 'offline') {
        const remaining: Packet[] = [];
        for (const p of packetsRef.current) {
          p.progress += p.speed * (dt / 16);
          if (p.progress >= 1) {
            const e = net.edges[p.edge];
            const endIdx = p.forward ? e.b : e.a;
            net.nodes[endIdx].pulse = Math.min(1, net.nodes[endIdx].pulse + 0.9);
            continue;
          }
          remaining.push(p);

          const e = net.edges[p.edge];
          const startN = p.forward ? net.nodes[e.a] : net.nodes[e.b];
          const endN   = p.forward ? net.nodes[e.b] : net.nodes[e.a];
          const px = cx + (startN.x + (endN.x - startN.x) * p.progress) * rCore;
          const py = cy + (startN.y + (endN.y - startN.y) * p.progress) * rCore;

          /* Trail */
          const trailStart = Math.max(0, p.progress - 0.22);
          const tsx = cx + (startN.x + (endN.x - startN.x) * trailStart) * rCore;
          const tsy = cy + (startN.y + (endN.y - startN.y) * trailStart) * rCore;
          const tg = ctx.createLinearGradient(tsx, tsy, px, py);
          tg.addColorStop(0, rgba(c.accent, 0));
          tg.addColorStop(1, rgba(c.accent, 0.65));
          ctx.beginPath();
          ctx.strokeStyle = tg;
          ctx.lineWidth = 1.3 * dpr;
          ctx.moveTo(tsx, tsy);
          ctx.lineTo(px, py);
          ctx.stroke();

          /* Head dot */
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

      /* Draw nodes */
      if (status !== 'offline') {
        for (let i = 0; i < net.nodes.length; i++) {
          const n = net.nodes[i];
          const breath2 = 0.55 + 0.45 * Math.sin(t * 1.5 + n.phase);
          const isCenter = i === 0;
          const nx = cx + n.x * rCore, ny = cy + n.y * rCore;
          const intensity = Math.min(1, breath2 * 0.65 + n.pulse);

          /* Soft halo */
          ctx.fillStyle = rgba(c.glow, 0.14 * intensity);
          ctx.beginPath();
          ctx.arc(nx, ny, (isCenter ? 7 : 5) * dpr, 0, Math.PI * 2);
          ctx.fill();

          /* Bright dot */
          ctx.fillStyle = rgba(c.glow, 0.6 + intensity * 0.4);
          ctx.beginPath();
          ctx.arc(nx, ny, (isCenter ? 2.4 : 1.8) * dpr, 0, Math.PI * 2);
          ctx.fill();

          /* Pulse flare */
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

      /* ═════ ASYMMETRIC LIGHT (top-left spec highlight on core) ═════ */
      if (status !== 'offline') {
        const lightR = rMiddle * 0.95;
        const lg = ctx.createRadialGradient(
          cx - lightR * 0.35, cy - lightR * 0.4, 0,
          cx - lightR * 0.35, cy - lightR * 0.4, lightR * 0.9,
        );
        lg.addColorStop(0, 'rgba(255,255,255,0.10)');
        lg.addColorStop(0.35, 'rgba(255,255,255,0.03)');
        lg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(cx, cy, rMiddle, 0, Math.PI * 2);
        ctx.fill();
      }

      /* ═════ CENTER bloom + score ═════ */
      if (status !== 'offline') {
        const bloomR = rCore * 0.75;
        const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, bloomR);
        bg.addColorStop(0, rgba(c.glow, 0.18 + breath * 0.08));
        bg.addColorStop(0.5, rgba(c.primary, 0.08));
        bg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(cx, cy, bloomR, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Score number */
      ctx.save();
      if (status !== 'offline') {
        ctx.shadowColor = rgba(c.glow, 0.55 + breath * 0.3);
        ctx.shadowBlur = (14 + breath * 8) * dpr;
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

  return (
    <canvas ref={canvasRef} style={{ width: size, height: size, maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
  );
}

export function idCoreMessage(status: IdCoreStatus, aiActive: boolean): string {
  if (status === 'offline')  return 'Brak danych / brak połączenia';
  if (status === 'critical') return 'Wymagana natychmiastowa reakcja';
  if (status === 'warning')  return 'Wymagana uwaga';
  if (aiActive)              return 'AI analizuje system';
  return 'System działa poprawnie';
}
