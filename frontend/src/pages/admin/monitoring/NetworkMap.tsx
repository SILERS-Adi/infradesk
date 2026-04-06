import { useState, useMemo } from 'react';
import {
  Globe, Server, Monitor, Printer, Terminal, Wifi, RefreshCw,
} from 'lucide-react';
import { apiClient } from '../../../api/client';

/* ── Types ─────────────────────────────────────────────────────────────── */

interface NetDevice {
  ip: string;
  mac: string;
  hostname: string;
  ports: number[];
  type: 'router' | 'server' | 'windows' | 'linux' | 'printer' | 'network' | 'unknown';
}

interface NetworkMapProps {
  agent: any; // AgentRegistration with serverMetrics.networkScan
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

const DEVICE_COLORS: Record<string, string> = {
  router:  '#60A5FA',
  server:  '#A78BFA',
  windows: '#22D3EE',
  linux:   '#4ADE80',
  printer: '#FB923C',
  network: '#FBBF24',
  unknown: 'var(--td)',
};

function deviceIcon(type: string, size = 16) {
  const props = { size, strokeWidth: 1.8 };
  switch (type) {
    case 'router':  return <Globe {...props} />;
    case 'server':  return <Server {...props} />;
    case 'windows': return <Monitor {...props} />;
    case 'linux':   return <Terminal {...props} />;
    case 'printer': return <Printer {...props} />;
    case 'network': return <Wifi {...props} />;
    default:        return <Monitor {...props} />;
  }
}

function formatUptime(lastBootTime: string | undefined): string {
  if (!lastBootTime) return '—';
  const diff = Date.now() - new Date(lastBootTime).getTime();
  if (diff < 0) return '—';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  return `Działa od ${days} dni ${hours} godzin`;
}

/* ── Component ─────────────────────────────────────────────────────────── */

export default function NetworkMap({ agent }: NetworkMapProps) {
  const [scanning, setScanning] = useState(false);
  const [tooltip, setTooltip] = useState<{ device: NetDevice; x: number; y: number } | null>(null);

  const scan = agent?.serverMetrics?.networkScan as
    | { scannedAt: string; subnet: string; gateway: string; devices: NetDevice[] }
    | undefined;

  const devices: NetDevice[] = scan?.devices ?? [];
  const agentId = agent?._id ?? agent?.id;

  /* ── Radial layout ──────────────────────────────────────────────────── */

  const SVG_SIZE = 520;
  const CX = SVG_SIZE / 2;
  const CY = SVG_SIZE / 2;
  const RADIUS = 200;
  const NODE_R = 22;

  const positions = useMemo(() => {
    return devices.map((_, i) => {
      const angle = (2 * Math.PI * i) / (devices.length || 1) - Math.PI / 2;
      return {
        x: CX + RADIUS * Math.cos(angle),
        y: CY + RADIUS * Math.sin(angle),
      };
    });
  }, [devices.length]);

  /* ── Actions ────────────────────────────────────────────────────────── */

  async function handleScan() {
    if (!agentId || scanning) return;
    setScanning(true);
    try {
      await apiClient.post(`/agent/${agentId}/command`, { command: 'scan_network' });
    } catch {
      /* ignore – UI will update via WS */
    } finally {
      setTimeout(() => setScanning(false), 4000);
    }
  }

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--t)' }}>
            Mapa sieci
          </h3>
          {agent?.lastBootTime && (
            <span style={{ fontSize: 12, color: 'var(--ts)' }}>
              {formatUptime(agent.lastBootTime)}
            </span>
          )}
          {scan && (
            <span style={{ fontSize: 11, color: 'var(--td)' }}>
              Podsieć: {scan.subnet} &middot; Brama: {scan.gateway} &middot; Urządzenia: {devices.length}
            </span>
          )}
        </div>

        <button
          onClick={handleScan}
          disabled={scanning || !agentId}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', fontSize: 13, fontWeight: 500,
            borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--t)',
            cursor: scanning ? 'wait' : 'pointer',
            opacity: scanning ? 0.6 : 1,
          }}
        >
          <RefreshCw size={14} style={{
            animation: scanning ? 'spin 1s linear infinite' : 'none',
          }} />
          {scanning ? 'Skanowanie...' : 'Skanuj teraz'}
        </button>
      </div>

      {/* SVG Map */}
      {devices.length === 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 260, color: 'var(--ts)', fontSize: 14,
          border: '1px dashed var(--border)', borderRadius: 8,
        }}>
          Brak danych o sieci — kliknij „Skanuj teraz"
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
            width="100%"
            style={{ maxWidth: SVG_SIZE, display: 'block', margin: '0 auto' }}
          >
            {/* Lines from center to devices */}
            {positions.map((pos, i) => (
              <line
                key={`line-${i}`}
                x1={CX} y1={CY}
                x2={pos.x} y2={pos.y}
                stroke="var(--border)"
                strokeWidth={1.5}
              />
            ))}

            {/* Gateway node */}
            <circle cx={CX} cy={CY} r={NODE_R + 8} fill="#2563EB" opacity={0.15} />
            <circle cx={CX} cy={CY} r={NODE_R} fill="#2563EB" />
            <foreignObject x={CX - 10} y={CY - 10} width={20} height={20}>
              <div style={{ color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Globe size={16} strokeWidth={2} />
              </div>
            </foreignObject>
            <text
              x={CX} y={CY + NODE_R + 14}
              textAnchor="middle" fontSize={10} fill="var(--ts)" fontWeight={600}
            >
              {scan?.gateway ?? 'Gateway'}
            </text>

            {/* Device nodes */}
            {devices.map((dev, i) => {
              const { x, y } = positions[i];
              const color = DEVICE_COLORS[dev.type] ?? DEVICE_COLORS.unknown;
              return (
                <g
                  key={`dev-${i}`}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => {
                    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    const scaleX = rect.width / SVG_SIZE;
                    const scaleY = rect.height / SVG_SIZE;
                    setTooltip({
                      device: dev,
                      x: rect.left + x * scaleX,
                      y: rect.top + y * scaleY - 10,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <circle cx={x} cy={y} r={NODE_R} fill={color} opacity={0.18} />
                  <circle cx={x} cy={y} r={NODE_R - 5} fill={color} />
                  <foreignObject x={x - 8} y={y - 8} width={16} height={16}>
                    <div style={{ color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {deviceIcon(dev.type, 13)}
                    </div>
                  </foreignObject>
                  <text
                    x={x} y={y + NODE_R + 12}
                    textAnchor="middle" fontSize={9} fill="var(--tm)"
                  >
                    {dev.hostname || dev.ip}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div
              style={{
                position: 'fixed',
                left: tooltip.x,
                top: tooltip.y,
                transform: 'translate(-50%, -100%)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12,
                color: 'var(--t)',
                boxShadow: '0 4px 12px rgba(0,0,0,.15)',
                pointerEvents: 'none',
                zIndex: 9999,
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {tooltip.device.hostname || 'Nieznany host'}
              </div>
              <div style={{ color: 'var(--ts)' }}>IP: {tooltip.device.ip}</div>
              <div style={{ color: 'var(--ts)' }}>MAC: {tooltip.device.mac || '—'}</div>
              {tooltip.device.ports.length > 0 && (
                <div style={{ color: 'var(--ts)' }}>
                  Porty: {tooltip.device.ports.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Spin keyframe (injected once) */}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
