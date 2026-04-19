/**
 * ID PANEL — Design Tokens (source of truth).
 *
 * Tokens here drive CSS custom properties AND are importable for component styles.
 * DO NOT duplicate values elsewhere — add a new token, then consume it.
 *
 * CSS side of these lives in ../styles/panel/system.css (same names, --ip-*).
 */

/* ═ COLOR ─────────────────────────────────────────────────── */

export const color = {
  /* Brand */
  blue:       '#3B82F6',
  blueHi:     '#60A5FA',
  blueLo:     '#2563EB',
  blueDeep:   '#1E3A8A',
  blueGlow:   'rgba(59, 130, 246, 0.55)',
  blueSoft:   'rgba(59, 130, 246, 0.10)',
  blueEdge:   'rgba(59, 130, 246, 0.28)',
  cyan:       '#22D3EE',
  cyanHi:     '#7DD3FC',
  indigo:     '#6366F1',

  /* Neutrals — dark */
  darkBg:        '#0A0F1C',
  darkSurface:   '#121A2E',
  darkSurfaceHi: '#182238',
  darkBorder:    'rgba(255, 255, 255, 0.07)',
  darkBorderHi:  'rgba(255, 255, 255, 0.14)',
  darkText:      '#E8EBF4',
  darkText2:     '#A3ABC0',
  darkText3:     '#6B7489',
  darkText4:     '#3D4660',

  /* Neutrals — light */
  lightBg:        '#F4F7FB',
  lightSurface:   '#FFFFFF',
  lightSurfaceHi: '#F8FAFC',
  lightBorder:    'rgba(15, 23, 42, 0.06)',
  lightBorderHi:  'rgba(15, 23, 42, 0.12)',
  lightText:      '#0B1220',
  lightText2:     '#334155',
  lightText3:     '#64748B',
  lightText4:     '#CBD5E1',

  /* Status */
  ok:         '#22C55E',
  okLight:    '#16A34A',
  okSoft:     'rgba(34, 197, 94, 0.10)',
  warn:       '#F59E0B',
  warnLight:  '#D97706',
  warnSoft:   'rgba(245, 158, 11, 0.10)',
  bad:        '#EF4444',
  badLight:   '#DC2626',
  badSoft:    'rgba(239, 68, 68, 0.10)',
  gray:       '#6B7280',
  graySoft:   'rgba(107, 114, 128, 0.10)',
};

/* ═ RADII ──────────────────────────────────────────────────── */

export const radius = {
  xs:   '4px',
  sm:   '8px',
  md:   '12px',
  lg:   '16px',
  xl:   '20px',
  xxl:  '24px',
  full: '9999px',
};

/* ═ SHADOWS ────────────────────────────────────────────────── */

export const shadow = {
  /* Dark */
  darkSubtle:  '0 1px 2px rgba(0,0,0,0.25)',
  darkSoft:    '0 1px 2px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.2)',
  darkMd:      '0 1px 2px rgba(0,0,0,0.3), 0 16px 40px rgba(0,0,0,0.38)',
  darkStrong:  '0 4px 8px rgba(0,0,0,0.4), 0 25px 60px rgba(0,0,0,0.5)',
  /* Light */
  lightSubtle: '0 1px 2px rgba(15,23,42,0.03)',
  lightSoft:   '0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.05)',
  lightMd:     '0 1px 2px rgba(15,23,42,0.03), 0 10px 30px rgba(15,23,42,0.06)',
  lightStrong: '0 2px 4px rgba(15,23,42,0.04), 0 25px 60px rgba(0,0,0,0.15)',
  /* Glows */
  glowBrand:   '0 0 32px rgba(59,130,246,0.28)',
  glowOk:      '0 0 24px rgba(34,197,94,0.25)',
  glowWarn:    '0 0 24px rgba(245,158,11,0.30)',
  glowBad:     '0 0 24px rgba(239,68,68,0.35)',
  /* Inner light (top highlight) */
  innerLightDark:  'inset 0 1px 0 rgba(255,255,255,0.05)',
  innerLightLight: 'inset 0 1px 0 rgba(255,255,255,0.85)',
};

/* ═ BLUR ───────────────────────────────────────────────────── */

export const blur = {
  glass:   '10px',
  overlay: '16px',
  strong:  '24px',
};

/* ═ SPACING (8-pt) ─────────────────────────────────────────── */

export const space = {
  0:  '0',
  1:  '4px',
  2:  '8px',
  3:  '12px',
  4:  '16px',
  5:  '20px',
  6:  '24px',
  7:  '28px',
  8:  '32px',
  10: '40px',
  12: '48px',
  16: '64px',
};

/* ═ TYPOGRAPHY ─────────────────────────────────────────────── */

export const font = {
  sans: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
};

export const text = {
  /* Sizes */
  xs:  '11px',
  sm:  '12px',
  base:'13px',
  md:  '14px',
  lg:  '15px',
  xl:  '17px',
  xxl: '20px',
  h3:  '22px',
  h2:  '28px',
  h1:  '36px',
  display: '44px',
};

/* ═ MOTION ─────────────────────────────────────────────────── */

export const motion = {
  durFast:    '120ms',
  durNormal:  '180ms',
  durSlow:    '320ms',
  ease:       'cubic-bezier(0.22, 0.82, 0.32, 1)',
  easeIn:     'cubic-bezier(0.4, 0, 1, 1)',
  easeOut:    'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut:  'cubic-bezier(0.4, 0, 0.2, 1)',
  spring:     'cubic-bezier(0.34, 1.56, 0.64, 1)',
};

/* ═ RULES (hover / active / focus) ─────────────────────────── */

export const state = {
  hoverLift: {
    transform: 'translateY(-4px) scale(1.02)',
    duration:  motion.durNormal,
    easing:    motion.ease,
  },
  activePress: {
    transform: 'translateY(-1px) scale(0.995)',
    duration:  '80ms',
  },
  focusRing: {
    outline:       `2px solid ${color.blue}`,
    outlineOffset: '2px',
  },
};

/* ═ Z-stack ────────────────────────────────────────────────── */

export const z = {
  base:       0,
  elevated:   10,
  sticky:     20,
  drawer:     40,
  modal:      50,
  toast:      60,
  tooltip:    80,
};
