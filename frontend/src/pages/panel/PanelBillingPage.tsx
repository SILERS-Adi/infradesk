/**
 * PanelBillingPage — klientowe rozliczenia: WorkSessions pogrupowane po miesiącach.
 * Data: /api/sessions (workspace-scoped, OWNER/ADMIN/TECHNICIAN)
 */

import React from 'react';
import { sessionsApi, type WorkSession } from '../../api/sessions';
import { Calendar, Clock, User, Ticket, TrendingUp } from 'lucide-react';

function fmtHours(min: number | null | undefined): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtPLN(n: number): string {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 }).format(n);
}

interface MonthSummary {
  month: string;       // "2026-04"
  label: string;       // "Kwiecień 2026"
  totalMin: number;
  sessionCount: number;
  sessions: WorkSession[];
}

const PL_MONTHS = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];

export default function PanelBillingPage() {
  const [sessions, setSessions] = React.useState<WorkSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  React.useEffect(() => {
    sessionsApi.getAll()
      .then(d => { setSessions(d); setErr(null); })
      .catch(e => setErr(e?.response?.data?.message || 'Błąd'))
      .finally(() => setLoading(false));
  }, []);

  const monthly = React.useMemo<MonthSummary[]>(() => {
    const map = new Map<string, MonthSummary>();
    for (const s of sessions) {
      if (!s.endedAt) continue;
      const d = new Date(s.startedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      let m = map.get(key);
      if (!m) {
        m = { month: key, label: `${PL_MONTHS[d.getMonth()]} ${d.getFullYear()}`, totalMin: 0, sessionCount: 0, sessions: [] };
        map.set(key, m);
      }
      m.totalMin += s.durationMin ?? 0;
      m.sessionCount++;
      m.sessions.push(s);
    }
    return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [sessions]);

  const currentMonth = monthly[0];
  const allTimeMin = sessions.reduce((s, x) => s + (x.durationMin ?? 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        .bill-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding: 8px 4px; }
        .bill-title { font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -0.025em; }
        .bill-sub { color: var(--text-secondary); font-size: 14px; margin-top: 6px; }
        .bill-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
        .bill-sum-tile { padding: 24px; }
        .bill-sum-label { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 10px; }
        .bill-sum-val { font-size: 48px; font-weight: 800; letter-spacing: -0.04em; line-height: 1; background: var(--brand-gradient-vivid); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .bill-sum-meta { font-size: 12px; color: var(--text-secondary); margin-top: 10px; }
        .bill-month { padding: 24px 28px; }
        .bill-month__head { display: flex; justify-content: space-between; align-items: center; gap: 16px; cursor: pointer; }
        .bill-month__name { font-size: 18px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.015em; }
        .bill-month__meta { font-size: 12px; color: var(--text-tertiary); margin-top: 3px; }
        .bill-month__sum { font-size: 26px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
        .bill-month__lines { margin-top: 20px; border-top: 1px solid var(--glass-border); padding-top: 8px; }
        .bill-line { display: grid; grid-template-columns: 72px 1fr auto auto; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--glass-border); align-items: center; font-size: 13px; }
        .bill-line:last-child { border-bottom: 0; }
        .bill-line__date { color: var(--text-tertiary); font-family: var(--font-mono, monospace); font-size: 11px; }
        .bill-line__title { color: var(--text-primary); font-weight: 500; }
        .bill-line__meta { color: var(--text-tertiary); font-size: 11px; margin-top: 2px; display: flex; gap: 10px; flex-wrap: wrap; }
        .bill-line__hours { color: var(--text-primary); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .bill-line__ticket { padding: 3px 8px; border-radius: 6px; background: var(--glass-bg); font-family: var(--font-mono, monospace); font-size: 10px; color: var(--text-secondary); }
      `}</style>

      <header className="bill-head">
        <div>
          <h1 className="bill-title">Koszty i rozliczenia</h1>
          <div className="bill-sub">Historia pracy technicznej u Państwa</div>
        </div>
      </header>

      {err ? (
        <div className="panel-glass" style={{ padding: 20, color: '#F87171' }}>{err}</div>
      ) : loading ? (
        <div className="panel-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Ładowanie…</div>
      ) : sessions.length === 0 ? (
        <div className="panel-glass" style={{ padding: 60, textAlign: 'center' }}>
          <Calendar size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 16, fontWeight: 600 }}>Brak sesji pracy</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>Tutaj pojawi się historia pracy technika i IDO</div>
        </div>
      ) : (
        <>
          <div className="bill-summary">
            <div className="panel-glass bill-sum-tile">
              <div className="bill-sum-label">Bieżący miesiąc</div>
              <div className="bill-sum-val">{fmtHours(currentMonth?.totalMin ?? 0)}</div>
              <div className="bill-sum-meta">{currentMonth?.sessionCount ?? 0} sesji w {currentMonth?.label ?? '—'}</div>
            </div>
            <div className="panel-glass bill-sum-tile">
              <div className="bill-sum-label">Łącznie w historii</div>
              <div className="bill-sum-val" style={{ background: 'none', color: 'var(--text-primary)', WebkitTextFillColor: 'initial' }}>{fmtHours(allTimeMin)}</div>
              <div className="bill-sum-meta">{sessions.length} sesji od początku współpracy</div>
            </div>
            <div className="panel-glass bill-sum-tile">
              <div className="bill-sum-label">Miesięcy z aktywnością</div>
              <div className="bill-sum-val" style={{ background: 'none', color: 'var(--text-primary)', WebkitTextFillColor: 'initial' }}>{monthly.length}</div>
              <div className="bill-sum-meta">Śr. {fmtHours(Math.round(allTimeMin / Math.max(1, monthly.length)))}/miesiąc</div>
            </div>
          </div>

          {monthly.map(m => (
            <div key={m.month} className="panel-glass bill-month">
              <div className="bill-month__head" onClick={() => setExpanded(expanded === m.month ? null : m.month)}>
                <div>
                  <div className="bill-month__name">{m.label}</div>
                  <div className="bill-month__meta">{m.sessionCount} {m.sessionCount === 1 ? 'sesja' : m.sessionCount < 5 ? 'sesje' : 'sesji'} · kliknij aby {expanded === m.month ? 'zwinąć' : 'rozwinąć'}</div>
                </div>
                <div className="bill-month__sum">{fmtHours(m.totalMin)}</div>
              </div>
              {expanded === m.month && (
                <div className="bill-month__lines">
                  {m.sessions.map(s => (
                    <div key={s.id} className="bill-line">
                      <span className="bill-line__date">{new Date(s.startedAt).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}</span>
                      <div>
                        <div className="bill-line__title">{s.ticket?.title ?? s.notes?.slice(0, 80) ?? 'Praca techniczna'}</div>
                        <div className="bill-line__meta">
                          {s.ticket && <><Ticket size={10} style={{ display: 'inline' }} /> <span className="bill-line__ticket">#{s.ticket.ticketNumber}</span></>}
                          {s.device && <span>{s.device.name}</span>}
                        </div>
                      </div>
                      <span className="bill-line__hours">{fmtHours(s.durationMin)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
