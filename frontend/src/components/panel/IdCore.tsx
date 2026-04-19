/**
 * IdCore — flagship live system indicator (cockpit rebuild v3).
 *
 * Layered canvas:
 *   1. Subtle deep radial backdrop
 *   2. OUTER ring (system status) — heartbeat/pulse/glitch per state
 *   3. INNER ring (AI activity) — scan animation when aiActive
 *   4. AI network — 30 particles + distance-based connections inside core
 *   5. Central score number + small label
 *   6. Status message strip under (rendered by parent; canvas stays minimal)
 *
 * States:
 *   ok        — cyber blue, slow heartbeat (72bpm)
 *   analyzing — blue+cyan, traveling scan, active network
 *   warning   — amber, slower heavier pulse
 *   critical  — red, rapid pulse + segment glitch
 *   offline   — gray, static, no animation
 */

import React from 'react';

export type IdCoreStatus = 'ok' | 'warning' | 'critical' | 'offline';

interface Props {
  score: number;                    /* 0-100 */
  status: IdCoreStatus;
  aiActive?: boolean;
  alerts?: number;
  devicesOnline?: number;
  lastScan?: string;                /* ISO */
  size?: number;                    /* px, default 320 */
}

interface ColorSet {
  primary: [number, number, number];
  accent: [number, number, number];
  glow:   [number, number, number];
}

function colorsFor(status: IdCoreStatus, aiActive: boolean): ColorSet {
  if (status === 'offline') return { primary: [107, 114, 128], accent: [107, 114, 128], glow: [107, 114, 128] };
  if (status === 'warning') return { primary: [245, 158, 11], accent: [251, 191, 36], glow: [252, 211, 77] };
  if (status === 'critical') return { primary: [239, 68, 68], accent: [248, 113, 113], glow: [252, 165, 165] };
  /* ok */
  if (aiActive) return { primary: [59, 130, 246], accent: [34, 211, 238], glow: [125, 211, 252] };
  return { primary: [59, 130, 246], accent: [96, 165, 250], glow: [125, 211, 252] };
}

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

interface Particle {
  x: number; y: number;              /* unit -1..1 */
  vx: number; vy: number;
  seed: number;
}

function makeParticles(n: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.75;
    out.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      vx: (Math.random() - 0.5) * 0.0008,
      vy: (Math.random() - 0.5) * 0.0008,
      seed: Math.random() * Math.PI * 2,
    });
  }
  return out;
}

export function IdCore({ score, status, aiActive = false, alerts = 0, size = 320 }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const stateRef = React.useRef({ score, status, aiActive, alerts });
  const particlesRef = React.useRef<Particle[]>(makeParticles(30));
  const startRef = React.useRef(performance.now());
  const glitchRef = React.useRef<{ start: number; segments: number[] }>({ start: 0, segments: [] });

  React.useEffect(() => {
    stateRef.current = { score, status, aiActive, alerts };
  }, [score, status, aiActive, alerts]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const s = canvas.clientWidth || size;
      canvas.width = s * dpr;
      canvas.height = s * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let running = true;

    function draw(now: number) {
      if (!running || !ctx) return;
      const t = motionReduced ? 0 : (now - startRef.current) / 1000;
      const { score, status, aiActive, alerts } = stateRef.current;
      const W = canvas!.width;
      const cx = W / 2, cy = W / 2;
      const R = W * 0.38;                 /* outer ring radius */
      const innerR = W * 0.31;            /* inner ring radius */
      const c = colorsFor(status, aiActive);

      ctx.clearRect(0, 0, W, W);

      /* ───── Layer 1: Backdrop radial */
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.5);
      if (status === 'offline') {
        bg.addColorStop(0, 'rgba(107, 114, 128, 0.06)');
        bg.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        bg.addColorStop(0, rgba(c.primary, 0.10));
        bg.addColorStop(0.5, rgba(c.primary, 0.03));
        bg.addColorStop(1, 'rgba(0,0,0,0)');
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, W);

      /* ───── Layer 2: OUTER ring (system status) — heartbeat/pulse/glitch */
      /* Base track */
      ctx.beginPath();
      ctx.strokeStyle = rgba(c.primary, 0.09);
      ctx.lineWidth = 4 * dpr;
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      /* Heartbeat: pulsing brightness */
      let beatPhase = 0;
      if (status === 'ok')       beatPhase = Math.max(0, Math.sin(t * 2 * Math.PI * (72/60)) * 0.5 + 0.5); /* 72 bpm */
      else if (status === 'warning')  beatPhase = Math.max(0, Math.sin(t * 2 * Math.PI * (50/60)) * 0.5 + 0.5); /* slower */
      else if (status === 'critical') beatPhase = Math.max(0, Math.sin(t * 2 * Math.PI * (130/60)) * 0.5 + 0.5); /* fast */
      const beatAlpha = status === 'offline' ? 0.35 : 0.55 + beatPhase * 0.35;

      /* Trigger glitch occasionally when critical */
      if (status === 'critical' && !motionReduced) {
        if (now - glitchRef.current.start > 800 + Math.random() * 400) {
          glitchRef.current.start = now;
          const n = 2 + Math.floor(Math.random() * 3);
          glitchRef.current.segments = Array.from({ length: n }, () => Math.floor(Math.random() * 24));
        }
      } else {
        glitchRef.current.segments = [];
      }

      const glitchActive = now - glitchRef.current.start < 140;

      /* Main outer ring — segmented into 24 arcs so glitch can drop some */
      const SEG = 24;
      const segLen = (Math.PI * 2) / SEG - 0.03;
      for (let i = 0; i < SEG; i++) {
        const a0 = -Math.PI / 2 + i * (Math.PI * 2 / SEG);
        const a1 = a0 + segLen;
        const isGlitched = glitchActive && glitchRef.current.segments.includes(i);
        if (isGlitched) {
          /* Segment broken — draw dimmer, slight RGB shift */
          ctx.beginPath();
          ctx.strokeStyle = rgba(c.primary, 0.12);
          ctx.lineWidth = 2 * dpr;
          ctx.arc(cx, cy, R, a0, a1);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.strokeStyle = rgba(c.primary, beatAlpha);
          ctx.lineWidth = 4 * dpr;
          ctx.lineCap = 'butt';
          ctx.arc(cx, cy, R, a0, a1);
          ctx.stroke();
        }
      }

      /* Glow halo on outer ring (strong when beat) */
      if (status !== 'offline') {
        ctx.save();
        ctx.shadowColor = rgba(c.glow, 0.5 + beatPhase * 0.4);
        ctx.shadowBlur = (12 + beatPhase * 10) * dpr;
        ctx.beginPath();
        ctx.strokeStyle = rgba(c.primary, 0.6);
        ctx.lineWidth = 1.5 * dpr;
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      /* ───── Layer 3: INNER ring — AI activity (scan) */
      const scoreAngle = (Math.max(0, Math.min(100, score)) / 100) * Math.PI * 2;

      /* Background track */
      ctx.beginPath();
      ctx.strokeStyle = rgba(c.accent, 0.08);
      ctx.lineWidth = 2 * dpr;
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx.stroke();

      /* Progress arc (score) */
      if (status !== 'offline') {
        ctx.save();
        ctx.shadowColor = rgba(c.glow, 0.5);
        ctx.shadowBlur = 8 * dpr;
        ctx.beginPath();
        ctx.strokeStyle = rgba(c.accent, 0.85);
        ctx.lineWidth = 2.5 * dpr;
        ctx.lineCap = 'round';
        ctx.arc(cx, cy, innerR, -Math.PI / 2, -Math.PI / 2 + scoreAngle);
        ctx.stroke();
        ctx.restore();
      }

      /* Scan head (only when aiActive) */
      if (aiActive && status !== 'offline' && !motionReduced) {
        const scanAngle = -Math.PI / 2 + (t * 1.2) % (Math.PI * 2);
        const grad = ctx.createLinearGradient(
          cx + Math.cos(scanAngle - 0.3) * innerR,
          cy + Math.sin(scanAngle - 0.3) * innerR,
          cx + Math.cos(scanAngle + 0.3) * innerR,
          cy + Math.sin(scanAngle + 0.3) * innerR,
        );
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, rgba(c.glow, 0.95));
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save();
        ctx.shadowColor = rgba(c.glow, 0.9);
        ctx.shadowBlur = 14 * dpr;
        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3 * dpr;
        ctx.arc(cx, cy, innerR, scanAngle - 0.4, scanAngle + 0.4);
        ctx.stroke();
        ctx.restore();
      }

      /* ───── Layer 4: AI network (particles + connections) */
      if (status !== 'offline') {
        const maxR = innerR * 0.85;
        const particles = particlesRef.current;
        const intensityBoost = aiActive ? 1.8 : 1.0;

        if (!motionReduced) {
          for (const p of particles) {
            p.x += p.vx * intensityBoost;
            p.y += p.vy * intensityBoost;
            /* bound to unit disc, soft reflect */
            const rr = Math.sqrt(p.x * p.x + p.y * p.y);
            if (rr > 0.85) {
              p.vx *= -1; p.vy *= -1;
              p.x = Math.cos(Math.atan2(p.y, p.x)) * 0.82;
              p.y = Math.sin(Math.atan2(p.y, p.x)) * 0.82;
            }
          }
        }

        /* Connections (distance-based) */
        const connThresh = aiActive ? 0.35 : 0.25;
        ctx.save();
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < connThresh) {
              const alpha = (1 - d / connThresh) * (aiActive ? 0.5 : 0.25);
              ctx.beginPath();
              ctx.strokeStyle = rgba(c.accent, alpha);
              ctx.lineWidth = 0.5 * dpr;
              ctx.moveTo(cx + particles[i].x * maxR, cy + particles[i].y * maxR);
              ctx.lineTo(cx + particles[j].x * maxR, cy + particles[j].y * maxR);
              ctx.stroke();
            }
          }
        }
        ctx.restore();

        /* Particles */
        for (const p of particles) {
          const pulse = 0.5 + Math.sin(t * 2 + p.seed) * 0.5;
          const px = cx + p.x * maxR;
          const py = cy + p.y * maxR;
          const rad = (aiActive ? 1.5 : 1) * dpr * (0.7 + pulse * 0.3);
          ctx.fillStyle = rgba(c.glow, 0.55 + pulse * 0.35);
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* ───── Layer 5: Center (score number) */
      ctx.save();
      if (status !== 'offline') {
        ctx.shadowColor = rgba(c.glow, 0.55);
        ctx.shadowBlur = 16 * dpr;
      }
      ctx.fillStyle = status === 'offline' ? rgba(c.primary, 0.7) : '#FFFFFF';
      ctx.font = `700 ${56 * dpr}px Inter, ui-sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(score)), cx, cy - 4 * dpr);
      ctx.shadowBlur = 0;

      /* Label under score */
      ctx.fillStyle = status === 'offline' ? rgba(c.primary, 0.5) : rgba(c.glow, 0.6);
      ctx.font = `600 ${9 * dpr}px 'JetBrains Mono', monospace`;
      ctx.fillText('SCORE / 100', cx, cy + 30 * dpr);

      /* Alerts count if any */
      if (alerts > 0 && status !== 'offline') {
        ctx.fillStyle = rgba([239, 68, 68], 0.85);
        ctx.font = `700 ${10 * dpr}px 'JetBrains Mono', monospace`;
        ctx.fillText(`▲ ${alerts} ALERT${alerts === 1 ? '' : 'S'}`, cx, cy + 48 * dpr);
      }
      ctx.restore();

      requestAnimationFrame(draw);
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

/** Status text helper for parent components */
export function idCoreMessage(status: IdCoreStatus, aiActive: boolean): string {
  if (status === 'offline')  return 'Brak danych / brak połączenia';
  if (status === 'critical') return 'Wymagana natychmiastowa reakcja';
  if (status === 'warning')  return 'Wymagana uwaga';
  if (aiActive)              return 'AI analizuje system';
  return 'System działa poprawnie';
}
