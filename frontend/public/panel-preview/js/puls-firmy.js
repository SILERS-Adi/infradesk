/* ═══════════════════════════════════════════════════════════════════
   Puls Firmy v3 — Precision Tech Core
   No floating particles. No organic motion. Hard-edge 3D polyhedron,
   chronograph rings, hexagonal grid, digital readouts.
   Inspired by F-35 HUD, Iron Man Jarvis, Tron disc, SpaceX flight computer.
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

    /* Icosahedron vertices (12 nodes) */
    this.icosaVerts = this._buildIcosahedron();
    /* Hexagonal grid coords (flat) */
    this.hexCells = this._buildHexGrid(7);
    /* Device states for outer ring */
    this.deviceStates = opts.deviceStates ?? this._defaultDeviceStates();
    /* Scan line state */
    this.lastScan = 0;

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._loop();
  }

  _buildIcosahedron() {
    /* Standard icosahedron vertices (12 points) */
    const phi = (1 + Math.sqrt(5)) / 2;
    const raw = [
      [-1,  phi,  0], [ 1,  phi,  0], [-1, -phi,  0], [ 1, -phi,  0],
      [ 0, -1,  phi], [ 0,  1,  phi], [ 0, -1, -phi], [ 0,  1, -phi],
      [ phi,  0, -1], [ phi,  0,  1], [-phi,  0, -1], [-phi,  0,  1],
    ];
    /* Normalize to unit sphere */
    const norm = Math.sqrt(1 + phi * phi);
    return raw.map(([x, y, z]) => ({ x: x / norm, y: y / norm, z: z / norm }));
  }

  _icosaEdges() {
    /* Connect vertices that are close enough (icosahedron edges) */
    const edges = [];
    const threshold = 1.1; /* empirical for unit-sphere icosa */
    for (let i = 0; i < this.icosaVerts.length; i++) {
      for (let j = i + 1; j < this.icosaVerts.length; j++) {
        const a = this.icosaVerts[i], b = this.icosaVerts[j];
        const d = Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
        if (d < threshold) edges.push([i, j]);
      }
    }
    return edges;
  }

  _buildHexGrid(rings) {
    /* Axial coords for a hex grid with `rings` rings */
    const cells = [];
    for (let q = -rings; q <= rings; q++) {
      const r1 = Math.max(-rings, -q - rings);
      const r2 = Math.min(rings, -q + rings);
      for (let r = r1; r <= r2; r++) cells.push({ q, r });
    }
    return cells;
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
    if (this.state === 'ok')   return { a: [139, 92, 246], b: [34, 211, 238], glow: [167, 139, 250], text: [226, 232, 240], shield: [52, 211, 153], shieldEdge: [16, 185, 129] };
    if (this.state === 'warn') return { a: [251, 146, 60], b: [234, 88, 12],  glow: [253, 186, 116], text: [254, 243, 199], shield: [251, 146, 60], shieldEdge: [234, 88, 12] };
    /* BAD: deep crimson core (still visible) + black shield (breach look) */
    return { a: [190, 30, 30], b: [127, 15, 15], glow: [248, 113, 113], text: [254, 226, 226], shield: [12, 12, 14], shieldEdge: [220, 38, 38] };
  }

  _rgba(c, a) { return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`; }

  _resize() {
    const size = Math.min(this.canvas.clientWidth, this.canvas.clientHeight) || 480;
    this.canvas.width = size * this.dpr;
    this.canvas.height = size * this.dpr;
    this.W = this.canvas.width;
    this.size = size;
  }

  setScore(score) { this.score = score; this.state = this._stateFromScore(score); }
  pulse() { this.lastScan = this.t; /* trigger single scan */ }

  _rotate(p, rx, ry) {
    const cy = Math.cos(ry), sy = Math.sin(ry);
    const cx = Math.cos(rx), sx = Math.sin(rx);
    let x = p.x * cy - p.z * sy;
    let z = p.x * sy + p.z * cy;
    let y = p.y * cx - z * sx;
    z = p.y * sx + z * cx;
    return { x, y, z };
  }

  _project(x, y, z, cx, cy, R) {
    const focal = 3.2;
    const scale = focal / (focal + z);
    return { x: cx + x * R * scale, y: cy + y * R * scale, scale, z };
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    if (!this.motionReduced) this.t += 0.016;
    this._draw();
  }

  _draw() {
    const ctx = this.ctx, W = this.W, cx = W / 2, cy = W / 2, t = this.t;
    const acc = this._accent();
    const R = W * 0.26; /* polyhedron radius */

    ctx.clearRect(0, 0, W, W);

    /* ── LAYER 1: Soft ambient backdrop ── */
    const ambR = W * 0.55;
    const ambG = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, ambR);
    ambG.addColorStop(0, this._rgba(acc.a, 0.14));
    ambG.addColorStop(0.5, this._rgba(acc.b, 0.06));
    ambG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ambG;
    ctx.fillRect(0, 0, W, W);

    /* ── LAYER 2: Hexagonal grid (subtle background, flat) ── */
    ctx.save();
    ctx.globalAlpha = 0.25;
    const hexSize = R * 0.11;
    const hexH = hexSize * Math.sqrt(3);
    for (const { q, r } of this.hexCells) {
      const x = cx + hexSize * 1.5 * q;
      const y = cy + hexH * (r + q / 2);
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist > R * 1.1) continue;
      const alpha = (1 - dist / (R * 1.1)) * 0.4;
      ctx.beginPath();
      ctx.strokeStyle = this._rgba([255, 255, 255], alpha * 0.18);
      ctx.lineWidth = 0.5 * this.dpr;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i + Math.PI / 6;
        const hx = x + hexSize * Math.cos(angle);
        const hy = y + hexSize * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();

    /* ── LAYER 3: Crosshair (precise measurement feel) ── */
    ctx.save();
    ctx.strokeStyle = this._rgba([255, 255, 255], 0.06);
    ctx.lineWidth = 0.5 * this.dpr;
    /* Horizontal axis with gap in middle */
    ctx.beginPath();
    ctx.moveTo(cx - R * 1.15, cy);
    ctx.lineTo(cx - R * 0.35, cy);
    ctx.moveTo(cx + R * 0.35, cy);
    ctx.lineTo(cx + R * 1.15, cy);
    /* Vertical axis with gap */
    ctx.moveTo(cx, cy - R * 1.15);
    ctx.lineTo(cx, cy - R * 0.35);
    ctx.moveTo(cx, cy + R * 0.35);
    ctx.lineTo(cx, cy + R * 1.15);
    ctx.stroke();

    /* Tiny cross at center would clash with score — omit */
    ctx.restore();

    /* ── LAYER 4: Outer chronograph ring — 360 tick marks ── */
    const chronoR = W * 0.44;
    ctx.save();
    for (let deg = 0; deg < 360; deg += 1) {
      const rad = (deg - 90) * Math.PI / 180;
      const isMajor = deg % 30 === 0;
      const isMinor = deg % 5 === 0;
      const len = isMajor ? 10 : isMinor ? 6 : 3;
      const alpha = isMajor ? 0.55 : isMinor ? 0.3 : 0.12;
      const x1 = cx + Math.cos(rad) * chronoR;
      const y1 = cy + Math.sin(rad) * chronoR;
      const x2 = cx + Math.cos(rad) * (chronoR - len * this.dpr);
      const y2 = cy + Math.sin(rad) * (chronoR - len * this.dpr);
      ctx.beginPath();
      ctx.strokeStyle = this._rgba([255, 255, 255], alpha);
      ctx.lineWidth = (isMajor ? 1.5 : 0.8) * this.dpr;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();

    /* ── LAYER 5: Device segments (12 discrete indicators on chrono ring) ── */
    const devR = W * 0.47;
    const n = this.devicesCount;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2 - 0.02;
      const a1 = a0 + (Math.PI * 2) / n - 0.06;
      const ds = this.deviceStates[i] || 'ok';
      let col;
      if (ds === 'ok') col = this._rgba([52, 211, 153], 0.75);
      else if (ds === 'warn') col = this._rgba([251, 191, 36], 0.85);
      else col = this._rgba([248, 113, 113], 0.9);
      ctx.beginPath();
      ctx.strokeStyle = col;
      ctx.lineWidth = 3 * this.dpr;
      ctx.lineCap = 'butt';
      ctx.arc(cx, cy, devR, a0, a1);
      ctx.stroke();
    }

    /* ── LAYER 5.5: SHIELD ring — 24 hexagonal protection cells ──
       Subtle outlines (not filled), slow rotation sweep carries the brightness.
       State-driven: green=safe, orange=warn, black=breach. Tasteful restraint:
       thin strokes, gaps between cells, muted default alpha. */
    const shieldR = W * 0.33;
    const shieldCells = 24;
    const hexRad = W * 0.022;
    const sweepPhase = (t * 0.25) % 1; /* full rotation per 4s */
    for (let i = 0; i < shieldCells; i++) {
      const cellAngle = -Math.PI / 2 + (i / shieldCells) * Math.PI * 2;
      const cx2 = cx + Math.cos(cellAngle) * shieldR;
      const cy2 = cy + Math.sin(cellAngle) * shieldR;
      /* Distance along ring from sweep head */
      const sweepHead = sweepPhase * shieldCells;
      let sweepDist = (i - sweepHead + shieldCells) % shieldCells;
      if (sweepDist > shieldCells / 2) sweepDist = shieldCells - sweepDist;
      /* Brightness falls off with distance from sweep (only leads 4 cells) */
      const sweepBright = Math.max(0, 1 - sweepDist / 4);
      /* Base alpha varies by state */
      let baseAlpha = 0.18;
      let edgeAlpha = 0.25;
      let fillAlpha = 0;
      if (this.state === 'warn') { baseAlpha = 0.22; edgeAlpha = 0.35; }
      if (this.state === 'bad')  { baseAlpha = 0.14; edgeAlpha = 0.45; fillAlpha = 0.92; }
      /* Broken cells for bad state — deterministic, every 3rd */
      const isBroken = this.state === 'bad' && (i % 3 === 0);

      ctx.save();
      ctx.translate(cx2, cy2);
      ctx.rotate(cellAngle + Math.PI / 2);
      /* Hex path (flat-top) */
      ctx.beginPath();
      for (let v = 0; v < 6; v++) {
        const a = (v / 6) * Math.PI * 2;
        const hx = Math.cos(a) * hexRad;
        const hy = Math.sin(a) * hexRad;
        if (v === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();

      /* Fill (only for bad state — black void look) */
      if (fillAlpha > 0 && !isBroken) {
        ctx.fillStyle = this._rgba(acc.shield, fillAlpha);
        ctx.fill();
      }

      /* Stroke with sweep brightness */
      if (!isBroken) {
        const edgeColor = acc.shieldEdge;
        const finalAlpha = edgeAlpha + sweepBright * 0.6;
        ctx.strokeStyle = this._rgba(edgeColor, Math.min(finalAlpha, 0.95));
        ctx.lineWidth = (1 + sweepBright * 1.5) * this.dpr;
        if (sweepBright > 0.5) {
          ctx.shadowColor = this._rgba(edgeColor, 0.8);
          ctx.shadowBlur = 10 * this.dpr * sweepBright;
        }
        ctx.stroke();
      } else {
        /* Broken cell — short flickering gap lines only */
        ctx.strokeStyle = this._rgba(acc.shieldEdge, 0.25 + Math.random() * 0.1);
        ctx.lineWidth = 0.6 * this.dpr;
        ctx.setLineDash([2 * this.dpr, 3 * this.dpr]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    /* ── LAYER 6: Score progress ring — inner chronograph with fill ── */
    const scoreR = W * 0.39;
    /* Background track with tick marks every 5% */
    for (let i = 0; i <= 100; i += 5) {
      const rad = -Math.PI / 2 + (i / 100) * Math.PI * 2;
      const isMajor = i % 25 === 0;
      ctx.beginPath();
      ctx.strokeStyle = this._rgba([255, 255, 255], isMajor ? 0.25 : 0.10);
      ctx.lineWidth = (isMajor ? 1.2 : 0.7) * this.dpr;
      const len = isMajor ? 7 : 4;
      ctx.moveTo(cx + Math.cos(rad) * (scoreR + 2 * this.dpr), cy + Math.sin(rad) * (scoreR + 2 * this.dpr));
      ctx.lineTo(cx + Math.cos(rad) * (scoreR + (2 + len) * this.dpr), cy + Math.sin(rad) * (scoreR + (2 + len) * this.dpr));
      ctx.stroke();
    }
    /* Track base */
    ctx.beginPath();
    ctx.strokeStyle = this._rgba(acc.a, 0.1);
    ctx.lineWidth = 2 * this.dpr;
    ctx.arc(cx, cy, scoreR, 0, Math.PI * 2);
    ctx.stroke();
    /* Score arc filled */
    const scoreAngle = (this.score / 100) * Math.PI * 2;
    const sg = ctx.createLinearGradient(cx - scoreR, cy, cx + scoreR, cy);
    sg.addColorStop(0, this._rgba(acc.a, 1));
    sg.addColorStop(1, this._rgba(acc.b, 1));
    ctx.save();
    ctx.shadowColor = this._rgba(acc.glow, 0.6);
    ctx.shadowBlur = 16 * this.dpr;
    ctx.beginPath();
    ctx.strokeStyle = sg;
    ctx.lineWidth = 3 * this.dpr;
    ctx.lineCap = 'round';
    ctx.arc(cx, cy, scoreR, -Math.PI / 2, -Math.PI / 2 + scoreAngle);
    ctx.stroke();
    ctx.restore();

    /* ── LAYER 7: 3D Icosahedron — rotate slowly, hard edges ── */
    const rotY = this.motionReduced ? 0 : t * 0.18;
    const rotX = this.motionReduced ? 0.3 : Math.sin(t * 0.13) * 0.2 + 0.4;
    const rotated = this.icosaVerts.map(v => this._rotate(v, rotX, rotY));
    const projected = rotated.map(v => this._project(v.x, v.y, v.z, cx, cy, R));

    /* Edges — only draw if both verts on front hemisphere for clarity */
    const edges = this._icosaEdges();
    ctx.save();
    for (const [i, j] of edges) {
      const a = projected[i], b = projected[j];
      const isBack = a.z > 0.3 && b.z > 0.3;
      const alpha = isBack ? 0.15 : 0.65;
      /* Gradient per edge */
      const eg = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      eg.addColorStop(0, this._rgba(acc.a, alpha));
      eg.addColorStop(1, this._rgba(acc.b, alpha));
      ctx.beginPath();
      ctx.strokeStyle = eg;
      ctx.lineWidth = (isBack ? 1 : 1.5) * this.dpr;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();

    /* ── LAYER 8: Vertex nodes (12 static dots on icosahedron vertices) ── */
    for (const pp of projected) {
      const isFront = pp.z < 0;
      const size = (isFront ? 2.5 : 1.5) * this.dpr * pp.scale;
      const alpha = isFront ? 0.9 : 0.4;
      /* Outer glow */
      ctx.save();
      ctx.shadowColor = this._rgba(acc.glow, 0.8);
      ctx.shadowBlur = 8 * this.dpr;
      ctx.fillStyle = this._rgba(acc.glow, alpha);
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /* ── LAYER 9: Central score — gradient number with glow ── */
    ctx.save();
    /* Halo */
    const haloG = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.6);
    haloG.addColorStop(0, this._rgba(acc.a, 0.25));
    haloG.addColorStop(0.5, this._rgba(acc.b, 0.12));
    haloG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haloG;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2);
    ctx.fill();

    /* Score number */
    ctx.shadowColor = this._rgba(acc.glow, 0.7);
    ctx.shadowBlur = 22 * this.dpr;
    const numG = ctx.createLinearGradient(cx - 50 * this.dpr, cy - 40 * this.dpr, cx + 50 * this.dpr, cy + 40 * this.dpr);
    numG.addColorStop(0, '#FFFFFF');
    numG.addColorStop(0.5, this._rgba(acc.text, 1));
    numG.addColorStop(1, this._rgba(acc.glow, 1));
    ctx.fillStyle = numG;
    ctx.font = `800 ${72 * this.dpr}px Inter, ui-sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(this.score)), cx, cy - 6 * this.dpr);
    ctx.shadowBlur = 0;

    /* Unit "/100" */
    ctx.fillStyle = this._rgba(acc.glow, 0.4);
    ctx.font = `500 ${14 * this.dpr}px 'JetBrains Mono', monospace`;
    ctx.fillText('/ 100', cx, cy + 32 * this.dpr);

    /* Divider line under score */
    const divW = 40 * this.dpr;
    const divY = cy + 52 * this.dpr;
    const divG = ctx.createLinearGradient(cx - divW, divY, cx + divW, divY);
    divG.addColorStop(0, 'rgba(255,255,255,0)');
    divG.addColorStop(0.5, this._rgba(acc.glow, 0.5));
    divG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.strokeStyle = divG;
    ctx.lineWidth = 1 * this.dpr;
    ctx.moveTo(cx - divW, divY);
    ctx.lineTo(cx + divW, divY);
    ctx.stroke();

    /* Bottom label */
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `700 ${9 * this.dpr}px Inter, ui-sans-serif`;
    ctx.textAlign = 'center';
    /* Letter spacing hack — space individually */
    const lbl = 'P U L S   F I R M Y';
    ctx.fillText(lbl, cx, cy + 66 * this.dpr);
    ctx.restore();

    /* ── LAYER 10: Corner digital readouts (HUD-style) ── */
    ctx.save();
    ctx.fillStyle = this._rgba(acc.glow, 0.55);
    ctx.font = `500 ${10 * this.dpr}px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const pad = 18 * this.dpr;
    const lh = 14 * this.dpr;

    /* Top-left */
    ctx.fillText('SYS.OPERATIONAL', pad, pad);
    ctx.fillStyle = this._rgba([255, 255, 255], 0.25);
    ctx.font = `500 ${9 * this.dpr}px 'JetBrains Mono', monospace`;
    ctx.fillText(`T+${this._formatUptime(t)}`, pad, pad + lh);

    /* Top-right */
    ctx.textAlign = 'right';
    ctx.fillStyle = this._rgba(acc.glow, 0.55);
    ctx.font = `500 ${10 * this.dpr}px 'JetBrains Mono', monospace`;
    ctx.fillText('ID.CORE · v2.1', W - pad, pad);
    ctx.fillStyle = this._rgba([255, 255, 255], 0.25);
    ctx.font = `500 ${9 * this.dpr}px 'JetBrains Mono', monospace`;
    ctx.fillText(`DEV ${String(this.devicesCount).padStart(3, '0')}`, W - pad, pad + lh);

    /* Bottom-left */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = this._rgba(acc.glow, 0.55);
    ctx.font = `500 ${10 * this.dpr}px 'JetBrains Mono', monospace`;
    ctx.fillText(this._fmt2(this.score) + '.00', pad, W - pad - lh);
    ctx.fillStyle = this._rgba([255, 255, 255], 0.25);
    ctx.font = `500 ${9 * this.dpr}px 'JetBrains Mono', monospace`;
    ctx.fillText('SCORE', pad, W - pad);

    /* Bottom-right */
    ctx.textAlign = 'right';
    ctx.fillStyle = this._rgba(acc.glow, 0.55);
    ctx.font = `500 ${10 * this.dpr}px 'JetBrains Mono', monospace`;
    const alertText = this.alertsCount > 0 ? `${this.alertsCount} ALERT` : 'ALL CLEAR';
    ctx.fillText(alertText, W - pad, W - pad - lh);
    ctx.fillStyle = this._rgba([255, 255, 255], 0.25);
    ctx.font = `500 ${9 * this.dpr}px 'JetBrains Mono', monospace`;
    ctx.fillText('STATUS', W - pad, W - pad);
    ctx.restore();

    /* ── LAYER 11: Scan line — runs once every ~5s, top to bottom ── */
    if (!this.motionReduced) {
      const scanPhase = (t % 5) / 5; /* 0..1 per 5s */
      if (scanPhase < 0.4) {
        const scanY = cy - R * 1.1 + (scanPhase / 0.4) * (R * 2.2);
        ctx.save();
        const scanG = ctx.createLinearGradient(0, scanY - 4 * this.dpr, 0, scanY + 4 * this.dpr);
        scanG.addColorStop(0, 'rgba(255,255,255,0)');
        scanG.addColorStop(0.5, this._rgba(acc.glow, 0.22));
        scanG.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = scanG;
        /* Clip to circle */
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.1, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillRect(cx - R * 1.2, scanY - 4 * this.dpr, R * 2.4, 8 * this.dpr);
        ctx.restore();
      }
    }

    /* ── LAYER 12: Alerts — precision markers on outer ring ── */
    for (let i = 0; i < Math.min(this.alertsCount, 6); i++) {
      /* Place alerts at specific angles, NOT rotating */
      const angle = -Math.PI / 2 + (i * Math.PI / 3) + Math.PI / 6;
      const ax = cx + Math.cos(angle) * (chronoR + 12 * this.dpr);
      const ay = cy + Math.sin(angle) * (chronoR + 12 * this.dpr);
      /* Triangle marker pointing inward */
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(angle + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -6 * this.dpr);
      ctx.lineTo(-5 * this.dpr, 4 * this.dpr);
      ctx.lineTo(5 * this.dpr, 4 * this.dpr);
      ctx.closePath();
      ctx.fillStyle = this._rgba([248, 113, 113], 0.9);
      ctx.shadowColor = 'rgba(248,113,113,0.8)';
      ctx.shadowBlur = 8 * this.dpr;
      ctx.fill();
      ctx.restore();
    }
  }

  _fmt2(n) { return Math.round(n * 100) / 100; }
  _formatUptime(t) {
    const sec = Math.floor(t);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}

window.PulsFirmy = PulsFirmy;
