/**
 * PanelBillingPage — migrated to primitives.
 */

import React from 'react';
import { sessionsApi, type WorkSession } from '../../api/sessions';
import { Calendar, Clock, Ticket } from 'lucide-react';
import { Card, SectionHeader, StatCard, EmptyState, IconContainer } from '../../ui/primitives';

function fmtHours(min: number | null | undefined): string {
  if (!min) return '—';
  const h = Math.floor(min / 60); const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface MonthSummary { month: string; label: string; totalMin: number; sessionCount: number; sessions: WorkSession[] }
const PL_MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

export default function PanelBillingPage() {
  const [sessions, setSessions] = React.useState<WorkSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  React.useEffect(() => {
    sessionsApi.getAll().then(d => { setSessions(d); setLoading(false); }).catch(() => setLoading(false));
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

  const current = monthly[0];
  const allTime = sessions.reduce((s, x) => s + (x.durationMin ?? 0), 0);

  return (
    <>
      <SectionHeader title="Koszty i rozliczenia" sub="Historia pracy technicznej u Państwa" />

      {loading ? (
        <Card><EmptyState icon={<Calendar size={28} />} title="Ładowanie…" /></Card>
      ) : sessions.length === 0 ? (
        <Card>
          <EmptyState icon={<Calendar size={28} strokeWidth={1.8} />} title="Brak sesji pracy" sub="Historia pojawi się po pierwszej interwencji" />
        </Card>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <StatCard label="Bieżący miesiąc" value={fmtHours(current?.totalMin ?? 0)} sub={`${current?.sessionCount ?? 0} sesji w ${current?.label ?? '—'}`} />
            <StatCard label="Łącznie w historii" value={fmtHours(allTime)} sub={`${sessions.length} sesji`} />
            <StatCard label="Miesięcy" value={monthly.length} sub={`Śr. ${fmtHours(Math.round(allTime / Math.max(1, monthly.length)))}/miesiąc`} />
          </div>

          {monthly.map(m => (
            <Card key={m.month} size="md">
              <div onClick={() => setExpanded(expanded === m.month ? null : m.month)}
                   style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ip-text)', letterSpacing: '-0.015em' }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--ip-text-3)', marginTop: 3 }}>
                    {m.sessionCount} {m.sessionCount === 1 ? 'sesja' : m.sessionCount < 5 ? 'sesje' : 'sesji'} · kliknij aby {expanded === m.month ? 'zwinąć' : 'rozwinąć'}
                  </div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--ip-text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtHours(m.totalMin)}
                </div>
              </div>

              {expanded === m.month && (
                <div style={{ marginTop: 20, borderTop: 'var(--ip-border)', paddingTop: 8 }}>
                  {m.sessions.map(s => (
                    <div key={s.id} style={{
                      display: 'grid', gridTemplateColumns: '40px 72px 1fr auto', gap: 12,
                      padding: '12px 0', borderBottom: '1px solid var(--ip-border)', alignItems: 'center',
                    }}>
                      <IconContainer size="sm"><Clock size={14} /></IconContainer>
                      <span style={{ fontFamily: 'var(--ip-font-mono)', fontSize: 11, color: 'var(--ip-text-3)' }}>
                        {new Date(s.startedAt).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}
                      </span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ip-text)' }}>
                          {s.ticket?.title ?? s.notes?.slice(0, 80) ?? 'Praca techniczna'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ip-text-3)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap', fontFamily: 'var(--ip-font-mono)' }}>
                          {s.ticket && <span><Ticket size={10} style={{ display: 'inline', marginRight: 2 }} />#{s.ticket.ticketNumber}</span>}
                          {s.device && <span>{s.device.name}</span>}
                        </div>
                      </div>
                      <span style={{ color: 'var(--ip-text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--ip-font-mono)' }}>
                        {fmtHours(s.durationMin)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </>
      )}
    </>
  );
}
