/**
 * PulsFirmyCanvas — precision-tech 3D core with protection shield.
 * Based on the /panel-preview/js/puls-firmy.js v3 design (icosahedron +
 * chronograph rings + hex grid + HUD readouts + 24-cell shield).
 *
 * State-driven colors:
 *   ok   → brand gradient (violet→cyan) + green shield
 *   warn → amber/orange + orange shield
 *   bad  → crimson + black breached shield
 *
 * All drawing is canvas-local. No DOM mutation outside.
 */

import { useEffect, useRef } from 'react';

type State = 'ok' | 'warn' | 'bad';

interface Props {
  score: number;
  devices: number;
  alerts: number;
  state?: State;
  deviceStates?: ('ok' | 'warn' | 'bad')[];
}

function stateFromScore(s: number): State {
  if (s >= 85) return 'ok';
  if (s >= 60) return 'warn';
  return 'bad';
}

function accent(state: State) {
  if (state === 'ok')   return { a: [139, 92, 246], b: [34, 211, 238], glow: [167, 139, 250], text: [226, 232, 240], shield: [52, 211, 153], shieldEdge: [16, 185, 129] };
  if (state === 'warn') return { a: [251, 146, 60], b: [234, 88, 12], glow: [253, 186, 116], text: [254, 243, 199], shield: [251, 146, 60], shieldEdge: [234, 88, 12] };
  return { a: [190, 30, 30], b: [127, 15, 15], glow: [248, 113, 113], text: [254, 226, 226], shield: [12, 12, 14], shieldEdge: [220, 38, 38] };
}

const ICOSA = (() => {
  const phi = (1 + Math.sqrt(5)) / 2;
  const raw: [number, number, number][] = [
    [-1,  phi,  0], [ 1,  phi,  0], [-1, -phi,  0], [ 1, -phi,  0],
    [ 0, -1,  phi], [ 0,  1,  phi], [ 0, -1, -phi], [ 0,  1, -phi],
    [ phi,  0, -1], [ phi,  0,  1], [-phi,  0, -1], [-phi,  0,  1],
  ];
  const norm = Math.sqrt(1 + phi * phi);
  return raw.map(([x, y, z]) => ({ x: x / norm, y: y / norm, z: z / norm }));
})();

const ICOSA_EDGES: [number, number][] = (() => {
  const edges: [number, number][] = [];
  const threshold = 1.1;
  for (let i = 0; i < ICOSA.length; i++) {
    for (let j = i + 1; j < ICOSA.length; j++) {
      const a = ICOSA[i], b = ICOSA[j];
      const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
      if (d < threshold) edges.push([i, j]);
    }
  }
  return edges;
})();

function buildHexGrid(rings: number) {
  const cells: { q: number; r: number }[] = [];
  for (let q = -rings; q <= rings; q++) {
    const r1 = Math.max(-rings, -q - rings);
    const r2 = Math.min(rings, -q + rings);
    for (let r = r1; r <= r2; r++) cells.push({ q, r });
  }
  return cells;
}
const HEX_CELLS = buildHexGrid(7);

function rgba(c: number[], a: number) { return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`; }

function rotate(p: { x: number; y: number; z: number }, rx: number, ry: number) {
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cx2 = Math.cos(rx), sx = Math.sin(rx);
  const x = p.x * cy - p.z * sy;
  let z = p.x * sy + p.z * cy;
  const y = p.y * cx2 - z * sx;
  z = p.y * sx + z * cx2;
  return { x, y, z };
}

function project(x: number, y: number, z: number, cx: number, cy: number, R: number) {
  const focal = 3.2;
  const s = focal / (focal + z);
  return { x: cx + x * R * s, y: cy + y * R * s, scale: s, z };
}

export function PulsFirmyCanvas({ score, devices, alerts, state, deviceStates }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ score, devices, alerts, state: state ?? stateFromScore(score), deviceStates });
  const startRef = useRef(performance.now());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    stateRef.current = { score, devices, alerts, state: state ?? stateFromScore(score), deviceStates };
  }, [score, devices, alerts, state, deviceStates]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const size = Math.min(canvas.clientWidth, canvas.clientHeight) || 480;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let running = true;

    const defaultDevStates = Array.from({ length: stateRef.current.devices }, () =>
      Math.random() < 0.85 ? 'ok' : (Math.random() < 0.7 ? 'warn' : 'bad')
    );

    function draw(now: number) {
      if (!running || !ctx) return;
      const t = motionReduced ? 0 : (now - startRef.current) / 1000;
      const { score, devices, alerts, state } = stateRef.current;
      const dsArr = stateRef.current.deviceStates ?? defaultDevStates;
      const W = canvas!.width;
      const cx = W / 2, cy = W / 2;
      const R = W * 0.26;
      const acc = accent(state);

      ctx.clearRect(0, 0, W, W);

      /* Ambient */
      const ambG = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, W * 0.55);
      ambG.addColorStop(0, rgba(acc.a, 0.14));
      ambG.addColorStop(0.5, rgba(acc.b, 0.06));
      ambG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ambG;
      ctx.fillRect(0, 0, W, W);

      /* Hex grid */
      ctx.save();
      ctx.globalAlpha = 0.25;
      const hexSize = R * 0.11;
      const hexH = hexSize * Math.sqrt(3);
      for (const { q, r } of HEX_CELLS) {
        const x = cx + hexSize * 1.5 * q;
        const y = cy + hexH * (r + q / 2);
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist > R * 1.1) continue;
        const alpha = (1 - dist / (R * 1.1)) * 0.4;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.18})`;
        ctx.lineWidth = 0.5 * dpr;
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i + Math.PI / 6;
          const hx = x + hexSize * Math.cos(a);
          const hy = y + hexSize * Math.sin(a);
          if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();

      /* Crosshair */
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx - R * 1.15, cy); ctx.lineTo(cx - R * 0.35, cy);
      ctx.moveTo(cx + R * 0.35, cy); ctx.lineTo(cx + R * 1.15, cy);
      ctx.moveTo(cx, cy - R * 1.15); ctx.lineTo(cx, cy - R * 0.35);
      ctx.moveTo(cx, cy + R * 0.35); ctx.lineTo(cx, cy + R * 1.15);
      ctx.stroke();
      ctx.restore();

      /* Chronograph (360 ticks) */
      const chronoR = W * 0.44;
      for (let deg = 0; deg < 360; deg++) {
        const rad = (deg - 90) * Math.PI / 180;
        const isMajor = deg % 30 === 0;
        const isMinor = deg % 5 === 0;
        const len = isMajor ? 10 : isMinor ? 6 : 3;
        const alpha = isMajor ? 0.55 : isMinor ? 0.3 : 0.12;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = (isMajor ? 1.5 : 0.8) * dpr;
        ctx.moveTo(cx + Math.cos(rad) * chronoR, cy + Math.sin(rad) * chronoR);
        ctx.lineTo(cx + Math.cos(rad) * (chronoR - len * dpr), cy + Math.sin(rad) * (chronoR - len * dpr));
        ctx.stroke();
      }

      /* Device segments */
      const devR = W * 0.47;
      for (let i = 0; i < devices; i++) {
        const a0 = -Math.PI / 2 + (i / devices) * Math.PI * 2 - 0.02;
        const a1 = a0 + (Math.PI * 2) / devices - 0.06;
        const ds = dsArr[i] || 'ok';
        const col = ds === 'ok' ? 'rgba(52,211,153,0.75)' : ds === 'warn' ? 'rgba(251,191,36,0.85)' : 'rgba(248,113,113,0.9)';
        ctx.beginPath();
        ctx.strokeStyle = col;
        ctx.lineWidth = 3 * dpr;
        ctx.arc(cx, cy, devR, a0, a1);
        ctx.stroke();
      }

      /* SHIELD RING — 24 hex cells */
      const shieldR = W * 0.33;
      const shieldCells = 24;
      const hexRad = W * 0.022;
      const sweepPhase = (t * 0.25) % 1;
      for (let i = 0; i < shieldCells; i++) {
        const cellAngle = -Math.PI / 2 + (i / shieldCells) * Math.PI * 2;
        const cx2 = cx + Math.cos(cellAngle) * shieldR;
        const cy2 = cy + Math.sin(cellAngle) * shieldR;
        const sweepHead = sweepPhase * shieldCells;
        let sweepDist = (i - sweepHead + shieldCells) % shieldCells;
        if (sweepDist > shieldCells / 2) sweepDist = shieldCells - sweepDist;
        const sweepBright = Math.max(0, 1 - sweepDist / 4);
        let baseAlpha = 0.18, edgeAlpha = 0.25, fillAlpha = 0;
        if (state === 'warn') { baseAlpha = 0.22; edgeAlpha = 0.35; }
        if (state === 'bad')  { baseAlpha = 0.14; edgeAlpha = 0.45; fillAlpha = 0.92; }
        const isBroken = state === 'bad' && (i % 3 === 0);

        ctx.save();
        ctx.translate(cx2, cy2);
        ctx.rotate(cellAngle + Math.PI / 2);
        ctx.beginPath();
        for (let v = 0; v < 6; v++) {
          const a = (v / 6) * Math.PI * 2;
          const hx = Math.cos(a) * hexRad, hy = Math.sin(a) * hexRad;
          if (v === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath();

        if (fillAlpha > 0 && !isBroken) {
          ctx.fillStyle = rgba(acc.shield, fillAlpha);
          ctx.fill();
        }
        if (!isBroken) {
          const finalAlpha = edgeAlpha + sweepBright * 0.6;
          ctx.strokeStyle = rgba(acc.shieldEdge, Math.min(finalAlpha, 0.95));
          ctx.lineWidth = (1 + sweepBright * 1.5) * dpr;
          if (sweepBright > 0.5) {
            ctx.shadowColor = rgba(acc.shieldEdge, 0.8);
            ctx.shadowBlur = 10 * dpr * sweepBright;
          }
          ctx.stroke();
        } else {
          ctx.strokeStyle = rgba(acc.shieldEdge, 0.25 + Math.random() * 0.1);
          ctx.lineWidth = 0.6 * dpr;
          ctx.setLineDash([2 * dpr, 3 * dpr]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
        void baseAlpha;
      }

      /* Score progress ring */
      const scoreR = W * 0.39;
      for (let i = 0; i <= 100; i += 5) {
        const rad = -Math.PI / 2 + (i / 100) * Math.PI * 2;
        const isMajor = i % 25 === 0;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,255,255,${isMajor ? 0.25 : 0.10})`;
        ctx.lineWidth = (isMajor ? 1.2 : 0.7) * dpr;
        const len = isMajor ? 7 : 4;
        ctx.moveTo(cx + Math.cos(rad) * (scoreR + 2 * dpr), cy + Math.sin(rad) * (scoreR + 2 * dpr));
        ctx.lineTo(cx + Math.cos(rad) * (scoreR + (2 + len) * dpr), cy + Math.sin(rad) * (scoreR + (2 + len) * dpr));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.strokeStyle = rgba(acc.a, 0.1);
      ctx.lineWidth = 2 * dpr;
      ctx.arc(cx, cy, scoreR, 0, Math.PI * 2);
      ctx.stroke();
      const scoreAngle = (score / 100) * Math.PI * 2;
      const sg = ctx.createLinearGradient(cx - scoreR, cy, cx + scoreR, cy);
      sg.addColorStop(0, rgba(acc.a, 1));
      sg.addColorStop(1, rgba(acc.b, 1));
      ctx.save();
      ctx.shadowColor = rgba(acc.glow, 0.6);
      ctx.shadowBlur = 16 * dpr;
      ctx.beginPath();
      ctx.strokeStyle = sg;
      ctx.lineWidth = 3 * dpr;
      ctx.lineCap = 'round';
      ctx.arc(cx, cy, scoreR, -Math.PI / 2, -Math.PI / 2 + scoreAngle);
      ctx.stroke();
      ctx.restore();

      /* Icosahedron */
      const rotY = motionReduced ? 0 : t * 0.18;
      const rotX = motionReduced ? 0.3 : Math.sin(t * 0.13) * 0.2 + 0.4;
      const rotated = ICOSA.map(v => rotate(v, rotX, rotY));
      const projected = rotated.map(v => project(v.x, v.y, v.z, cx, cy, R));
      for (const [i, j] of ICOSA_EDGES) {
        const a = projected[i], b = projected[j];
        const isBack = a.z > 0.3 && b.z > 0.3;
        const alpha = isBack ? 0.15 : 0.65;
        const eg = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        eg.addColorStop(0, rgba(acc.a, alpha));
        eg.addColorStop(1, rgba(acc.b, alpha));
        ctx.beginPath();
        ctx.strokeStyle = eg;
        ctx.lineWidth = (isBack ? 1 : 1.5) * dpr;
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (const pp of projected) {
        const isFront = pp.z < 0;
        const size = (isFront ? 2.5 : 1.5) * dpr * pp.scale;
        const alpha = isFront ? 0.9 : 0.4;
        ctx.save();
        ctx.shadowColor = rgba(acc.glow, 0.8);
        ctx.shadowBlur = 8 * dpr;
        ctx.fillStyle = rgba(acc.glow, alpha);
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      /* Score number */
      ctx.save();
      const haloG = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.6);
      haloG.addColorStop(0, rgba(acc.a, 0.25));
      haloG.addColorStop(0.5, rgba(acc.b, 0.12));
      haloG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = haloG;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = rgba(acc.glow, 0.7);
      ctx.shadowBlur = 22 * dpr;
      const numG = ctx.createLinearGradient(cx - 50 * dpr, cy - 40 * dpr, cx + 50 * dpr, cy + 40 * dpr);
      numG.addColorStop(0, '#FFFFFF');
      numG.addColorStop(0.5, rgba(acc.text, 1));
      numG.addColorStop(1, rgba(acc.glow, 1));
      ctx.fillStyle = numG;
      ctx.font = `800 ${72 * dpr}px Inter, ui-sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(score)), cx, cy - 6 * dpr);
      ctx.shadowBlur = 0;
      ctx.fillStyle = rgba(acc.glow, 0.4);
      ctx.font = `500 ${14 * dpr}px 'JetBrains Mono', monospace`;
      ctx.fillText('/ 100', cx, cy + 32 * dpr);
      const divW = 40 * dpr, divY = cy + 52 * dpr;
      const divG = ctx.createLinearGradient(cx - divW, divY, cx + divW, divY);
      divG.addColorStop(0, 'rgba(255,255,255,0)');
      divG.addColorStop(0.5, rgba(acc.glow, 0.5));
      divG.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.strokeStyle = divG;
      ctx.lineWidth = 1 * dpr;
      ctx.moveTo(cx - divW, divY);
      ctx.lineTo(cx + divW, divY);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = `700 ${9 * dpr}px Inter, ui-sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('P U L S   F I R M Y', cx, cy + 66 * dpr);
      ctx.restore();

      /* HUD corner readouts */
      ctx.save();
      ctx.fillStyle = rgba(acc.glow, 0.55);
      ctx.font = `500 ${10 * dpr}px 'JetBrains Mono', monospace`;
      const pad = 18 * dpr, lh = 14 * dpr;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('SYS.OPERATIONAL', pad, pad);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = `500 ${9 * dpr}px 'JetBrains Mono', monospace`;
      const sec = Math.floor(t);
      const uptime = `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      ctx.fillText(`T+${uptime}`, pad, pad + lh);
      ctx.textAlign = 'right';
      ctx.fillStyle = rgba(acc.glow, 0.55);
      ctx.font = `500 ${10 * dpr}px 'JetBrains Mono', monospace`;
      ctx.fillText('ID.PANEL · v1', W - pad, pad);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = `500 ${9 * dpr}px 'JetBrains Mono', monospace`;
      ctx.fillText(`DEV ${String(devices).padStart(3, '0')}`, W - pad, pad + lh);
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = rgba(acc.glow, 0.55);
      ctx.font = `500 ${10 * dpr}px 'JetBrains Mono', monospace`;
      ctx.fillText(`${score.toFixed(2)}`, pad, W - pad - lh);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = `500 ${9 * dpr}px 'JetBrains Mono', monospace`;
      ctx.fillText('SCORE', pad, W - pad);
      ctx.textAlign = 'right';
      ctx.fillStyle = rgba(acc.glow, 0.55);
      ctx.font = `500 ${10 * dpr}px 'JetBrains Mono', monospace`;
      ctx.fillText(alerts > 0 ? `${alerts} ALERT` : 'ALL CLEAR', W - pad, W - pad - lh);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = `500 ${9 * dpr}px 'JetBrains Mono', monospace`;
      ctx.fillText('STATUS', W - pad, W - pad);
      ctx.restore();

      /* Scan line (once per 5s) */
      if (!motionReduced) {
        const scanPhase = (t % 5) / 5;
        if (scanPhase < 0.4) {
          const scanY = cy - R * 1.1 + (scanPhase / 0.4) * (R * 2.2);
          ctx.save();
          const scanG = ctx.createLinearGradient(0, scanY - 4 * dpr, 0, scanY + 4 * dpr);
          scanG.addColorStop(0, 'rgba(255,255,255,0)');
          scanG.addColorStop(0.5, rgba(acc.glow, 0.22));
          scanG.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = scanG;
          ctx.beginPath();
          ctx.arc(cx, cy, R * 1.1, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillRect(cx - R * 1.2, scanY - 4 * dpr, R * 2.4, 8 * dpr);
          ctx.restore();
        }
      }

      /* Alert markers */
      for (let i = 0; i < Math.min(alerts, 6); i++) {
        const angle = -Math.PI / 2 + (i * Math.PI / 3) + Math.PI / 6;
        const ax = cx + Math.cos(angle) * (chronoR + 12 * dpr);
        const ay = cy + Math.sin(angle) * (chronoR + 12 * dpr);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(angle + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -6 * dpr); ctx.lineTo(-5 * dpr, 4 * dpr); ctx.lineTo(5 * dpr, 4 * dpr);
        ctx.closePath();
        ctx.fillStyle = 'rgba(248,113,113,0.9)';
        ctx.shadowColor = 'rgba(248,113,113,0.8)';
        ctx.shadowBlur = 8 * dpr;
        ctx.fill();
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', maxWidth: 520, maxHeight: 520, display: 'block' }} />;
}
