import type { CSSProperties } from 'react';
import { useTheme } from '../store/themeStore';

/**
 * InfraDesk Design System v1 — exact match Asystent.
 * Premium dark navy + pearl light.
 */
export function useDS() {
  const { resolved } = useTheme();
  const L = resolved === 'light';

  return {
    L,
    resolved,

    /* ── Cards — DS v1 exact: navy gradient + highlight line + deep shadow ── */
    card: {
      background: L
        ? 'rgba(255,255,255,0.75)'
        : 'linear-gradient(180deg, rgba(9,19,40,0.82), rgba(7,15,31,0.88))',
      border: L ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(120,160,255,0.09)',
      borderRadius: 18,
      backdropFilter: L ? 'blur(18px) saturate(1.5)' : 'blur(20px)',
      WebkitBackdropFilter: L ? 'blur(18px) saturate(1.5)' : 'blur(20px)',
      boxShadow: L
        ? '0 15px 35px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)'
        : '0 16px 40px rgba(2,8,20,0.45), inset 0 1px 0 rgba(255,255,255,0.03)',
    } as CSSProperties,

    cardElevated: {
      background: L
        ? 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(16,185,129,0.12)), rgba(255,255,255,0.75)'
        : `radial-gradient(circle at 38% 42%, rgba(102,142,255,0.08), transparent 50%),
           radial-gradient(circle at 72% 36%, rgba(127,87,255,0.06), transparent 45%),
           linear-gradient(135deg, rgba(14,28,57,0.96), rgba(13,24,48,0.92), rgba(10,20,41,0.96))`,
      border: L ? '1px solid rgba(255,255,255,0.45)' : '1px solid rgba(130,165,255,0.10)',
      borderRadius: 18,
      backdropFilter: L ? 'blur(20px) saturate(1.8)' : 'blur(28px) saturate(1.5)',
      WebkitBackdropFilter: L ? 'blur(20px) saturate(1.8)' : 'blur(28px) saturate(1.5)',
      boxShadow: L
        ? '0 32px 80px rgba(0,0,0,0.12), 0 0 70px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.9)'
        : '0 24px 60px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.04)',
    } as CSSProperties,

    /* ── Text — DS v1.1 palette ── */
    h1: { color: L ? '#0f172a' : '#EEF2FA' } as CSSProperties,
    h2: { color: L ? '#1e293b' : 'rgba(255,255,255,0.85)' } as CSSProperties,
    subtitle: { color: L ? '#475569' : '#8B95AD' } as CSSProperties,
    body: { color: L ? '#334155' : 'rgba(255,255,255,0.65)' } as CSSProperties,
    meta: { color: L ? '#64748b' : '#576380' } as CSSProperties,
    muted: { color: L ? '#94a3b8' : '#3D4660' } as CSSProperties,

    textPrimary: L ? '#0f172a' : '#EEF2FA',
    textSecondary: L ? '#475569' : '#8B95AD',
    textMuted: L ? '#64748b' : '#576380',
    textDim: L ? '#94a3b8' : '#3D4660',

    divider: { borderBottom: L ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.05)' } as CSSProperties,

    /* ── CTA — DS v1 gradient ── */
    cta: {
      background: 'linear-gradient(135deg, #4f8cff 0%, #7d67ff 100%)',
      boxShadow: '0 10px 30px rgba(79,140,255,0.18), 0 0 22px rgba(125,103,255,0.14), inset 0 1px 0 rgba(255,255,255,0.12)',
      color: '#fff',
    } as CSSProperties,

    hover: L ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
    hoverStrong: L ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',

    input: {
      background: L ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.04)',
      border: L ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.07)',
      color: L ? '#182035' : '#EEF2FA',
    } as CSSProperties,

    inputFocus: {
      borderColor: L ? 'rgba(79,140,255,0.4)' : 'rgba(79,140,255,0.4)',
      boxShadow: L ? '0 0 0 3px rgba(79,140,255,0.1)' : '0 0 0 3px rgba(79,140,255,0.08)',
    },

    pageBg: L ? '#f8fafc' : '#040a16',

    badge: (color: string) => {
      const map: Record<string, { bg: string; text: string }> = {
        gray:   { bg: L ? 'rgba(107,114,128,0.1)' : 'rgba(107,114,128,0.15)', text: L ? '#6B7280' : '#9CA3AF' },
        blue:   { bg: L ? 'rgba(37,99,235,0.1)' : 'rgba(96,165,250,0.12)',    text: L ? '#2563EB' : '#60A5FA' },
        green:  { bg: L ? 'rgba(5,150,105,0.1)' : 'rgba(34,197,94,0.12)',     text: L ? '#059669' : '#4ADE80' },
        yellow: { bg: L ? 'rgba(217,119,6,0.1)' : 'rgba(251,191,36,0.12)',    text: L ? '#D97706' : '#FBBF24' },
        orange: { bg: L ? 'rgba(234,88,12,0.1)' : 'rgba(251,146,60,0.12)',    text: L ? '#EA580C' : '#FB923C' },
        red:    { bg: L ? 'rgba(220,38,38,0.1)' : 'rgba(248,113,113,0.12)',   text: L ? '#DC2626' : '#F87171' },
        indigo: { bg: L ? 'rgba(79,70,229,0.1)' : 'rgba(129,140,248,0.12)',   text: L ? '#4F46E5' : '#818CF8' },
        purple: { bg: L ? 'rgba(124,58,237,0.1)' : 'rgba(167,139,250,0.12)',  text: L ? '#7C3AED' : '#A78BFA' },
        pink:   { bg: L ? 'rgba(219,39,119,0.1)' : 'rgba(244,114,182,0.12)', text: L ? '#DB2777' : '#F472B6' },
      };
      return map[color] ?? map.gray;
    },
  };
}
