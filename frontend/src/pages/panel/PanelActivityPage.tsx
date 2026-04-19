/**
 * PanelActivityPage — migrated to primitives.
 */

import React from 'react';
import { panelApi, type PanelActivityItem } from '../../api/panel';
import { Activity, User, Bot } from 'lucide-react';
import { Card, SectionHeader, EmptyState, IconContainer } from '../../ui/primitives';

const TYPE_LABEL: Record<string, string> = {
  Ticket: 'Zgłoszenie', Device: 'Urządzenie', Credential: 'Hasło',
  WorkSession: 'Sesja pracy', Order: 'Zamówienie', AgentRegistration: 'Rejestracja agenta',
  MonitoringAlert: 'Alert', Invoice: 'Faktura', User: 'Użytkownik',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Dziś';
  if (d.toDateString() === yesterday.toDateString()) return 'Wczoraj';
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' });
}
function formatTime(iso: string): string { return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }); }

export default function PanelActivityPage() {
  const [items, setItems] = React.useState<PanelActivityItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<string>('all');

  React.useEffect(() => {
    panelApi.getActivity(200).then(r => { setItems(r.items); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const types = React.useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.type) s.add(it.type);
    return Array.from(s).sort();
  }, [items]);

  const filtered = React.useMemo(
    () => (filter === 'all' ? items : items.filter(i => i.type === filter)),
    [items, filter],
  );

  const grouped = React.useMemo(() => {
    const g: Record<string, PanelActivityItem[]> = {};
    for (const it of filtered) {
      const day = new Date(it.at).toDateString();
      if (!g[day]) g[day] = [];
      g[day].push(it);
    }
    return Object.entries(g);
  }, [filtered]);

  return (
    <>
      <SectionHeader
        title="Aktywność"
        sub={`Co się dzieje u Państwa — ostatnie ${items.length} zdarzeń`}
        action={(
          <div style={{ display: 'inline-flex', padding: 4, background: 'var(--ip-surface-solid)', border: 'var(--ip-border)', borderRadius: 12, gap: 2, flexWrap: 'wrap' }}>
            <FilterOpt active={filter === 'all'} onClick={() => setFilter('all')}>Wszystko</FilterOpt>
            {types.slice(0, 5).map(t => (
              <FilterOpt key={t} active={filter === t} onClick={() => setFilter(t)}>{TYPE_LABEL[t] ?? t}</FilterOpt>
            ))}
          </div>
        )}
      />

      {loading ? (
        <Card><EmptyState icon={<Activity size={28} />} title="Ładowanie…" /></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Activity size={28} strokeWidth={1.8} />}
            title="System stabilny"
            sub="Brak nowych zdarzeń w tym zakresie"
          />
        </Card>
      ) : (
        grouped.map(([day, dayItems]) => (
          <Card key={day} size="md">
            <div style={{ fontFamily: 'var(--ip-font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ip-text-3)', marginBottom: 14 }}>
              {formatDate(day)}
            </div>
            {dayItems.map(it => (
              <div key={it.id} style={{
                display: 'grid', gridTemplateColumns: '40px 60px 1fr auto', gap: 12,
                padding: '12px 0', borderBottom: '1px solid var(--ip-border)', alignItems: 'center',
              }}>
                <IconContainer size="sm"><Bot size={14} /></IconContainer>
                <span style={{ fontFamily: 'var(--ip-font-mono)', fontSize: 11, color: 'var(--ip-text-3)' }}>{formatTime(it.at)}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ip-text)', lineHeight: 1.45 }}>{it.description}</div>
                  {it.by && (
                    <div style={{ fontSize: 11, color: 'var(--ip-text-3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={10} strokeWidth={2} /> {it.by}
                    </div>
                  )}
                </div>
                {it.type && (
                  <span style={{
                    padding: '3px 8px', borderRadius: 6,
                    background: 'var(--ip-surface-hi)', color: 'var(--ip-text-3)',
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                    fontFamily: 'var(--ip-font-mono)',
                  }}>
                    {TYPE_LABEL[it.type] ?? it.type}
                  </span>
                )}
              </div>
            ))}
          </Card>
        ))
      )}
    </>
  );
}

function FilterOpt({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '7px 12px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
        fontSize: 12, fontWeight: 500, cursor: 'pointer',
        background: active ? 'var(--ip-blue-soft)' : 'transparent',
        color: active ? 'var(--ip-blue-hi)' : 'var(--ip-text-2)',
      }}>
      {children}
    </button>
  );
}
