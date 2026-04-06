import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cloud, CheckCircle, XCircle, Clock } from 'lucide-react';
import { apiClient } from '../../../api/client';

/* ── Helpers ──────────────────────────────────────────────────────── */

/** Describe an SVG arc from startAngle to endAngle (radians) */
function describeArc(
  cx: number, cy: number, r: number,
  startAngle: number, endAngle: number,
): string {
  const start = {
    x: cx + r * Math.cos(startAngle),
    y: cy + r * Math.sin(startAngle),
  };
  const end = {
    x: cx + r * Math.cos(endAngle),
    y: cy + r * Math.sin(endAngle),
  };
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/** Format bytes/MB nicely */
function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function daysAgoLabel(d: number): string {
  if (d === 0) return 'Dziś';
  if (d === 1) return 'Wczoraj';
  return `${d} dni temu`;
}

/* ── Styles (inline keyframes via style tag) ─────────────────────── */

const ANIM_STYLE = `
@keyframes bv-fadein  { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
@keyframes bv-spin    { to { transform: rotate(360deg) } }
@keyframes bv-draw    { from { stroke-dashoffset: var(--bv-dashlen) } to { stroke-dashoffset: var(--bv-target) } }
@keyframes bv-scale   { from { transform: scale(0) } to { transform: scale(1) } }
@keyframes bv-pulse   { 0%,100% { opacity:1 } 50% { opacity:.5 } }
@keyframes bv-ring-in { from { stroke-dashoffset: var(--bv-seg-len) } to { stroke-dashoffset: var(--bv-seg-target) } }
`;

/* ══════════════════════════════════════════════════════════════════
   1.  BackupStorageGauge
   ══════════════════════════════════════════════════════════════════ */

interface CloudUsage {
  usedMB: number;
  fileCount: number;
}

const GAUGE_TOTAL_MB = 5 * 1024; // 5 GB

export function BackupStorageGauge() {
  const { data, isLoading, isError } = useQuery<CloudUsage>({
    queryKey: ['backup', 'cloud', 'usage'],
    queryFn: async () => {
      const res = await apiClient.get('/backup/cloud/usage');
      return res.data;
    },
    refetchInterval: 60_000,
  });

  const [animPct, setAnimPct] = useState(0);

  const usedMB = data?.usedMB ?? 0;
  const fileCount = data?.fileCount ?? 0;
  const pct = Math.min((usedMB / GAUGE_TOTAL_MB) * 100, 100);

  useEffect(() => {
    if (!isLoading) {
      // animate from 0 to target
      const raf = requestAnimationFrame(() => setAnimPct(pct));
      return () => cancelAnimationFrame(raf);
    }
  }, [pct, isLoading]);

  // Arc geometry — 240-degree sweep starting from bottom-left
  const cx = 100, cy = 100, r = 80;
  const startAngle = (3 * Math.PI) / 4;       // 135 deg
  const endAngle   = (9 * Math.PI) / 4;       // 405 deg  => total sweep = 270 deg
  const sweep = endAngle - startAngle;         // 4.712 rad
  const circumference = r * sweep;

  const fillAngle = startAngle + sweep * (animPct / 100);
  const dashLen = circumference;
  const dashTarget = circumference * (1 - animPct / 100);

  // color
  const color = animPct < 50 ? '#22c55e' : animPct < 80 ? '#eab308' : '#ef4444';
  const bgTrack = 'var(--border, #334155)';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      animation: 'bv-fadein .5s ease both',
    }}>
      <style>{ANIM_STYLE}</style>

      <svg width={200} height={180} viewBox="0 0 200 180">
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
          <filter id="gauge-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background track */}
        <path
          d={describeArc(cx, cy, r, startAngle, endAngle)}
          fill="none"
          stroke={bgTrack}
          strokeWidth={14}
          strokeLinecap="round"
        />

        {/* Filled arc */}
        {animPct > 0 && (
          <path
            d={describeArc(cx, cy, r, startAngle, endAngle)}
            fill="none"
            stroke="url(#gauge-grad)"
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={`${dashLen}`}
            strokeDashoffset={dashTarget}
            filter="url(#gauge-glow)"
            style={{
              transition: 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)',
            }}
          />
        )}

        {/* Center text */}
        <text
          x={cx} y={cy - 8}
          textAnchor="middle"
          fill="var(--t, #f1f5f9)"
          fontSize={isLoading ? 14 : 26}
          fontWeight={700}
          style={{ fontFamily: 'inherit' }}
        >
          {isLoading ? '...' : isError ? '—' : formatMB(usedMB)}
        </text>
        <text
          x={cx} y={cy + 14}
          textAnchor="middle"
          fill="var(--ts, #94a3b8)"
          fontSize={12}
        >
          z {formatMB(GAUGE_TOTAL_MB)}
        </text>

        {/* Percentage badge */}
        {!isLoading && !isError && (
          <g>
            <rect x={cx - 22} y={cy + 24} width={44} height={22} rx={11}
              fill={color} opacity={0.15} />
            <text x={cx} y={cy + 39} textAnchor="middle"
              fill={color} fontSize={11} fontWeight={600}>
              {Math.round(pct)}%
            </text>
          </g>
        )}

        {/* Scale labels */}
        <text x={28} y={172} textAnchor="middle" fill="var(--ts, #64748b)" fontSize={10}>0%</text>
        <text x={172} y={172} textAnchor="middle" fill="var(--ts, #64748b)" fontSize={10}>100%</text>
      </svg>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        color: 'var(--ts, #94a3b8)', fontSize: 13,
      }}>
        <Cloud size={15} />
        <span>
          {isLoading ? 'Ładowanie...' : isError ? 'Błąd pobierania danych' : `${fileCount} plików w chmurze InfraDesk`}
        </span>
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════
   2.  BackupTimeline
   ══════════════════════════════════════════════════════════════════ */

interface HistoryEntry {
  startedAt?: string;
  completedAt?: string;
  status: string;
  sizeMB?: number;
  error?: string;
}

interface BackupConfig {
  id?: string;
  name?: string;
  history?: HistoryEntry[];
  [key: string]: any;
}

interface TimelineDot {
  configName: string;
  time: Date;
  status: string;
  sizeMB?: number;
  dayOffset: number; // 0 = today, 6 = 6 days ago
  error?: string;
}

export function BackupTimeline({ configs }: { configs: any[] }) {
  const [hovered, setHovered] = useState<TimelineDot | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const dots = useMemo<TimelineDot[]>(() => {
    const items: TimelineDot[] = [];
    for (const cfg of (configs ?? []) as BackupConfig[]) {
      for (const h of cfg.history ?? []) {
        const t = new Date(h.startedAt ?? h.completedAt ?? '');
        if (isNaN(t.getTime()) || t < sevenDaysAgo) continue;
        const dayOffset = Math.floor((now.getTime() - t.getTime()) / (24 * 60 * 60 * 1000));
        items.push({
          configName: cfg.name ?? 'Bez nazwy',
          time: t,
          status: (h.status ?? '').toUpperCase(),
          sizeMB: h.sizeMB,
          dayOffset: Math.min(dayOffset, 6),
          error: h.error,
        });
      }
    }
    return items.sort((a, b) => a.time.getTime() - b.time.getTime());
  }, [configs]);

  if (dots.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        padding: '32px 16px',
        color: 'var(--ts, #94a3b8)',
        animation: 'bv-fadein .5s ease both',
      }}>
        <Clock size={32} strokeWidth={1.5} />
        <span style={{ fontSize: 14 }}>Brak historii backupów</span>
      </div>
    );
  }

  const W = 700, H = 160;
  const padL = 50, padR = 20, padT = 30, padB = 40;
  const axisY = H - padB;
  const usableW = W - padL - padR;

  // Map 7 days → x positions (day 0 = right = today)
  const dayX = (dayOffset: number) => padL + usableW * (1 - dayOffset / 6);

  // Jitter y per config so dots don't overlap
  const configNames = [...new Set(dots.map(d => d.configName))];
  const yBand = (padT + 10);
  const yStep = Math.min(20, (axisY - padT - 20) / Math.max(configNames.length, 1));
  const configY = (name: string) => {
    const idx = configNames.indexOf(name);
    return yBand + idx * yStep;
  };

  const statusColor = (s: string) =>
    s === 'SUCCESS' ? '#22c55e' : s === 'FAILED' ? '#ef4444' : s === 'RUNNING' ? '#3b82f6' : '#64748b';

  const handleMouseEnter = (dot: TimelineDot, e: React.MouseEvent<SVGCircleElement>) => {
    setHovered(dot);
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  return (
    <div style={{ position: 'relative', animation: 'bv-fadein .5s ease both' }}>
      <style>{ANIM_STYLE}</style>
      <svg ref={svgRef} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="tl-glow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Axis line */}
        <line x1={padL} y1={axisY} x2={W - padR} y2={axisY}
          stroke="var(--border, #334155)" strokeWidth={2} />

        {/* Day ticks */}
        {Array.from({ length: 7 }, (_, i) => {
          const x = dayX(i);
          return (
            <g key={i}>
              <line x1={x} y1={axisY - 4} x2={x} y2={axisY + 4}
                stroke="var(--border, #475569)" strokeWidth={1.5} />
              <text x={x} y={axisY + 18} textAnchor="middle"
                fill="var(--ts, #64748b)" fontSize={10}>
                {daysAgoLabel(i)}
              </text>
              {/* Subtle vertical grid */}
              <line x1={x} y1={padT} x2={x} y2={axisY - 6}
                stroke="var(--border, #1e293b)" strokeWidth={0.5} strokeDasharray="3 4" />
            </g>
          );
        })}

        {/* Connector lines per config */}
        {configNames.map(name => {
          const cfgDots = dots.filter(d => d.configName === name).sort((a, b) => a.time.getTime() - b.time.getTime());
          if (cfgDots.length < 2) return null;
          const points = cfgDots.map(d => `${dayX(d.dayOffset)},${configY(d.configName)}`).join(' ');
          return (
            <polyline key={name} points={points}
              fill="none" stroke="var(--border, #334155)" strokeWidth={1}
              strokeDasharray="4 3" opacity={0.5} />
          );
        })}

        {/* Dots */}
        {dots.map((dot, i) => {
          const x = dayX(dot.dayOffset);
          const y = configY(dot.configName);
          const c = statusColor(dot.status);
          const isRunning = dot.status === 'RUNNING';
          return (
            <g key={i} style={{ animation: `bv-scale .4s ease ${i * 40}ms both`, transformOrigin: `${x}px ${y}px` }}>
              {/* Outer glow ring */}
              <circle cx={x} cy={y} r={8} fill={c} opacity={0.15}
                filter="url(#tl-glow)"
                style={isRunning ? { animation: 'bv-pulse 1.5s infinite' } : {}} />
              {/* Main dot */}
              <circle cx={x} cy={y} r={5} fill={c}
                stroke="#0f172a" strokeWidth={1.5}
                style={{ cursor: 'pointer', ...(isRunning ? { animation: 'bv-pulse 1s infinite' } : {}) }}
                onMouseEnter={(e) => handleMouseEnter(dot, e)}
                onMouseLeave={() => setHovered(null)} />
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div style={{
          position: 'absolute',
          left: tooltipPos.x + 12,
          top: tooltipPos.y - 10,
          background: 'var(--bg-card, #1e293b)',
          border: '1px solid var(--border, #334155)',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 12,
          color: 'var(--t, #f1f5f9)',
          pointerEvents: 'none',
          zIndex: 50,
          minWidth: 160,
          boxShadow: '0 8px 24px rgba(0,0,0,.4)',
          animation: 'bv-fadein .15s ease',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{hovered.configName}</div>
          <div style={{ color: 'var(--ts, #94a3b8)' }}>
            {hovered.time.toLocaleString('pl-PL')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: statusColor(hovered.status), display: 'inline-block',
            }} />
            <span>{hovered.status === 'SUCCESS' ? 'Sukces' : hovered.status === 'FAILED' ? 'Błąd' : hovered.status === 'RUNNING' ? 'W trakcie' : hovered.status}</span>
          </div>
          {hovered.sizeMB != null && (
            <div style={{ color: 'var(--ts, #94a3b8)', marginTop: 2 }}>
              Rozmiar: {formatMB(hovered.sizeMB)}
            </div>
          )}
          {hovered.error && (
            <div style={{ color: '#ef4444', marginTop: 2, maxWidth: 220, wordBreak: 'break-word' }}>
              {hovered.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════
   3.  BackupStatusRing
   ══════════════════════════════════════════════════════════════════ */

interface StatusSegment {
  label: string;
  count: number;
  color: string;
}

export function BackupStatusRing({ configs }: { configs: any[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  const segments = useMemo<StatusSegment[]>(() => {
    let success = 0, failed = 0, running = 0, never = 0;
    for (const cfg of (configs ?? []) as BackupConfig[]) {
      const hist = cfg.history ?? [];
      if (hist.length === 0) { never++; continue; }
      const last = hist[hist.length - 1];
      const st = (last.status ?? '').toUpperCase();
      if (st === 'SUCCESS') success++;
      else if (st === 'FAILED') failed++;
      else if (st === 'RUNNING') running++;
      else never++;
    }
    return [
      { label: 'Sukces', count: success, color: '#22c55e' },
      { label: 'Błąd', count: failed, color: '#ef4444' },
      { label: 'W trakcie', count: running, color: '#3b82f6' },
      { label: 'Nigdy', count: never, color: '#64748b' },
    ];
  }, [configs]);

  const total = segments.reduce((s, seg) => s + seg.count, 0);
  const activeSegments = segments.filter(s => s.count > 0);

  // Donut params
  const cx = 90, cy = 90, r = 70;
  const strokeW = 18;
  const circumference = 2 * Math.PI * r;
  const gap = activeSegments.length > 1 ? 4 : 0; // px gap between segments
  const totalGap = gap * activeSegments.length;
  const usable = circumference - totalGap;

  // Build segment arcs
  let offset = 0;
  const arcs = activeSegments.map((seg) => {
    const segLen = total > 0 ? (seg.count / total) * usable : 0;
    const arc = {
      ...seg,
      dasharray: `${segLen} ${circumference - segLen}`,
      dashoffset: mounted ? -offset : circumference,
      targetOffset: -offset,
      length: segLen,
    };
    offset += segLen + gap;
    return arc;
  });

  const iconMap: Record<string, React.ReactNode> = {
    'Sukces':    <CheckCircle size={13} color="#22c55e" />,
    'Błąd':      <XCircle size={13} color="#ef4444" />,
    'W trakcie': <Clock size={13} color="#3b82f6" />,
    'Nigdy':     <Clock size={13} color="#64748b" />,
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      animation: 'bv-fadein .5s ease both',
    }}>
      <style>{ANIM_STYLE}</style>

      <svg width={180} height={180} viewBox="0 0 180 180">
        <defs>
          <filter id="ring-shadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* Background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke="var(--border, #1e293b)" strokeWidth={strokeW} />

        {/* Segments */}
        {arcs.map((arc, i) => (
          <circle
            key={arc.label}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeW - 2}
            strokeLinecap="round"
            strokeDasharray={arc.dasharray}
            strokeDashoffset={arc.dashoffset}
            filter="url(#ring-shadow)"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{
              transition: `stroke-dashoffset 1s cubic-bezier(.4,0,.2,1) ${i * 150}ms`,
            }}
          />
        ))}

        {/* Center number */}
        <text x={cx} y={cy - 4} textAnchor="middle"
          fill="var(--t, #f1f5f9)" fontSize={32} fontWeight={700}
          style={{ fontFamily: 'inherit' }}>
          {total}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle"
          fill="var(--ts, #94a3b8)" fontSize={11}>
          {total === 1 ? 'konfiguracja' : total < 5 ? 'konfiguracje' : 'konfiguracji'}
        </text>
      </svg>

      {/* Legend */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 16px',
      }}>
        {segments.map(seg => (
          <div key={seg.label} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, color: 'var(--ts, #cbd5e1)',
            opacity: seg.count > 0 ? 1 : 0.4,
          }}>
            {iconMap[seg.label]}
            <span>{seg.label}</span>
            <span style={{ fontWeight: 600, color: seg.color }}>{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
