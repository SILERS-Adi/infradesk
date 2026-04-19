/* ═══════════════════════════════════════════════════════════════════
   Puls Firmy v2 — 3D AI Core Visualization
   True 3D-projected particle sphere with neural mesh, dataflow streams,
   Fresnel edge, volumetric plasma nucleus, holographic scanlines.
   Signature element of ID PANEL — the "o kurwa co to" moment.
   ═══════════════════════════════════════════════════════════════════ */

class PulsFirmy {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.score = opts.score ?? 92;
    this.devicesCount = opts.devices ?? 12;
    this.alertsCount = opts.alerts ?? 0;
    this.state = this._stateFromScore(this.score);
    this.t = 0;
    this.motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* 3D particle sphere — each has θ, φ (spherical coords) + speed */
    this.particles = this._buildSphere(240);
    /* Dataflow streams — inbound particles with trails */
    this.streams = [];
    /* Neural mesh — pairs of nearby particles (recomputed each frame) */
    this.meshBuffer = [];
    /* Device segments (outer ring) */
    this.deviceStates = opts.deviceStates ?? this._defaultDeviceStates();
    /* Rotation axes — 3 rings rotating at different rates */
    this.rot = { x: 0, y: 0, z: 0 };

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._loop();
  }

  _buildSphere(n) {
    /* Fibonacci sphere distribution — even coverage */
    const out = [];
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = phi * i;
      out.push({
        x: Math.cos(theta) * r,
        y: y,
        z: Math.sin(theta) * r,
        baseBright: 0.5 + Math.random() * 0.5,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
    return out;
  }

  _defaultDeviceStates() {
    return Array.from({ length: this.devicesCount }, () =>
      Math.random() < 0.85 ? 'ok' : (Math.random() < 0.7 ? 'warn' : 'bad')
    );
  }

  _stateFromScore(s) {
    if (s >= 85) return 'ok';
    if (s >= 60) return 'warn';
    return 'bad';
  }

  _accent() {
    if (this.state === 'ok')   return { a: [139, 92, 246], b: [34, 211, 238], glow: [124, 160, 255] };  /* violet-cyan */
    if (this.state === 'warn') return { a: [251, 146, 60], b: [234, 179, 8],   glow: [254, 215, 117] };  /* amber */
    return { a: [244, 63, 94], b: [239, 68, 68],  glow: [252, 165, 165] };                               /* rose-red */
  }

  _rgba(c, a) { return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`; }

  _resize() {
    const size = Math.min(this.canvas.clientWidth, this.canvas.clientHeight) || 480;
    this.canvas.width = size * this.dpr;
    this.canvas.height = size * this.dpr;
    this.W = this.canvas.width;
    this.size = size;
  }

  setScore(score) {
    this.score = score;
    this.state = this._stateFromScore(score);
  }

  _emitStream() {
    /* A dataflow particle entering from outside, heading toward the sphere */
    const angle = Math.random() * Math.PI * 2;
    const startR = 1.8;
    this.streams.push({
      x: Math.cos(angle) * startR,
      y: (Math.random() - 0.5) * 2,
      z: Math.sin(angle) * startR,
      vx: -Math.cos(angle) * 0.015,
      vz: -Math.sin(angle) * 0.015,
      vy: -((Math.random() - 0.5) * 0.01),
      life: 1,
      trail: [],
    });
  }

  _project(x, y, z, cx, cy, R) {
    /* Simple perspective projection */
    const focal = 2.4;
    const scale = focal / (focal + z);
    return {
      x: cx + x * R * scale,
      y: cy + y * R * scale,
      scale,
      z,
    };
  }

  _rotate3(p) {
    /* Apply rotY then rotX */
    const cy = Math.cos(this.rot.y), sy = Math.sin(this.rot.y);
    const cx = Math.cos(this.rot.x * 0.4), sx = Math.sin(this.rot.x * 0.4);
    let x = p.x * cy - p.z * sy;
    let z = p.x * sy + p.z * cy;
    let y = p.y * cx - z * sx;
    z = p.y * sx + z * cx;
    return { x, y, z };
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    if (!this.motionReduced) {
      this.t += 0.016;
      this.rot.y += 0.0025;
      this.rot.x = Math.sin(this.t * 0.18) * 0.4;
      /* Emit streams occasionally */
      if (Math.random() < 0.06) this._emitStream();
    }
    this._draw();
  }

  _draw() {
    const ctx = this.ctx, W = this.W, cx = W / 2, cy = W / 2, t = this.t;
    const acc = this._accent();
    const R = W * 0.28; /* sphere projection radius */
    const bpm = this.state === 'ok' ? 72 : this.state === 'warn' ? 100 : 140;
    const pulse = Math.sin(t * (bpm / 60) * Math.PI * 2) * 0.5 + 0.5;

    ctx.clearRect(0, 0, W, W);

    /* ═════ LAYER 1: Ambient floor glow — soft deep backdrop ═════ */
    const ambR = W * 0.5;
    const ambG = ctx.createRadialGradient(cx, cy, 0, cx, cy, ambR);
    ambG.addColorStop(0,   this._rgba(acc.a, 0.18));
    ambG.addColorStop(0.4, this._rgba(acc.b, 0.10));
    ambG.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = ambG;
    ctx.fillRect(0, 0, W, W);

    /* ═════ LAYER 2: Outer device ring — one arc segment per device ═════ */
    const outerR = W * 0.46;
    const n = this.devicesCount;
    const gap = 0.014;
    const segSize = (Math.PI * 2) / n - gap;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + i * ((Math.PI * 2) / n);
      const a1 = a0 + segSize;
      const ds = this.deviceStates[i] || 'ok';
      let col;
      if (ds === 'ok')   col = 'rgba(52, 211, 153, 0.55)';
      else if (ds === 'warn') col = 'rgba(251, 191, 36, 0.65)';
      else col = 'rgba(248, 113, 113, 0.7)';
      ctx.beginPath();
      ctx.strokeStyle = col;
      ctx.lineWidth = 5 * this.dpr;
      ctx.lineCap = 'round';
      ctx.arc(cx, cy, outerR, a0, a1);
      ctx.stroke();
    }

    /* ═════ LAYER 3: Sweep indicator on outer ring (data scan) ═════ */
    if (!this.motionReduced) {
      const sweepA = (-Math.PI / 2 + (t * 0.6) % (Math.PI * 2));
      const sweepG = ctx.createLinearGradient(
        cx + Math.cos(sweepA - 0.1) * outerR,
        cy + Math.sin(sweepA - 0.1) * outerR,
        cx + Math.cos(sweepA + 0.1) * outerR,
        cy + Math.sin(sweepA + 0.1) * outerR
      );
      sweepG.addColorStop(0, 'rgba(255,255,255,0)');
      sweepG.addColorStop(0.5, this._rgba(acc.glow, 0.9));
      sweepG.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath();
      ctx.strokeStyle = sweepG;
      ctx.lineWidth = 7 * this.dpr;
      ctx.arc(cx, cy, outerR, sweepA - 0.18, sweepA + 0.18);
      ctx.stroke();
    }

    /* ═════ LAYER 4: Score ring (filled arc) ═════ */
    const scoreR = W * 0.40;
    ctx.beginPath();
    ctx.strokeStyle = this._rgba(acc.a, 0.08);
    ctx.lineWidth = 2.5 * this.dpr;
    ctx.arc(cx, cy, scoreR, 0, Math.PI * 2);
    ctx.stroke();

    const scoreAngle = (this.score / 100) * Math.PI * 2;
    const sg = ctx.createLinearGradient(cx - scoreR, cy, cx + scoreR, cy);
    sg.addColorStop(0, this._rgba(acc.a, 0.95));
    sg.addColorStop(1, this._rgba(acc.b, 0.95));
    ctx.beginPath();
    ctx.strokeStyle = sg;
    ctx.lineWidth = 3 * this.dpr;
    ctx.lineCap = 'round';
    ctx.arc(cx, cy, scoreR, -Math.PI / 2, -Math.PI / 2 + scoreAngle);
    ctx.stroke();

    /* Glow on score ring */
    ctx.save();
    ctx.shadowColor = this._rgba(acc.glow, 0.6);
    ctx.shadowBlur = 20 * this.dpr;
    ctx.beginPath();
    ctx.strokeStyle = this._rgba(acc.b, 0.4);
    ctx.lineWidth = 2 * this.dpr;
    ctx.arc(cx, cy, scoreR, -Math.PI / 2, -Math.PI / 2 + scoreAngle);
    ctx.stroke();
    ctx.restore();

    /* ═════ LAYER 5: Three orbital rings at different axes (3D illusion) ═════ */
    ctx.save();
    for (let axis = 0; axis < 3; axis++) {
      const phase = t * (0.2 + axis * 0.15) + axis * Math.PI / 3;
      const axisTilt = (axis / 3) * Math.PI;
      ctx.beginPath();
      ctx.strokeStyle = this._rgba(acc.a, 0.15 + axis * 0.05);
      ctx.lineWidth = 1 * this.dpr;
      ctx.setLineDash([2 * this.dpr, 6 * this.dpr]);
      ctx.lineDashOffset = -phase * 20;
      const r1 = R * (0.95 + axis * 0.02);
      /* Draw ellipse at skewed angle */
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(axisTilt);
      ctx.scale(1, 0.25 + axis * 0.2);
      ctx.arc(0, 0, r1, 0, Math.PI * 2);
      ctx.restore();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    /* ═════ LAYER 6: 3D projected particle sphere — prep pass for neural mesh ═════ */
    const projected = [];
    for (const p of this.particles) {
      const twinkle = 0.7 + 0.3 * Math.sin(t * 2 + p.twinkle);
      const rot = this._rotate3(p);
      const proj = this._project(rot.x, rot.y, rot.z, cx, cy, R);
      projected.push({ ...proj, p, twinkle });
    }

    /* ═════ LAYER 7: Neural mesh — lines between close-by particles ═════ */
    ctx.save();
    const meshThreshold = R * 0.22;
    for (let i = 0; i < projected.length; i++) {
      const a = projected[i];
      if (a.z > 0.6) continue; /* skip back hemisphere */
      for (let j = i + 1; j < projected.length; j++) {
        const b = projected[j];
        if (b.z > 0.6) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < meshThreshold) {
          const alpha = (1 - dist / meshThreshold) * 0.35 * Math.min(a.scale, b.scale);
          ctx.beginPath();
          ctx.strokeStyle = this._rgba(acc.glow, alpha);
          ctx.lineWidth = 0.5 * this.dpr;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    /* ═════ LAYER 8: Volumetric nucleus — plasma core ═════ */
    const nucR = R * 0.4 * (0.94 + pulse * 0.06);
    /* Outer glow layer */
    const nucOuter = ctx.createRadialGradient(cx, cy, nucR * 0.5, cx, cy, nucR * 1.6);
    nucOuter.addColorStop(0, this._rgba(acc.a, 0.55));
    nucOuter.addColorStop(0.5, this._rgba(acc.b, 0.25));
    nucOuter.addColorStop(1, this._rgba(acc.a, 0));
    ctx.fillStyle = nucOuter;
    ctx.beginPath();
    ctx.arc(cx, cy, nucR * 1.6, 0, Math.PI * 2);
    ctx.fill();

    /* Hot core */
    const hotG = ctx.createRadialGradient(cx, cy, 0, cx, cy, nucR);
    hotG.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    hotG.addColorStop(0.25, this._rgba(acc.glow, 0.85));
    hotG.addColorStop(0.65, this._rgba(acc.a, 0.55));
    hotG.addColorStop(1, this._rgba(acc.b, 0));
    ctx.fillStyle = hotG;
    ctx.beginPath();
    ctx.arc(cx, cy, nucR, 0, Math.PI * 2);
    ctx.fill();

    /* Plasma ripples inside nucleus */
    if (!this.motionReduced) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 3; i++) {
        const rippleR = nucR * (0.4 + i * 0.2 + Math.sin(t * 1.5 + i) * 0.08);
        const rippleA = 0.15 * (1 - i / 3);
        ctx.beginPath();
        ctx.strokeStyle = this._rgba(acc.glow, rippleA);
        ctx.lineWidth = 1 * this.dpr;
        ctx.arc(cx + Math.sin(t * 0.8 + i) * 3, cy + Math.cos(t * 0.6 + i) * 3, rippleR, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ═════ LAYER 9: Particle sphere — draw with depth-based size & alpha ═════ */
    projected.sort((a, b) => a.z - b.z); /* back to front */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const pp of projected) {
      /* Skip if behind nucleus */
      const distFromCenter = Math.sqrt((pp.x - cx) ** 2 + (pp.y - cy) ** 2);
      const isFront = pp.z <= 0;
      /* Depth-based size: near = big, far = tiny */
      const size = (1.4 + pp.scale * 1.8) * this.dpr;
      /* Fresnel-like brightness — edges brighter */
      const edgeBoost = 1 + Math.max(0, (distFromCenter - R * 0.65) / (R * 0.3));
      const a = pp.p.baseBright * pp.twinkle * (isFront ? 1 : 0.35) * Math.min(edgeBoost, 1.8) * 0.7;
      const color = isFront ? acc.glow : acc.a;
      ctx.fillStyle = this._rgba(color, a);
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    /* ═════ LAYER 10: Fresnel edge highlight — bright rim on sphere ═════ */
    const fresnelG = ctx.createRadialGradient(cx, cy, R * 0.88, cx, cy, R * 1.05);
    fresnelG.addColorStop(0, 'rgba(255,255,255,0)');
    fresnelG.addColorStop(0.5, this._rgba(acc.glow, 0.3));
    fresnelG.addColorStop(0.85, this._rgba(acc.b, 0.5));
    fresnelG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fresnelG;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.05, 0, Math.PI * 2);
    ctx.fill();

    /* Top-left specular highlight (simulated light source) */
    const specG = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.4, 0, cx - R * 0.3, cy - R * 0.4, R * 0.4);
    specG.addColorStop(0, 'rgba(255,255,255,0.22)');
    specG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = specG;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.95, 0, Math.PI * 2);
    ctx.fill();

    /* ═════ LAYER 11: Dataflow streams (inbound particles with trails) ═════ */
    for (let i = this.streams.length - 1; i >= 0; i--) {
      const s = this.streams[i];
      s.trail.push({ x: s.x, y: s.y, z: s.z });
      if (s.trail.length > 14) s.trail.shift();
      s.x += s.vx; s.y += s.vy; s.z += s.vz;
      const distToCore = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
      if (distToCore < 0.35 || s.trail.length > 50) { this.streams.splice(i, 1); continue; }
      /* Draw trail */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < s.trail.length; k++) {
        const tr = s.trail[k];
        const rot = this._rotate3(tr);
        const proj = this._project(rot.x, rot.y, rot.z, cx, cy, R);
        const a = (k / s.trail.length) * 0.9;
        const size = (k / s.trail.length) * 3 * this.dpr + 0.5;
        ctx.fillStyle = this._rgba(acc.glow, a);
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    /* ═════ LAYER 12: Alert orbitals (outside sphere) ═════ */
    const orbitR = R * 1.08;
    for (let i = 0; i < Math.min(this.alertsCount, 6); i++) {
      const a = t * 0.4 + (i / Math.max(this.alertsCount, 1)) * Math.PI * 2;
      const x = cx + Math.cos(a) * orbitR;
      const y = cy + Math.sin(a) * orbitR * 0.6; /* flatten for 3D feel */
      /* Alert marker */
      const g = ctx.createRadialGradient(x, y, 0, x, y, 16 * this.dpr);
      g.addColorStop(0, 'rgba(248,113,113,0.95)');
      g.addColorStop(0.3, 'rgba(248,113,113,0.6)');
      g.addColorStop(1, 'rgba(248,113,113,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 16 * this.dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FCA5A5';
      ctx.beginPath();
      ctx.arc(x, y, 3 * this.dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ═════ LAYER 13: Holographic scanline — sweeps vertically ═════ */
    if (!this.motionReduced) {
      const scanY = cy + (Math.sin(t * 0.35) * R * 0.9);
      ctx.save();
      const scanG = ctx.createLinearGradient(0, scanY - 6 * this.dpr, 0, scanY + 6 * this.dpr);
      scanG.addColorStop(0, 'rgba(255,255,255,0)');
      scanG.addColorStop(0.5, this._rgba(acc.glow, 0.12));
      scanG.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = scanG;
      /* Only over sphere */
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillRect(cx - R, scanY - 6 * this.dpr, R * 2, 12 * this.dpr);
      ctx.restore();
    }

    /* ═════ LAYER 14: Score number (gradient text + glow) ═════ */
    ctx.save();
    /* Glow halo behind number */
    ctx.shadowColor = this._rgba(acc.glow, 0.7);
    ctx.shadowBlur = 24 * this.dpr;
    /* Gradient fill */
    const numG = ctx.createLinearGradient(cx - 40 * this.dpr, cy - 30 * this.dpr, cx + 40 * this.dpr, cy + 30 * this.dpr);
    numG.addColorStop(0, '#FFFFFF');
    numG.addColorStop(0.6, '#E8ECFF');
    numG.addColorStop(1, this._rgba(acc.glow, 1));
    ctx.fillStyle = numG;
    ctx.font = `800 ${64 * this.dpr}px Inter, ui-sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(this.score)), cx, cy - 4 * this.dpr);
    ctx.restore();

    /* Label */
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `600 ${10 * this.dpr}px Inter, ui-sans-serif`;
    ctx.letterSpacing = '0.2em';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PULS FIRMY', cx, cy + 42 * this.dpr);

    /* Secondary metric under */
    ctx.fillStyle = this._rgba(acc.glow, 0.7);
    ctx.font = `500 ${10 * this.dpr}px 'JetBrains Mono', monospace`;
    ctx.fillText(`${this.devicesCount} URZĄDZEŃ · ${this.alertsCount} ALERTÓW`, cx, cy + 58 * this.dpr);
    ctx.restore();
  }

  /* Event pulse — visible burst */
  pulse() {
    for (let i = 0; i < 8; i++) this._emitStream();
  }
}

window.PulsFirmy = PulsFirmy;
