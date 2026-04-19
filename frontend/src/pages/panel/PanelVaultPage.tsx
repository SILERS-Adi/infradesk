/**
 * PanelVaultPage — migrated to primitives.
 */

import React from 'react';
import { credentialsApi } from '../../api/credentials';
import type { Credential } from '../../types';
import toast from 'react-hot-toast';
import { Search, Eye, EyeOff, Copy, Key, User as UserIcon, Globe, Lock } from 'lucide-react';
import { Card, SectionHeader, SearchInput, EmptyState, IconContainer } from '../../ui/primitives';

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

  React.useEffect(() => {
    credentialsApi.getAll().then(d => { setCreds(d); setLoading(false); }).catch(e => { toast.error(e?.response?.data?.message || 'Błąd'); setLoading(false); });
  }, []);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return creds;
    const q = search.toLowerCase();
    return creds.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.username?.toLowerCase().includes(q) ||
      (c as any).urlOrHost?.toLowerCase().includes(q),
    );
  }, [creds, search]);

  const toggleReveal = async (c: Credential) => {
    if (revealed[c.id]) { setRevealed(s => ({ ...s, [c.id]: null })); return; }
    try {
      const { password } = await credentialsApi.reveal(c.id);
      setRevealed(s => ({ ...s, [c.id]: password }));
      setTimeout(() => setRevealed(s => ({ ...s, [c.id]: null })), 30_000);
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Nie udało się odkryć hasła'); }
  };

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`Skopiowano ${label}`); }
    catch { toast.error('Brak dostępu do schowka'); }
  };

  return (
    <>
      <SectionHeader
        title="Hasła"
        sub={`${creds.length} zapisanych haseł · zaszyfrowane AES-256`}
        action={<SearchInput placeholder="Szukaj…" icon={<Search size={14} strokeWidth={2} />} value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 280 }} />}
      />

      {loading ? (
        <Card><EmptyState icon={<Key size={28} />} title="Ładowanie…" /></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Key size={28} strokeWidth={1.8} />}
            title={search ? 'Brak wyników' : 'Brak zapisanych haseł'}
            sub={search ? 'Nic nie pasuje do filtra' : 'Hasła pojawią się tu po dodaniu przez IT'}
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {filtered.map(c => {
            const pw = revealed[c.id];
            return (
              <Card key={c.id} size="md">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: 'var(--ip-border)', marginBottom: 12 }}>
                  <IconContainer size="sm" tone="violet">{icon((c as any).category ?? 'OTHER')}</IconContainer>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--ip-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ip-text-3)', padding: '3px 8px', borderRadius: 6, background: 'var(--ip-surface-hi)', fontFamily: 'var(--ip-font-mono)' }}>
                    {CATEGORY_LABEL[(c as any).category] ?? 'Inne'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {c.username && <VaultRow label="LOGIN" value={c.username} onCopy={() => copy(c.username!, 'login')} />}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--ip-surface-tile)', borderRadius: 8, border: 'var(--ip-border)', fontFamily: 'var(--ip-font-mono)', fontSize: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ip-text-3)', minWidth: 56, fontFamily: 'inherit' }}>HASŁO</span>
                    <span style={{ flex: 1, color: 'var(--ip-text)', letterSpacing: pw ? 0 : '0.15em' }}>{pw || '••••••••••••'}</span>
                    <button onClick={() => toggleReveal(c)} title={pw ? 'Ukryj' : 'Pokaż'} className="ui-iconbtn" style={{ width: 28, height: 28 }}>
                      {pw ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    {pw && (
                      <button onClick={() => copy(pw, 'hasło')} title="Kopiuj" className="ui-iconbtn" style={{ width: 28, height: 28 }}>
                        <Copy size={12} />
                      </button>
                    )}
                  </div>

                  {(c as any).urlOrHost && <VaultRow label="HOST" value={(c as any).urlOrHost} />}
                  {(c as any).notes && (
                    <div style={{ fontSize: 12, color: 'var(--ip-text-3)', padding: '4px 2px' }}>
                      {(c as any).notes}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function VaultRow({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--ip-surface-tile)', borderRadius: 8, border: 'var(--ip-border)', fontFamily: 'var(--ip-font-mono)', fontSize: 12 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ip-text-3)', minWidth: 56, fontFamily: 'inherit' }}>{label}</span>
      <span style={{ flex: 1, color: 'var(--ip-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      {onCopy && (
        <button onClick={onCopy} className="ui-iconbtn" style={{ width: 28, height: 28 }}><Copy size={12} /></button>
      )}
    </div>
  );
}
