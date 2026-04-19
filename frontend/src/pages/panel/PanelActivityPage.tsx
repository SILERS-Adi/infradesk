/**
 * PanelActivityPage — pełna historia aktywności workspace klienta.
 * Data: /api/panel/activity?limit=100 (workspace-scoped, MEMBER+ access)
 */

import React from 'react';
import { panelApi, type PanelActivityItem } from '../../api/panel';
import { Activity, Filter, User } from 'lucide-react';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Dziś';
  if (d.toDateString() === yesterday.toDateString()) return 'Wczoraj';
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

const TYPE_LABEL: Record<string, string> = {
  Ticket: 'Zgłoszenie', Device: 'Urządzenie', Credential: 'Hasło',
  WorkSession: 'Sesja pracy', Order: 'Zamówienie', AgentRegistration: 'Rejestracja agenta',
  MonitoringAlert: 'Alert', Invoice: 'Faktura', User: 'Użytkownik',
};

const ACTION_LABEL: Record<string, string> = {
  CREATE: 'Utworzono', UPDATE: 'Zmieniono', DELETE: 'Usunięto',
  RESOLVE: 'Rozwiązano', APPROVE: 'Zatwierdzono', REJECT: 'Odrzucono',
  START: 'Rozpoczęto', END: 'Zakończono', PAUSE: 'Wstrzymano', RESUME: 'Wznowiono',
  REVEAL: 'Odkryto', DECRYPT: 'Odszyfrowano',
};

export default function PanelActivityPage() {
  const [items, setItems] = React.useState<PanelActivityItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<string>('all');

  const load = React.useCallback(async () => {
    try {
      const { items } = await panelApi.getActivity(200);
      setItems(items);
      setErr(null);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Błąd');
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const types = React.useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.type) s.add(it.type);
    return Array.from(s).sort();
  }, [items]);

  const filtered = React.useMemo(
    () => (filter === 'all' ? items : items.filter(i => i.type === filter)),
    [items, filter],
  );

  /* Group by date */
  const grouped = React.useMemo(() => {
    const g: Record<string, PanelActivityItem[]> = {};
    for (const it of filtered) {
      const day = new Date(it.at).toDateString();
      if (!g[day]) g[day] = [];
      g[day].push(it);
    }
    return Object.entries(g); /* already sorted because API returns desc */
  }, [filtered]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        .act-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding: 8px 4px; flex-wrap: wrap; }
        .act-title { font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -0.025em; }
        .act-sub { color: var(--text-secondary); font-size: 14px; margin-top: 6px; }
        .act-filter { display: inline-flex; padding: 4px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 12px; gap: 2px; flex-wrap: wrap; }
        .act-filter__opt { padding: 7px 12px; border-radius: 9px; color: var(--text-secondary); font-size: 12px; font-weight: 500; cursor: pointer; background: none; border: none; font-family: inherit; transition: all 150ms; }
        .act-filter__opt[aria-pressed="true"] { background: var(--glass-bg-vivid); color: var(--text-primary); border: 1px solid var(--glass-border-hi); }
        .act-day { padding: 20px 24px; }
        .act-day__label { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 14px; }
        .act-item { display: grid; grid-template-columns: 52px 1fr auto; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--glass-border); }
        .act-item:last-child { border-bottom: 0; padding-bottom: 0; }
        .act-time { font-family: var(--font-mono, monospace); font-size: 11px; color: var(--text-tertiary); margin-top: 2px; }
        .act-title2 { font-size: 14px; font-weight: 500; color: var(--text-primary); line-height: 1.5; }
        .act-meta { font-size: 11px; color: var(--text-tertiary); margin-top: 3px; display: flex; gap: 10px; flex-wrap: wrap; }
        .act-type-pill { padding: 3px 8px; border-radius: 6px; background: var(--glass-bg); color: var(--text-secondary); font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
      `}</style>

      <header className="act-head">
        <div>
          <h1 className="act-title">Aktywność</h1>
          <div className="act-sub">Co się dzieje u Państwa — ostatnie {items.length} zdarzeń</div>
        </div>
        <div className="act-filter">
          <button className="act-filter__opt" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Wszystko</button>
          {types.map(t => (
            <button key={t} className="act-filter__opt" aria-pressed={filter === t} onClick={() => setFilter(t)}>
              {TYPE_LABEL[t] ?? t}
            </button>
          ))}
        </div>
      </header>

      {err ? (
        <div className="panel-glass" style={{ padding: 20, color: '#F87171' }}>{err}</div>
      ) : loading ? (
        <div className="panel-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Ładowanie…</div>
      ) : filtered.length === 0 ? (
        <div className="panel-glass ip-empty-heartbeat">
          <div className="ip-empty-heartbeat__icon">
            <Activity size={28} strokeWidth={1.8} />
          </div>
          <div className="ip-empty-heartbeat__title">System stabilny — brak zdarzeń</div>
          <div className="ip-empty-heartbeat__sub">AI monitoruje workspace 24/7</div>
        </div>
      ) : (
        grouped.map(([day, dayItems]) => (
          <div key={day} className="panel-glass act-day">
            <div className="act-day__label">{formatDate(day)}</div>
            {dayItems.map(it => (
              <div key={it.id} className="act-item">
                <span className="act-time">{formatTime(it.at)}</span>
                <div>
                  <div className="act-title2">{it.description}</div>
                  <div className="act-meta">
                    {it.by && <span><User size={10} style={{ display: 'inline', marginRight: 2 }} /> {it.by}</span>}
                    {it.action && <span>{ACTION_LABEL[it.action] ?? it.action}</span>}
                  </div>
                </div>
                {it.type && <span className="act-type-pill">{TYPE_LABEL[it.type] ?? it.type}</span>}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
