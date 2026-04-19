/* ═══════════════════════════════════════════════════════════
   Puls Firmy — 12-layer canvas gauge
   Signature element of ID PANEL. State-driven, BPM-reactive.
   ═══════════════════════════════════════════════════════════ */

class PulsFirmy {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.score = opts.score ?? 92;         // 0-100
    this.devicesCount = opts.devices ?? 12;
    this.alertsCount = opts.alerts ?? 0;
    this.state = this._stateFromScore(this.score);
    this.t = 0;
    this.particles = [];
    this.deviceStates = opts.deviceStates ?? this._defaultDeviceStates();
    this.motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._loop();
  }

  _defaultDeviceStates() {
    return Array.from({ length: this.devicesCount }, () => (Math.random() < 0.85 ? 'ok' : (Math.random() < 0.7 ? 'warn' : 'bad')));
  }

  _stateFromScore(s) {
    if (s >= 85) return 'ok';
    if (s >= 60) return 'warn';
    return 'bad';
  }

  _resize() {
    const size = Math.min(this.canvas.clientWidth, this.canvas.clientHeight);
    this.canvas.width = size * this.dpr;
    this.canvas.height = size * this.dpr;
    this.W = this.canvas.width;
    this.size = size;
  }

  _accent() {
    if (this.state === 'ok')   return { r:124, g:58,  b:237, r2:6,   g2:182, b2:212 }; /* brand */
    if (this.state === 'warn') return { r:234, g:179, b:8,   r2:251, g2:146, b2:60 };
    return { r:239, g:68,  b:68, r2:244, g2:63,  b2:94 };
  }

  _rgba(c, a) { return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`; }
  _rgba2(c, a) { return `rgba(${c.r2}, ${c.g2}, ${c.b2}, ${a})`; }

  setScore(score) {
    this.score = score;
    this.state = this._stateFromScore(score);
  }

  pulse() {
    /* emit particle burst */
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 0,
        maxR: 120 + Math.random() * 60,
        life: 1,
        speed: 0.8 + Math.random() * 0.8,
      });
    }
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    if (!this.motionReduced) this.t += 0.016;
    this._draw();
  }

  _draw() {
    const ctx = this.ctx, W = this.W, cx = W / 2, cy = W / 2, t = this.t;
    const acc = this._accent();
    const speed = this.motionReduced ? 0 : (this.state === 'warn' ? 1.5 : this.state === 'bad' ? 2.5 : 1);
    const bpm = this.state === 'ok' ? 72 : this.state === 'warn' ? 100 : 140;
    const pulse = Math.sin(t * (bpm / 60) * Math.PI * 2) * 0.5 + 0.5;

    ctx.clearRect(0, 0, W, W);

    /* Layer 0 — Deep ambient glow (floor) */
    const ambR = W * 0.48;
    const ambG = ctx.createRadialGradient(cx, cy, 0, cx, cy, ambR);
    ambG.addColorStop(0, this._rgba(acc, 0.16));
    ambG.addColorStop(0.5, this._rgba2(acc, 0.08));
    ambG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ambG;
    ctx.fillRect(0, 0, W, W);

    /* Layer 1 — Outer data ring (arc segments — ONE PER DEVICE) */
    const outerR = W * 0.43;
    const n = this.devicesCount;
    const gap = 0.015;
    const segSize = (Math.PI * 2) / n - gap;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + i * ((Math.PI * 2) / n);
      const a1 = a0 + segSize;
      const ds = this.deviceStates[i] || 'ok';
      ctx.beginPath();
      ctx.strokeStyle = ds === 'ok' ? this._rgba(acc, 0.38) : ds === 'warn' ? 'rgba(234,179,8,0.55)' : 'rgba(239,68,68,0.55)';
      ctx.lineWidth = 6 * this.dpr;
      ctx.lineCap = 'round';
      ctx.arc(cx, cy, outerR, a0, a1);
      ctx.stroke();
    }

    /* Layer 2 — Main orbit (score filled arc) */
    const mainR = W * 0.37;
    ctx.beginPath();
    ctx.strokeStyle = this._rgba(acc, 0.06);
    ctx.lineWidth = 10 * this.dpr;
    ctx.arc(cx, cy, mainR, 0, Math.PI * 2);
    ctx.stroke();

    const scoreAngle = (this.score / 100) * Math.PI * 2;
    const mainGrad = ctx.createLinearGradient(cx - mainR, cy, cx + mainR, cy);
    mainGrad.addColorStop(0, this._rgba(acc, 0.95));
    mainGrad.addColorStop(1, this._rgba2(acc, 0.95));
    ctx.beginPath();
    ctx.strokeStyle = mainGrad;
    ctx.lineWidth = 10 * this.dpr;
    ctx.lineCap = 'round';
    ctx.arc(cx, cy, mainR, -Math.PI / 2, -Math.PI / 2 + scoreAngle);
    ctx.stroke();

    /* Layer 3 — Counter-orbit (reverse thin) */
    const cntR = W * 0.32;
    ctx.beginPath();
    ctx.strokeStyle = this._rgba(acc, 0.25);
    ctx.lineWidth = 1.5 * this.dpr;
    ctx.setLineDash([4 * this.dpr, 8 * this.dpr]);
    ctx.lineDashOffset = -t * 40 * speed;
    ctx.arc(cx, cy, cntR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    /* Layer 4 — Data orbitals (alerts count) */
    const orbitR = W * 0.28;
    for (let i = 0; i < Math.min(this.alertsCount, 6); i++) {
      const a = t * 0.4 * speed + (i / Math.max(this.alertsCount, 1)) * Math.PI * 2;
      const x = cx + Math.cos(a) * orbitR;
      const y = cy + Math.sin(a) * orbitR;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 14 * this.dpr);
      g.addColorStop(0, 'rgba(239,68,68,0.95)');
      g.addColorStop(1, 'rgba(239,68,68,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 14 * this.dpr, 0, Math.PI * 2);
      ctx.fill();
      /* inner core */
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(x, y, 3 * this.dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Layer 5 — Conic sweep (radar) */
    const sweepA = (t * 0.5 * speed) % (Math.PI * 2);
    for (let a = -Math.PI / 4; a < 0; a += 0.04) {
      const alpha = (1 + a / (Math.PI / 4)) * 0.15;
      ctx.beginPath();
      ctx.strokeStyle = this._rgba2(acc, alpha);
      ctx.lineWidth = 1 * this.dpr;
      const ang = sweepA + a;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * mainR, cy + Math.sin(ang) * mainR);
      ctx.stroke();
    }

    /* Layer 6 — Hex grid overlay (subtle) */
    const hexR = W * 0.22;
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1 * this.dpr;
    for (let ring = 1; ring <= 2; ring++) {
      const r = (hexR / 2) * ring;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();

    /* Layer 7 — Glass shell */
    const shellR = W * 0.25;
    const shellG = ctx.createRadialGradient(cx - shellR * 0.3, cy - shellR * 0.3, 0, cx, cy, shellR);
    shellG.addColorStop(0, 'rgba(255,255,255,0.14)');
    shellG.addColorStop(0.3, 'rgba(255,255,255,0.04)');
    shellG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shellG;
    ctx.beginPath();
    ctx.arc(cx, cy, shellR, 0, Math.PI * 2);
    ctx.fill();

    /* Layer 8 — Nucleus (BPM pulse) */
    const nucR = W * 0.17 * (0.92 + pulse * 0.08);
    const nucG = ctx.createRadialGradient(cx, cy, 0, cx, cy, nucR);
    nucG.addColorStop(0, this._rgba(acc, 0.85));
    nucG.addColorStop(0.5, this._rgba2(acc, 0.5));
    nucG.addColorStop(1, this._rgba(acc, 0));
    ctx.fillStyle = nucG;
    ctx.beginPath();
    ctx.arc(cx, cy, nucR, 0, Math.PI * 2);
    ctx.fill();

    /* Inner highlight */
    const hiR = nucR * 0.7;
    const hiG = ctx.createRadialGradient(cx - hiR * 0.3, cy - hiR * 0.4, 0, cx, cy, hiR);
    hiG.addColorStop(0, 'rgba(255,255,255,0.35)');
    hiG.addColorStop(0.6, 'rgba(255,255,255,0.08)');
    hiG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hiG;
    ctx.beginPath();
    ctx.arc(cx, cy, hiR, 0, Math.PI * 2);
    ctx.fill();

    /* Layer 9 — Score number (central) */
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 ${70 * this.dpr}px Inter, ui-sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = this._rgba(acc, 0.5);
    ctx.shadowBlur = 20 * this.dpr;
    ctx.fillText(String(Math.round(this.score)), cx, cy - 4 * this.dpr);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `500 ${13 * this.dpr}px Inter, ui-sans-serif`;
    ctx.fillText('PULS FIRMY', cx, cy + 42 * this.dpr);
    ctx.restore();

    /* Layer 10 — Particle trail (event bursts) */
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.radius += p.speed * 2;
      p.life -= 0.015;
      if (p.life <= 0 || p.radius > p.maxR) { this.particles.splice(i, 1); continue; }
      const px = cx + Math.cos(p.angle) * p.radius;
      const py = cy + Math.sin(p.angle) * p.radius;
      ctx.fillStyle = this._rgba2(acc, p.life * 0.8);
      ctx.beginPath();
      ctx.arc(px, py, 2 * this.dpr * p.life, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Layer 11 — Noise grain overlay (subtle film grain) */
    if (!this.motionReduced && Math.random() < 0.3) {
      ctx.save();
      ctx.globalAlpha = 0.03;
      const img = ctx.createImageData(W, W);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      ctx.restore();
    }
  }
}

window.PulsFirmy = PulsFirmy;
