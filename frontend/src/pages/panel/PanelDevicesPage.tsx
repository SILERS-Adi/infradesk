/**
 * PanelDevicesPage — migrated to primitives.
 * Grid of workspace devices with detail drawer. Uses Card + SearchInput + Badge + EmptyState.
 */

import React from 'react';
import { devicesApi } from '../../api/devices';
import type { Device } from '../../types';
import { Monitor, Search, X, Cpu, Activity, HardDrive } from 'lucide-react';
import { Card, CardHeader, SearchInput, Badge, EmptyState, IconContainer, SectionHeader } from '../../ui/primitives';

function statusTone(status: string): 'ok' | 'warn' | 'bad' | 'gray' {
  if (status === 'ACTIVE') return 'ok';
  if (status === 'IN_SERVICE') return 'warn';
  if (status === 'BROKEN') return 'bad';
  return 'gray';
}
function statusLabel(s: string): string {
  return ({ ACTIVE: 'Online', INACTIVE: 'Offline', IN_SERVICE: 'Serwis', BROKEN: 'Uszkodzone', RETIRED: 'Wycofane' } as Record<string, string>)[s] ?? s;
}

export default function PanelDevicesPage() {
  const [devices, setDevices] = React.useState<Device[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<Device | null>(null);

  React.useEffect(() => {
    devicesApi.getAll().then(d => { setDevices(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return devices;
    const q = search.toLowerCase();
    return devices.filter(d =>
      d.name?.toLowerCase().includes(q) ||
      (d as any).serialNumber?.toLowerCase().includes(q) ||
      (d as any).model?.toLowerCase().includes(q),
    );
  }, [devices, search]);

  const byStatus = React.useMemo(() => {
    const g: Record<string, number> = {};
    for (const d of devices) g[d.status] = (g[d.status] || 0) + 1;
    return g;
  }, [devices]);

  return (
    <>
      <SectionHeader
        title="Moje urządzenia"
        sub={`${devices.length} urządzeń w Twoim workspace`}
        action={<SearchInput placeholder="Szukaj po nazwie, SN, modelu…" icon={<Search size={14} strokeWidth={2} />} value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 280 }} />}
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {Object.entries(byStatus).map(([st, count]) => (
          <Badge key={st} tone={statusTone(st)} live={st === 'ACTIVE'}>
            {statusLabel(st)} · {count}
          </Badge>
        ))}
      </div>

      {loading ? (
        <Card><EmptyState icon={<Monitor size={28} strokeWidth={1.8} />} title="Ładowanie…" sub="Pobieram listę urządzeń" /></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState
          icon={<Monitor size={28} strokeWidth={1.8} />}
          title={search ? 'Brak wyników' : 'Brak urządzeń'}
          sub={search ? 'Nic nie pasuje do filtra' : 'Urządzenia pojawią się po zainstalowaniu agenta'}
        /></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map(d => (
            <Card key={d.id} size="md" interactive onClick={() => setSelected(d)}>
              {/* Header — icon + name + status badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: 'var(--ip-border)', marginBottom: 12 }}>
                <IconContainer size="sm"><Monitor size={16} strokeWidth={2} /></IconContainer>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--ip-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.name}
                </div>
                <Badge tone={statusTone(d.status)} live={d.status === 'ACTIVE'}>{statusLabel(d.status)}</Badge>
              </div>

              {/* Body — meta grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11, fontFamily: 'var(--ip-font-mono)' }}>
                {(d as any).model && <MetaPair label="MODEL" value={(d as any).model} />}
                {(d as any).serialNumber && <MetaPair label="SN" value={(d as any).serialNumber} />}
                {(d as any).ipAddress && <MetaPair label="IP" value={(d as any).ipAddress} />}
                {d.criticality && <MetaPair label="KRYT." value={d.criticality} />}
              </div>
            </Card>
          ))}
        </div>
      )}

      {selected && <DeviceDrawer device={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function MetaPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--ip-text-3)', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 2 }}>{label}</div>
      <div style={{ color: 'var(--ip-text-2)', fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function DeviceDrawer({ device, onClose }: { device: Device; onClose: () => void }) {
  const rows: [string, string][] = [
    ['ID', device.id],
    ['Nazwa', device.name],
    ['Status', device.status],
    ['Krytyczność', device.criticality ?? '—'],
    ['Model', (device as any).model ?? '—'],
    ['Producent', (device as any).manufacturer ?? '—'],
    ['SN', (device as any).serialNumber ?? '—'],
    ['IP', (device as any).ipAddress ?? '—'],
    ['MAC', (device as any).macAddress ?? '—'],
    ['OS', (device as any).operatingSystem ?? '—'],
    ['Utworzono', new Date(device.createdAt).toLocaleString('pl-PL')],
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,14,0.6)', backdropFilter: 'blur(6px)', zIndex: 40, animation: 'uiDrawerFade 200ms ease' }} />
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(520px, 100vw)',
        background: 'var(--ip-bg-elev)',
        borderLeft: 'var(--ip-border-hi)',
        zIndex: 41,
        padding: '24px 28px',
        overflowY: 'auto',
        animation: 'uiDrawerSlide 260ms cubic-bezier(0.22, 0.82, 0.32, 1)',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ip-text)', letterSpacing: '-0.02em' }}>{device.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ip-text-3)', marginTop: 4 }}>{device.status}</div>
          </div>
          <button onClick={onClose} className="ui-iconbtn" aria-label="Zamknij"><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <IconContainer tone="ok"><Activity size={18} /></IconContainer>
          <IconContainer tone="brand"><Cpu size={18} /></IconContainer>
          <IconContainer tone="violet"><HardDrive size={18} /></IconContainer>
        </div>

        <div>
          {rows.map(([label, value]) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', gap: 20,
              padding: '12px 0', borderBottom: '1px solid var(--ip-border)', fontSize: 13,
            }}>
              <span style={{ fontSize: 10, color: 'var(--ip-text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
              <span style={{ color: 'var(--ip-text)', fontWeight: 500, textAlign: 'right', fontFamily: 'var(--ip-font-mono)', fontSize: 12, wordBreak: 'break-word' }}>{value}</span>
            </div>
          ))}
        </div>

        <style>{`
          @keyframes uiDrawerFade { from { opacity: 0; } to { opacity: 1; } }
          @keyframes uiDrawerSlide { from { transform: translateX(100%); } to { transform: translateX(0); } }
        `}</style>
      </aside>
    </>
  );
}
