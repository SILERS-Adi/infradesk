import { useEffect, useRef } from 'react';

/**
 * AiCoreOrb — React port of aicore.js canvas animation from Asystent Home.
 * 9-layer living core: ambient glow, data rings, orbiters, conic sweep,
 * grid pattern, glass shell, breathing nucleus, particles, energy lines.
 */
export type AiCoreState = 'idle' | 'scanning' | 'warning' | 'fixing' | 'success' | 'error';

const ACCENTS: Record<AiCoreState, { r: number; g: number; b: number }> = {
  idle:     { r: 79,  g: 140, b: 255 },
  scanning: { r: 79,  g: 140, b: 255 },
  warning:  { r: 251, g: 146, b: 60  },
  fixing:   { r: 79,  g: 140, b: 255 },
  success:  { r: 74,  g: 222, b: 128 },
  error:    { r: 239, g: 68,  b: 68  },
};

interface AiCoreOrbProps {
  state?: AiCoreState;
  size?: number;
  className?: string;
}

export function AiCoreOrb({ state = 'idle', size = 220, className }: AiCoreOrbProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<AiCoreState>(state);

  // Keep ref synced so animation frame reads live state without restarting the loop
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size * 2;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.style.display = 'block';
    wrap.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    timeRef.current = 0;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      timeRef.current += 0.016;
      const t = timeRef.current;
      const W = canvas.width;
      const cx = W / 2;
      const cy = W / 2;
      const s = stateRef.current;
      const ac = ACCENTS[s];

      ctx.clearRect(0, 0, W, W);

      const speed = s === 'scanning' ? 2.5 : s === 'fixing' ? 3 : s === 'success' ? 0.6 : s === 'error' ? 0.8 : 1;
      const intensity = s === 'scanning' ? 1.3 : s === 'fixing' ? 1.5 : s === 'idle' ? 0.7 : s === 'success' ? 0.8 : 0.6;

      // L0: ambient glow
      const ambR = W * 0.42;
      const ambGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, ambR);
      ambGrad.addColorStop(0, `rgba(${ac.r},${ac.g},${ac.b},${0.08 * intensity})`);
      ambGrad.addColorStop(0.5, `rgba(${ac.r},${ac.g},${ac.b},${0.03 * intensity})`);
      ambGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = ambGrad;
      ctx.fillRect(0, 0, W, W);

      // L1: outer data ring (thin arcs)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.15 * speed);
      const outerR = W * 0.44;
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const len = 0.12 + Math.sin(t * speed + i * 1.3) * 0.06;
        const alpha = 0.15 + Math.sin(t * speed * 0.7 + i) * 0.1;
        ctx.beginPath();
        ctx.arc(0, 0, outerR, angle, angle + len);
        ctx.strokeStyle = `rgba(${ac.r},${ac.g},${ac.b},${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      // L2: ring 1 — main orbit + orbiter dot
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.3 * speed);
      const r1 = W * 0.38;
      ctx.beginPath();
      ctx.arc(0, 0, r1, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${ac.r},${ac.g},${ac.b},${0.08 + 0.04 * Math.sin(t)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r1, 0, 3 * intensity, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ac.r},${ac.g},${ac.b},0.9)`;
      ctx.shadowColor = `rgba(${ac.r},${ac.g},${ac.b},0.6)`;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();

      // L3: ring 2 reverse
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-t * 0.2 * speed);
      const r2 = W * 0.33;
      for (let i = 0; i < 24; i++) {
        if (i % 3 === 0) continue;
        const a = (i / 24) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(0, 0, r2, a, a + 0.08);
        ctx.strokeStyle = `rgba(${ac.r},${ac.g},${ac.b},${0.06 + 0.03 * Math.sin(t * speed + i)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      // L4: conic sweep
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.5 * speed);
      const r3 = W * 0.27;
      const sweepGrad = (ctx as any).createConicGradient
        ? (ctx as any).createConicGradient(0, 0, 0)
        : null;
      if (sweepGrad) {
        sweepGrad.addColorStop(0, 'transparent');
        sweepGrad.addColorStop(0.15, `rgba(${ac.r},${ac.g},${ac.b},${0.12 * intensity})`);
        sweepGrad.addColorStop(0.3, 'transparent');
        sweepGrad.addColorStop(0.5, `rgba(${ac.r},${ac.g},${ac.b},${0.08 * intensity})`);
        sweepGrad.addColorStop(0.65, 'transparent');
        ctx.beginPath();
        ctx.arc(0, 0, r3, 0, Math.PI * 2);
        ctx.strokeStyle = sweepGrad;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();

      // L5: grid (scanning/fixing)
      if (s === 'scanning' || s === 'fixing') {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * 0.05);
        const gridR = W * 0.22;
        ctx.globalAlpha = 0.03 + 0.02 * Math.sin(t * 2);
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(-gridR, (i * gridR) / 3);
          ctx.lineTo(gridR, (i * gridR) / 3);
          ctx.strokeStyle = `rgb(${ac.r},${ac.g},${ac.b})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo((i * gridR) / 3, -gridR);
          ctx.lineTo((i * gridR) / 3, gridR);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // L6: glass shell
      const shellR = W * 0.22;
      const shellGrad = ctx.createRadialGradient(cx - shellR * 0.2, cy - shellR * 0.3, 0, cx, cy, shellR);
      shellGrad.addColorStop(0, `rgba(255,255,255,${0.04 * intensity})`);
      shellGrad.addColorStop(0.4, 'rgba(255,255,255,0.01)');
      shellGrad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx, cy, shellR, 0, Math.PI * 2);
      ctx.fillStyle = shellGrad;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, shellR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.04 + 0.02 * Math.sin(t)})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // L7: breathing nucleus
      const breathe = Math.sin(t * 1.2 * speed) * 0.03 + 1;
      const nucR = W * 0.14 * breathe;

      const nucGlow = ctx.createRadialGradient(cx, cy, nucR * 0.5, cx, cy, nucR * 2.2);
      nucGlow.addColorStop(0, `rgba(${ac.r},${ac.g},${ac.b},${0.2 * intensity})`);
      nucGlow.addColorStop(0.4, `rgba(${ac.r},${ac.g},${ac.b},${0.06 * intensity})`);
      nucGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = nucGlow;
      ctx.fillRect(cx - nucR * 2.5, cy - nucR * 2.5, nucR * 5, nucR * 5);

      const nucGrad = ctx.createRadialGradient(cx - nucR * 0.25, cy - nucR * 0.3, 0, cx, cy, nucR);
      nucGrad.addColorStop(0, `rgba(${Math.min(ac.r + 80, 255)},${Math.min(ac.g + 80, 255)},${Math.min(ac.b + 80, 255)},1)`);
      nucGrad.addColorStop(0.3, `rgba(${ac.r},${ac.g},${ac.b},0.95)`);
      nucGrad.addColorStop(0.7, `rgba(${Math.floor(ac.r * 0.6)},${Math.floor(ac.g * 0.6)},${Math.floor(ac.b * 0.6)},0.9)`);
      nucGrad.addColorStop(1, `rgba(${Math.floor(ac.r * 0.3)},${Math.floor(ac.g * 0.3)},${Math.floor(ac.b * 0.3)},0.85)`);
      ctx.beginPath();
      ctx.arc(cx, cy, nucR, 0, Math.PI * 2);
      ctx.fillStyle = nucGrad;
      ctx.shadowColor = `rgba(${ac.r},${ac.g},${ac.b},${0.5 * intensity})`;
      ctx.shadowBlur = 30;
      ctx.fill();
      ctx.shadowBlur = 0;

      const hlGrad = ctx.createRadialGradient(cx - nucR * 0.3, cy - nucR * 0.35, 0, cx - nucR * 0.3, cy - nucR * 0.35, nucR * 0.5);
      hlGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
      hlGrad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx, cy, nucR, 0, Math.PI * 2);
      ctx.fillStyle = hlGrad;
      ctx.fill();

      // "ID" logo w środku nucleusa — pulsujący efekt wow
      const idPulse = 0.72 + Math.sin(t * 1.8 * speed) * 0.28;
      const idSize = Math.round(nucR * 0.78);
      ctx.save();
      ctx.font = `800 ${idSize}px Inter, "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = `rgba(255,255,255,${0.6 * idPulse})`;
      ctx.shadowBlur = nucR * 0.5;
      ctx.fillStyle = `rgba(255,255,255,${idPulse})`;
      ctx.fillText('ID', cx, cy + idSize * 0.04);
      ctx.shadowBlur = 0;
      ctx.restore();

      // L8: particles
      if (s === 'scanning' || s === 'fixing' || s === 'idle') {
        const pCount = s === 'idle' ? 4 : s === 'scanning' ? 10 : 8;
        for (let i = 0; i < pCount; i++) {
          const phase = t * speed * 0.8 + i * 2.1;
          const pR = W * 0.18 + W * 0.2 * ((phase % 3) / 3);
          const pAngle = i * 1.37 + t * 0.3 * speed;
          const px = cx + Math.cos(pAngle) * pR;
          const py = cy + Math.sin(pAngle) * pR;
          const pAlpha = s === 'idle' ? 0.15 : 0.3 + Math.sin(phase) * 0.2;
          const pSize = s === 'idle' ? 1 : 1.5 + Math.sin(phase) * 0.5;
          ctx.beginPath();
          ctx.arc(px, py, pSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${ac.r},${ac.g},${ac.b},${pAlpha})`;
          ctx.fill();
        }
      }

      // L9: energy lines (scanning/fixing)
      if (s === 'scanning' || s === 'fixing') {
        for (let i = 0; i < 3; i++) {
          const la = t * 1.5 * speed + i * 2.09;
          const lR1 = W * 0.16;
          const lR2 = W * 0.35;
          const x1 = cx + Math.cos(la) * lR1;
          const y1 = cy + Math.sin(la) * lR1;
          const x2 = cx + Math.cos(la + 0.3) * lR2;
          const y2 = cy + Math.sin(la + 0.3) * lR2;
          const lineGrad = ctx.createLinearGradient(x1, y1, x2, y2);
          lineGrad.addColorStop(0, `rgba(${ac.r},${ac.g},${ac.b},0)`);
          lineGrad.addColorStop(0.4, `rgba(${ac.r},${ac.g},${ac.b},${0.15 * intensity})`);
          lineGrad.addColorStop(1, `rgba(${ac.r},${ac.g},${ac.b},0)`);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = lineGrad;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    };

    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      canvasRef.current = null;
    };
  }, [size]);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    />
  );
}
