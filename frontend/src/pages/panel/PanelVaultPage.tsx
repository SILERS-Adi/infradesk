/**
 * PanelVaultPage — workspace credentials (hasła) with reveal + copy.
 * Data: /api/credentials (workspace-scoped, TECHNICIAN+ access).
 */

import React from 'react';
import { credentialsApi } from '../../api/credentials';
import type { Credential } from '../../types';
import toast from 'react-hot-toast';
import { Lock, Eye, EyeOff, Copy, Search, Key, User as UserIcon, Globe } from 'lucide-react';

const CATEGORY_LABEL: Record<string, string> = {
  WINDOWS: 'Windows', VPN: 'VPN', EMAIL: 'E-mail', APPLICATION: 'Aplikacja',
  DATABASE: 'Baza danych', ROUTER: 'Router', WIFI: 'Wi-Fi', OTHER: 'Inne',
};

function icon(cat: string) {
  if (cat === 'EMAIL' || cat === 'WEBSITE') return <Globe size={18} />;
  if (cat === 'WIFI') return <Key size={18} />;
  if (cat === 'VPN') return <Lock size={18} />;
  return <UserIcon size={18} />;
}

export default function PanelVaultPage() {
  const [creds, setCreds] = React.useState<Credential[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [revealed, setRevealed] = React.useState<Record<string, string | null>>({});

  const load = React.useCallback(async () => {
    try { setCreds(await credentialsApi.getAll()); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'Błąd'); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return creds;
    const q = search.toLowerCase();
    return creds.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.username?.toLowerCase().includes(q) ||
      (c as any).urlOrHost?.toLowerCase().includes(q)
    );
  }, [creds, search]);

  const toggleReveal = async (c: Credential) => {
    if (revealed[c.id]) { setRevealed(s => ({ ...s, [c.id]: null })); return; }
    try {
      const { password } = await credentialsApi.reveal(c.id);
      setRevealed(s => ({ ...s, [c.id]: password }));
      setTimeout(() => setRevealed(s => ({ ...s, [c.id]: null })), 30_000); // auto-hide after 30s
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Nie udało się odkryć hasła'); }
  };

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`Skopiowano ${label}`); }
    catch { toast.error('Brak dostępu do schowka'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        .vt-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding: 8px 4px; flex-wrap: wrap; }
        .vt-title { font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -0.025em; }
        .vt-sub { color: var(--text-secondary); font-size: 14px; margin-top: 6px; }
        .vt-search { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 10px; min-width: 280px; }
        .vt-search input { background: none; border: none; outline: none; color: var(--text-primary); font-size: 14px; flex: 1; font-family: inherit; }
        .vt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
        .vt-card { padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
        .vt-card__head { display: flex; align-items: center; gap: 12px; }
        .vt-card__icon { width: 36px; height: 36px; border-radius: 10px; background: var(--brand-gradient-soft, rgba(139,92,246,0.12)); display: flex; align-items: center; justify-content: center; color: #A78BFA; flex-shrink: 0; }
        .vt-card__name { flex: 1; font-size: 14px; font-weight: 600; color: var(--text-primary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .vt-card__cat { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-tertiary); padding: 3px 8px; border-radius: 6px; background: var(--glass-bg-hi); }
        .vt-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--glass-bg); border-radius: 8px; border: 1px solid var(--glass-border); font-family: var(--font-mono, monospace); font-size: 12px; }
        .vt-row__label { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-tertiary); min-width: 56px; font-family: inherit; }
        .vt-row__value { flex: 1; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .vt-btn { padding: 6px 8px; border-radius: 6px; background: var(--glass-bg-hi); border: 1px solid var(--glass-border); cursor: pointer; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; transition: all 150ms; }
        .vt-btn:hover { background: var(--glass-bg-vivid); color: var(--text-primary); border-color: #22D3EE; }
      `}</style>

      <header className="vt-head">
        <div>
          <h1 className="vt-title">Hasła</h1>
          <div className="vt-sub">{creds.length} zapisanych haseł · zaszyfrowane AES-256</div>
        </div>
        <div className="vt-search">
          <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
          <input placeholder="Szukaj…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </header>

      {loading ? (
        <div className="panel-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Ładowanie…</div>
      ) : filtered.length === 0 ? (
        <div className="panel-glass" style={{ padding: 60, textAlign: 'center' }}>
          <Key size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 16, fontWeight: 600 }}>{search ? 'Brak wyników' : 'Brak zapisanych haseł'}</div>
        </div>
      ) : (
        <div className="vt-grid">
          {filtered.map(c => {
            const pw = revealed[c.id];
            return (
              <div key={c.id} className="panel-glass vt-card">
                <div className="vt-card__head">
                  <div className="vt-card__icon">{icon((c as any).category ?? 'OTHER')}</div>
                  <div className="vt-card__name">{c.name}</div>
                  <span className="vt-card__cat">{CATEGORY_LABEL[(c as any).category] ?? 'Inne'}</span>
                </div>
                {c.username && (
                  <div className="vt-row">
                    <span className="vt-row__label">Login</span>
                    <span className="vt-row__value">{c.username}</span>
                    <button className="vt-btn" onClick={() => copy(c.username!, 'login')}><Copy size={12} /></button>
                  </div>
                )}
                <div className="vt-row">
                  <span className="vt-row__label">Hasło</span>
                  <span className="vt-row__value" style={{ letterSpacing: pw ? 0 : '0.15em' }}>
                    {pw || '••••••••••••'}
                  </span>
                  <button className="vt-btn" onClick={() => toggleReveal(c)} title={pw ? 'Ukryj' : 'Pokaż'}>
                    {pw ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  {pw && <button className="vt-btn" onClick={() => copy(pw, 'hasło')} title="Kopiuj"><Copy size={12} /></button>}
                </div>
                {(c as any).urlOrHost && (
                  <div className="vt-row">
                    <span className="vt-row__label">Host</span>
                    <span className="vt-row__value">{(c as any).urlOrHost}</span>
                  </div>
                )}
                {(c as any).notes && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'inherit', padding: '4px 2px' }}>
                    {(c as any).notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
