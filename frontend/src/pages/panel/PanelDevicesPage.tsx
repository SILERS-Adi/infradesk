/**
 * PanelDevicesPage — workspace devices grid with detail drawer.
 * Data: /api/devices (workspace-scoped by backend, MEMBER+ access)
 */

import React from 'react';
import { devicesApi } from '../../api/devices';
import type { Device } from '../../types';
import { Monitor, HardDrive, Cpu, Activity, Search, X } from 'lucide-react';

function statusColor(status: string): string {
  if (status === 'ACTIVE')   return '#34D399';
  if (status === 'IN_SERVICE') return '#FBBF24';
  if (status === 'BROKEN')   return '#F87171';
  return '#6E7894';
}

function statusLabel(status: string): string {
  if (status === 'ACTIVE')     return 'Aktywne';
  if (status === 'INACTIVE')   return 'Nieaktywne';
  if (status === 'IN_SERVICE') return 'W serwisie';
  if (status === 'BROKEN')     return 'Uszkodzone';
  if (status === 'RETIRED')    return 'Wycofane';
  return status;
}

export default function PanelDevicesPage() {
  const [devices, setDevices] = React.useState<Device[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<Device | null>(null);

  const load = React.useCallback(async () => {
    try {
      const all = await devicesApi.getAll();
      setDevices(all);
      setErr(null);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Błąd pobierania urządzeń');
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return devices;
    const q = search.toLowerCase();
    return devices.filter(d =>
      d.name?.toLowerCase().includes(q) ||
      (d as any).serialNumber?.toLowerCase().includes(q) ||
      (d as any).model?.toLowerCase().includes(q)
    );
  }, [devices, search]);

  const byStatus = React.useMemo(() => {
    const g: Record<string, number> = {};
    for (const d of devices) g[d.status] = (g[d.status] || 0) + 1;
    return g;
  }, [devices]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        .dev-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding: 8px 4px; flex-wrap: wrap; }
        .dev-title { font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -0.025em; }
        .dev-sub { color: var(--text-secondary); font-size: 14px; margin-top: 6px; }
        .dev-search { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 10px; min-width: 280px; }
        .dev-search input { background: none; border: none; outline: none; color: var(--text-primary); font-size: 14px; flex: 1; font-family: inherit; }
        .dev-search input::placeholder { color: var(--text-tertiary); }
        .dev-summary { display: flex; gap: 10px; flex-wrap: wrap; }
        .dev-sum { padding: 8px 14px; border-radius: 9999px; background: var(--glass-bg); border: 1px solid var(--glass-border); font-size: 12px; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 6px; }
        .dev-sum__dot { width: 7px; height: 7px; border-radius: 50%; }
        .dev-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
        .dev-card { padding: 20px; display: flex; flex-direction: column; gap: 10px; cursor: pointer; transition: all 180ms cubic-bezier(0.22, 0.82, 0.32, 1); }
        .dev-card:hover { transform: translateY(-2px); border-color: var(--glass-border-hi); }
        .dev-card__head { display: flex; align-items: center; gap: 10px; }
        .dev-card__icon { width: 36px; height: 36px; border-radius: 10px; background: var(--glass-bg-hi); border: 1px solid var(--glass-border); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); flex-shrink: 0; }
        .dev-card__name { font-size: 14px; font-weight: 600; color: var(--text-primary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dev-card__status { flex-shrink: 0; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 4px 10px; border-radius: 9999px; }
        .dev-card__meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; color: var(--text-tertiary); }
        .dev-card__meta strong { color: var(--text-secondary); font-weight: 500; }
        .drawer-scrim { position: fixed; inset: 0; background: rgba(5, 7, 14, 0.6); backdrop-filter: blur(6px); z-index: 40; animation: drawerFadeIn 200ms ease; }
        .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(520px, 100vw); background: var(--bg-overlay); border-left: 1px solid var(--glass-border-hi); backdrop-filter: blur(24px); z-index: 41; padding: 24px 28px; overflow-y: auto; animation: drawerSlideIn 260ms cubic-bezier(0.22, 0.82, 0.32, 1); box-shadow: -20px 0 60px rgba(0, 0, 0, 0.4); }
        @keyframes drawerFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes drawerSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .drawer__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
        .drawer__title { font-size: 22px; font-weight: 700; letter-spacing: -0.015em; color: var(--text-primary); }
        .drawer__sub { font-size: 13px; color: var(--text-tertiary); margin-top: 4px; }
        .drawer__close { padding: 8px; border-radius: 10px; background: var(--glass-bg); border: 1px solid var(--glass-border); cursor: pointer; color: var(--text-secondary); }
        .drawer__close:hover { background: var(--glass-bg-hi); color: var(--text-primary); }
        .drawer__row { display: flex; justify-content: space-between; gap: 20px; padding: 12px 0; border-bottom: 1px solid var(--glass-border); font-size: 13px; }
        .drawer__row:last-child { border-bottom: 0; }
        .drawer__label { color: var(--text-tertiary); letter-spacing: 0.08em; text-transform: uppercase; font-size: 10px; font-weight: 700; }
        .drawer__value { color: var(--text-primary); font-weight: 500; text-align: right; word-break: break-word; font-family: var(--font-mono, monospace); font-size: 12px; }
      `}</style>

      <header className="dev-head">
        <div>
          <h1 className="dev-title">Moje urządzenia</h1>
          <div className="dev-sub">{devices.length} urządzeń w Twoim workspace</div>
        </div>
        <div className="dev-search">
          <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
          <input placeholder="Szukaj po nazwie, SN, modelu…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </header>

      <div className="dev-summary">
        {Object.entries(byStatus).map(([st, count]) => (
          <span key={st} className="dev-sum">
            <span className="dev-sum__dot" style={{ background: statusColor(st) }} />
            {statusLabel(st)} · <strong style={{ color: 'var(--text-primary)' }}>{count}</strong>
          </span>
        ))}
      </div>

      {err ? (
        <div className="panel-glass" style={{ padding: 20, color: '#F87171' }}>Błąd: {err}</div>
      ) : loading ? (
        <div className="panel-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Ładowanie urządzeń…</div>
      ) : filtered.length === 0 ? (
        <div className="panel-glass" style={{ padding: 60, textAlign: 'center' }}>
          <Monitor size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{search ? 'Brak wyników' : 'Brak urządzeń'}</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>
            {search ? 'Nic nie pasuje do filtra' : 'Urządzenia pojawią się automatycznie po zainstalowaniu agenta Windows'}
          </div>
        </div>
      ) : (
        <div className="dev-grid">
          {filtered.map(d => (
            <div key={d.id} className="panel-glass dev-card" onClick={() => setSelected(d)}>
              <div className="dev-card__head">
                <div className="dev-card__icon"><Monitor size={18} /></div>
                <div className="dev-card__name">{d.name}</div>
                <span className="dev-card__status" style={{ background: statusColor(d.status) + '22', color: statusColor(d.status), border: `1px solid ${statusColor(d.status)}55` }}>
                  {statusLabel(d.status)}
                </span>
              </div>
              <div className="dev-card__meta">
                {(d as any).model && <div><strong>Model</strong><br/>{(d as any).model}</div>}
                {(d as any).serialNumber && <div><strong>SN</strong><br/>{(d as any).serialNumber}</div>}
                {(d as any).ipAddress && <div><strong>IP</strong><br/>{(d as any).ipAddress}</div>}
                {d.criticality && <div><strong>Krytyczność</strong><br/>{d.criticality}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <>
          <div className="drawer-scrim" onClick={() => setSelected(null)} />
          <aside className="drawer">
            <header className="drawer__head">
              <div>
                <div className="drawer__title">{selected.name}</div>
                <div className="drawer__sub">{statusLabel(selected.status)}</div>
              </div>
              <button className="drawer__close" onClick={() => setSelected(null)}><X size={18} /></button>
            </header>
            <div>
              {[
                ['ID', selected.id],
                ['Nazwa', selected.name],
                ['Status', statusLabel(selected.status)],
                ['Krytyczność', selected.criticality ?? '—'],
                ['Model', (selected as any).model ?? '—'],
                ['Producent', (selected as any).manufacturer ?? '—'],
                ['SN', (selected as any).serialNumber ?? '—'],
                ['IP', (selected as any).ipAddress ?? '—'],
                ['MAC', (selected as any).macAddress ?? '—'],
                ['OS', (selected as any).operatingSystem ?? '—'],
                ['Utworzono', new Date(selected.createdAt).toLocaleString('pl-PL')],
              ].map(([label, value]) => (
                <div key={String(label)} className="drawer__row">
                  <span className="drawer__label">{label}</span>
                  <span className="drawer__value">{String(value)}</span>
                </div>
              ))}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
