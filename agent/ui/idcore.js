/**
 * idcore.js — vanilla port of IrisCore (closed plasma sphere).
 *
 * Mirrors /home/adrian/infradesk/frontend-v2/src/components/iris/IrisCore.tsx
 * without React / Framer Motion. Pure SVG + single requestAnimationFrame loop.
 *
 * Hard rules (matches TSX): NO spikes, NO crosses, NO rays, NO ticks,
 * NO dashed rings, NO radar / target / crosshair look. The form is a
 * SPHERE; nothing reaches outside the aura.
 *
 * Five layers, outer -> inner:
 *   5) Aura                 — widest soft diffusion
 *   4) Containment membrane — thin translucent outer skin (lg + hero)
 *   3) Plasma body          — main mass, off-center gradient (md+)
 *   2) Inner energy field   — gentle glow hugging the nucleus (md+)
 *   1) Nucleus              — tiny hot-white core
 *
 * Public API (unchanged across versions):
 *   window.IdCore.mount(element, opts) -> instance
 *     opts: { size, state, status, score, aiActive, alerts, ariaLabel }
 *   instance.setState(partial)
 *   instance.destroy()
 *
 * Legacy bridge:
 *   window.setCoreState(state)
 *   window.initCoreCanvas(containerId)
 *   window.setAvatarState(state)
 *
 * Sizes: sm=28 md=56 lg=96 hero=200.
 *   sm   -> aura + nucleus
 *   md   -> aura + plasma + inner field + nucleus
 *   lg   -> above + containment membrane + organic flow
 *   hero -> identical to lg, rendered at 200px
 */

(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SIZE_PX = { sm: 28, md: 56, lg: 96, hero: 200 };

  // ------- Palettes -------
  var PALETTE = {
    ok: {
      nucleusHot: '#FFFFFF', nucleusWarm: '#E0F7FF',
      innerField: '#67E8F9',
      plasmaBright: '#E0F7FF', plasmaMid: '#38BDF8',
      plasmaDeep: '#6366F1', plasmaFade: '#1E1B4B',
      membraneA: '#93C5FD', membraneB: '#A78BFA',
      auraInner: '#60A5FA', auraMid: '#6366F1', auraEdge: '#0B1122',
    },
    warning: {
      nucleusHot: '#FFFFFF', nucleusWarm: '#FEF3C7',
      innerField: '#FDE68A',
      plasmaBright: '#FEF3C7', plasmaMid: '#FBBF24',
      plasmaDeep: '#B45309', plasmaFade: '#451A03',
      membraneA: '#FDE68A', membraneB: '#FCA5A5',
      auraInner: '#F59E0B', auraMid: '#B45309', auraEdge: '#1A0A02',
    },
    critical: {
      nucleusHot: '#FFFFFF', nucleusWarm: '#FEE2E2',
      innerField: '#FCA5A5',
      plasmaBright: '#FEE2E2', plasmaMid: '#F87171',
      plasmaDeep: '#B91C1C', plasmaFade: '#450A0A',
      membraneA: '#FCA5A5', membraneB: '#F472B6',
      auraInner: '#EF4444', auraMid: '#991B1B', auraEdge: '#1A0303',
    },
    offline: {
      nucleusHot: '#F3F4F6', nucleusWarm: '#D1D5DB',
      innerField: '#9CA3AF',
      plasmaBright: '#D1D5DB', plasmaMid: '#6B7280',
      plasmaDeep: '#374151', plasmaFade: '#111827',
      membraneA: '#9CA3AF', membraneB: '#6B7280',
      auraInner: '#4B5563', auraMid: '#1F2937', auraEdge: '#000000',
    },
  };

  // ------- State motion profiles -------
  var DEFAULT_PROFILE = {
    auraDur: 5.0,    auraMin: 0.40, auraMax: 0.70,
    breathDur: 4.5,  breathMin: 1.00, breathMax: 1.03,
    fieldDur: 2.8,   fieldMin: 0.55, fieldMax: 0.85,
    nucleusDur: 2.0, nucSclMin: 0.95, nucSclMax: 1.10,
    nucOpMin: 0.90,  nucOpMax: 1.00,
    membraneDur: 6,  memSclMin: 1.00, memSclMax: 1.01,
    frozen: false,
  };

  function profileFor(state, status) {
    if (status === 'offline') {
      return Object.assign({}, DEFAULT_PROFILE, {
        frozen: true, auraMin: 0.25, auraMax: 0.25,
      });
    }
    switch (state) {
      case 'thinking':
        return Object.assign({}, DEFAULT_PROFILE, {
          breathDur: 2.5, breathMax: 1.04,
          fieldDur: 1.6, fieldMax: 0.95,
          nucleusDur: 1.4,
        });
      case 'speaking':
        return Object.assign({}, DEFAULT_PROFILE, {
          breathDur: 2.0,
          nucleusDur: 0.55,
          nucSclMin: 0.90, nucSclMax: 1.22,
          nucOpMin: 0.85,
          fieldDur: 1.2, fieldMax: 0.90,
        });
      case 'listening':
        return Object.assign({}, DEFAULT_PROFILE, {
          breathDur: 4.0,
          fieldDur: 3.0,
          membraneDur: 3.0, memSclMax: 1.02,
        });
      case 'active':
        return Object.assign({}, DEFAULT_PROFILE, {
          breathDur: 3.2, fieldDur: 2.0, nucleusDur: 1.5,
        });
      case 'error':
        return Object.assign({}, DEFAULT_PROFILE, {
          breathDur: 2.6, fieldDur: 1.5, nucleusDur: 1.1,
        });
      default:
        return Object.assign({}, DEFAULT_PROFILE);
    }
  }

  function statusKey(s) {
    if (s === 'critical' || s === 'error') return 'critical';
    if (s === 'warning') return 'warning';
    if (s === 'offline') return 'offline';
    return 'ok';
  }

  function stateKey(state, aiActive, status) {
    if (status === 'offline') return 'idle';
    if (state === 'idle' || state === 'thinking' || state === 'active' ||
        state === 'speaking' || state === 'listening' || state === 'error') return state;
    if (aiActive) return 'thinking';
    return 'idle';
  }

  function gatesForSize(size) {
    switch (size) {
      case 'sm':
        return { aura: true, membrane: false, plasma: false, field: false, nucleus: true, flow: false };
      case 'md':
        return { aura: true, membrane: false, plasma: true, field: true, nucleus: true, flow: false };
      case 'lg':
      case 'hero':
      default:
        return { aura: true, membrane: true, plasma: true, field: true, nucleus: true, flow: true };
    }
  }

  // ------- SVG helpers -------
  function el(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          e.setAttribute(k, attrs[k]);
        }
      }
    }
    return e;
  }

  function radialGrad(id, cx, cy, r, stops) {
    var g = el('radialGradient', { id: id, cx: cx, cy: cy, r: r });
    stops.forEach(function (s) {
      g.appendChild(el('stop', {
        offset: s.offset,
        'stop-color': s.color,
        'stop-opacity': s.opacity,
      }));
    });
    return g;
  }

  function linearGrad(id, stops) {
    var g = el('linearGradient', { id: id, x1: '0', y1: '0', x2: '1', y2: '1' });
    stops.forEach(function (s) {
      g.appendChild(el('stop', {
        offset: s.offset,
        'stop-color': s.color,
        'stop-opacity': s.opacity,
      }));
    });
    return g;
  }

  function blurFilter(id, std, pad) {
    pad = pad || '20%';
    var negPad = '-' + pad.replace('-', '');
    var size = (parseFloat(pad) * 2 + 100) + '%';
    var f = el('filter', { id: id, x: negPad, y: negPad, width: size, height: size });
    f.appendChild(el('feGaussianBlur', { stdDeviation: std }));
    return f;
  }

  function flowFilter(id, seed) {
    var f = el('filter', { id: id, x: '-20%', y: '-20%', width: '140%', height: '140%' });
    var turb = el('feTurbulence', {
      type: 'fractalNoise',
      baseFrequency: '0.018 0.026',
      numOctaves: 2,
      seed: seed,
      result: 'noise',
    });
    f.appendChild(turb);
    f.appendChild(el('feDisplacementMap', {
      in: 'SourceGraphic', in2: 'noise', scale: 1.8,
    }));
    f.appendChild(el('feGaussianBlur', { stdDeviation: 0.8 }));
    return f;
  }

  // ------- Core mount -------
  function mountSvgOrb(container, opts) {
    opts = opts || {};
    var size = opts.size || 'md';
    if (!SIZE_PX[size]) size = 'md';
    var px = SIZE_PX[size];

    var status = statusKey(opts.status || 'ok');
    var sKey = stateKey(opts.state || 'idle', !!opts.aiActive, status);
    var isError = (opts.state === 'error');
    var palette = isError ? PALETTE.critical : PALETTE[status];
    var prof = profileFor(sKey, status);
    var gates = gatesForSize(size);

    var uid = 'idc' + Math.random().toString(36).slice(2, 8);
    var seed = Math.floor(Math.random() * 1000);

    var svg = el('svg', {
      viewBox: '-100 -100 200 200',
      width: px, height: px,
      'aria-label': opts.ariaLabel || 'ID CORE',
      role: 'img',
    });
    svg.style.overflow = 'visible';
    svg.style.display = 'block';

    // Defs
    var defs = el('defs');

    defs.appendChild(radialGrad('aura-' + uid, '50%', '50%', '50%', [
      { offset: '0%',   color: palette.auraInner, opacity: 0.32 },
      { offset: '55%',  color: palette.auraMid,   opacity: 0.14 },
      { offset: '100%', color: palette.auraEdge,  opacity: 0 },
    ]));

    defs.appendChild(linearGrad('membrane-' + uid, [
      { offset: '0%',   color: palette.membraneA, opacity: 0.55 },
      { offset: '50%',  color: palette.membraneB, opacity: 0.35 },
      { offset: '100%', color: palette.membraneA, opacity: 0.55 },
    ]));

    defs.appendChild(radialGrad('plasma-' + uid, '40%', '40%', '65%', [
      { offset: '0%',   color: palette.plasmaBright, opacity: 0.92 },
      { offset: '18%',  color: palette.innerField,   opacity: 1 },
      { offset: '48%',  color: palette.plasmaMid,    opacity: 0.92 },
      { offset: '78%',  color: palette.plasmaDeep,   opacity: 0.62 },
      { offset: '100%', color: palette.plasmaFade,   opacity: 0.20 },
    ]));

    defs.appendChild(radialGrad('innerField-' + uid, '50%', '50%', '50%', [
      { offset: '0%',   color: '#FFFFFF',           opacity: 0.95 },
      { offset: '55%',  color: palette.innerField,  opacity: 0.45 },
      { offset: '100%', color: palette.innerField,  opacity: 0 },
    ]));

    defs.appendChild(radialGrad('nucleus-' + uid, '50%', '50%', '50%', [
      { offset: '0%',   color: palette.nucleusHot,  opacity: 1 },
      { offset: '45%',  color: palette.nucleusWarm, opacity: 1 },
      { offset: '100%', color: palette.innerField,  opacity: 0.35 },
    ]));

    defs.appendChild(blurFilter('auraBlur-' + uid, 7, '50%'));
    defs.appendChild(blurFilter('plasmaBlur-' + uid, 1.1, '20%'));
    defs.appendChild(blurFilter('softBlur-' + uid, 0.6, '20%'));
    defs.appendChild(flowFilter('flow-' + uid, seed));

    svg.appendChild(defs);

    // Root
    var root = el('g');
    root.style.transformOrigin = 'center';
    svg.appendChild(root);

    // ---- AURA ----
    var aura = null;
    if (gates.aura) {
      aura = el('circle', {
        r: 92,
        fill: 'url(#aura-' + uid + ')',
        filter: 'url(#auraBlur-' + uid + ')',
      });
      root.appendChild(aura);
    }

    // ---- Plasma + membrane group (breathes together) ----
    var bodyGroup = el('g');
    bodyGroup.style.transformOrigin = 'center';
    root.appendChild(bodyGroup);

    if (gates.plasma) {
      // Outer soft haze
      bodyGroup.appendChild(el('circle', {
        r: 62,
        fill: 'url(#plasma-' + uid + ')',
        filter: 'url(#plasmaBlur-' + uid + ')',
        opacity: 0.55,
      }));
      // Mid plasma with optional organic flow
      var midG = el('g', {
        filter: gates.flow
          ? 'url(#flow-' + uid + ')'
          : 'url(#plasmaBlur-' + uid + ')',
      });
      midG.appendChild(el('circle', {
        r: 52,
        fill: 'url(#plasma-' + uid + ')',
        opacity: 0.95,
      }));
      bodyGroup.appendChild(midG);
      // Inner bright core layer
      bodyGroup.appendChild(el('circle', {
        r: 32,
        fill: 'url(#plasma-' + uid + ')',
        filter: 'url(#softBlur-' + uid + ')',
        opacity: 0.85,
      }));
    }

    // ---- Containment membrane ----
    var membrane = null;
    if (gates.membrane) {
      membrane = el('circle', {
        r: 60,
        fill: 'none',
        stroke: 'url(#membrane-' + uid + ')',
        'stroke-width': 0.9,
        opacity: 0.75,
      });
      membrane.style.transformOrigin = 'center';
      bodyGroup.appendChild(membrane);

      bodyGroup.appendChild(el('circle', {
        r: 58.2,
        fill: 'none',
        stroke: palette.membraneA,
        'stroke-width': 0.3,
        opacity: 0.30,
      }));
    }

    // ---- Inner energy field ----
    var field = null;
    if (gates.field) {
      field = el('circle', {
        r: 22,
        fill: 'url(#innerField-' + uid + ')',
        filter: 'url(#plasmaBlur-' + uid + ')',
      });
      field.style.transformOrigin = 'center';
      root.appendChild(field);
    }

    // ---- Nucleus ----
    var nucleus = null;
    if (gates.nucleus) {
      nucleus = el('circle', {
        r: 4,
        fill: 'url(#nucleus-' + uid + ')',
      });
      nucleus.style.transformOrigin = 'center';
      root.appendChild(nucleus);

      root.appendChild(el('circle', {
        r: 1.2,
        fill: palette.nucleusHot,
        opacity: 0.95,
      }));
    }

    container.appendChild(svg);

    // ------- Animation loop -------
    var running = true;
    var raf = 0;
    var t0 = performance.now();

    function lerp(a, b, t) { return a + (b - a) * t; }
    function osc(t, dur) { return (Math.sin((t / dur) * Math.PI * 2) + 1) / 2; }

    function tick(now) {
      if (!running) return;
      var t = (now - t0) / 1000;

      if (prof.frozen) {
        if (aura) aura.setAttribute('opacity', ((prof.auraMin + prof.auraMax) / 2).toFixed(3));
        raf = requestAnimationFrame(tick);
        return;
      }

      // Aura pulse
      if (aura) {
        var a = osc(t, prof.auraDur);
        aura.setAttribute('opacity', lerp(prof.auraMin, prof.auraMax, a).toFixed(3));
      }

      // Body breath
      var b = osc(t, prof.breathDur);
      var bsc = lerp(prof.breathMin, prof.breathMax, b);
      bodyGroup.setAttribute('transform', 'scale(' + bsc.toFixed(4) + ')');

      // Membrane slow breath (overlaid on top of body scale via its own transform)
      if (membrane) {
        var mb = osc(t, prof.membraneDur);
        var msc = lerp(prof.memSclMin, prof.memSclMax, mb);
        membrane.setAttribute('transform', 'scale(' + msc.toFixed(4) + ')');
      }

      // Inner energy field
      if (field) {
        var f = osc(t, prof.fieldDur);
        field.setAttribute('opacity', lerp(prof.fieldMin, prof.fieldMax, f).toFixed(3));
      }

      // Nucleus
      if (nucleus) {
        var n = osc(t, prof.nucleusDur);
        var nsc = lerp(prof.nucSclMin, prof.nucSclMax, n);
        var nop = lerp(prof.nucOpMin, prof.nucOpMax, n);
        nucleus.setAttribute('transform', 'scale(' + nsc.toFixed(4) + ')');
        nucleus.setAttribute('opacity', nop.toFixed(3));
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);

    return {
      setState: function (partial) {
        partial = partial || {};
        var merged = {
          size: opts.size,
          state: partial.state !== undefined ? partial.state : opts.state,
          status: partial.status !== undefined ? partial.status : opts.status,
          aiActive: partial.aiActive !== undefined ? partial.aiActive : opts.aiActive,
          score: partial.score !== undefined ? partial.score : opts.score,
          alerts: partial.alerts !== undefined ? partial.alerts : opts.alerts,
          ariaLabel: partial.ariaLabel !== undefined ? partial.ariaLabel : opts.ariaLabel,
        };
        running = false;
        cancelAnimationFrame(raf);
        if (svg.parentNode) svg.parentNode.removeChild(svg);
        var fresh = mountSvgOrb(container, merged);
        this.setState = fresh.setState;
        this.destroy = fresh.destroy;
      },
      destroy: function () {
        running = false;
        cancelAnimationFrame(raf);
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },
    };
  }

  // ------- Public mount -------
  function mount(element, opts) {
    opts = opts || {};
    opts.size = opts.size || 'md';
    opts.status = opts.status || 'ok';
    if (!element) return { setState: function () {}, destroy: function () {} };
    while (element.firstChild) element.removeChild(element.firstChild);
    element.style.display = element.style.display || 'inline-block';
    element.style.position = element.style.position || 'relative';
    element.style.lineHeight = element.style.lineHeight || '0';
    return mountSvgOrb(element, opts);
  }

  // ------- Legacy bridge -------
  var _instances = Object.create(null);

  function inferSize(el) {
    var w = el.clientWidth || 96;
    if (w <= 32) return 'sm';
    if (w <= 64) return 'md';
    if (w <= 140) return 'lg';
    return 'hero';
  }

  function initCoreCanvas(containerId, opts) {
    var el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el) return null;
    var key = el.id || ('__anon_' + Math.random().toString(36).slice(2));
    if (_instances[key]) { _instances[key].destroy(); }
    var inst = mount(el, opts || { size: inferSize(el) });
    _instances[key] = inst;
    return inst;
  }

  function setCoreState(state) {
    var map = {
      idle:     { state: 'idle',      aiActive: false, status: 'ok' },
      scanning: { state: 'thinking',  aiActive: true,  status: 'ok' },
      fixing:   { state: 'speaking',  aiActive: true,  status: 'ok' },
      success:  { state: 'idle',      aiActive: false, status: 'ok' },
      warning:  { state: 'idle',      aiActive: false, status: 'warning' },
      error:    { state: 'error',     aiActive: false, status: 'critical' },
    };
    var payload = map[state] || { state: state };
    Object.keys(_instances).forEach(function (k) {
      if (_instances[k] && _instances[k].setState) _instances[k].setState(payload);
    });
  }

  global.IdCore = { mount: mount };
  global.initCoreCanvas = initCoreCanvas;
  global.setCoreState = setCoreState;
  global.setAvatarState = setCoreState;

})(typeof window !== 'undefined' ? window : this);
