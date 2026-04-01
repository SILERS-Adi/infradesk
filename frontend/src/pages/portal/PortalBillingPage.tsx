import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { sessionsApi, type WorkSession } from '../../api/sessions';
import { useAuth } from '../../store/authStore';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import { Clock, Calendar, FileText, User } from 'lucide-react';
import { formatDate } from '../../utils/helpers';

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 18,
  ...extra,
});

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}

interface MonthlySummary {
  month: string; // e.g. "2026-03"
  label: string;
  totalMinutes: number;
  sessionCount: number;
}

export function PortalBillingPage() {
  const { workspace } = useWorkspaceContext();
  const workspaceId = workspace?.workspaceId;

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['portal-billing-sessions', workspaceId],
    queryFn: () => sessionsApi.getByClient(workspaceId!),
    enabled: !!workspaceId,
  });

  const monthlySummaries = useMemo(() => {
    const map = new Map<string, MonthlySummary>();
    const monthNames = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];

    for (const s of sessions) {
      const d = new Date(s.startedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(key)) {
        map.set(key, {
          month: key,
          label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
          totalMinutes: 0,
          sessionCount: 0,
        });
      }
      const entry = map.get(key)!;
      entry.totalMinutes += s.durationMin ?? 0;
      entry.sessionCount += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [sessions]);

  const totalHours = useMemo(() => {
    const totalMin = sessions.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
    return (totalMin / 60).toFixed(1);
  }, [sessions]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-7 w-7 border-2 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: 'rgba(255,255,255,0.2)' }}>BILLING</p>
        <h1 className="text-[22px] font-semibold text-white/90">Rozliczenia</h1>
        <p className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Historia sesji serwisowych i podsumowanie godzin
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-[18px] p-5" style={glass()}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,146,60,0.12)' }}>
              <Clock className="h-4.5 w-4.5" style={{ color: '#FB923C' }} />
            </div>
            <div>
              <div className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>Suma godzin</div>
              <div className="text-[20px] font-bold text-white/90">{totalHours}h</div>
            </div>
          </div>
        </div>

        <div className="rounded-[18px] p-5" style={glass()}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.12)' }}>
              <FileText className="h-4.5 w-4.5" style={{ color: '#60A5FA' }} />
            </div>
            <div>
              <div className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>Sesji łącznie</div>
              <div className="text-[20px] font-bold text-white/90">{sessions.length}</div>
            </div>
          </div>
        </div>

        <div className="rounded-[18px] p-5" style={glass()}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.12)' }}>
              <Calendar className="h-4.5 w-4.5" style={{ color: '#22C55E' }} />
            </div>
            <div>
              <div className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>Miesięcy</div>
              <div className="text-[20px] font-bold text-white/90">{monthlySummaries.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly summaries */}
      {monthlySummaries.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-[14px] font-semibold text-white/60">Podsumowanie miesięczne</h2>
          {monthlySummaries.map(ms => (
            <div key={ms.month} className="rounded-[18px] p-5" style={glass()}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-semibold text-white/90">{ms.label}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {ms.sessionCount} {ms.sessionCount === 1 ? 'sesja' : ms.sessionCount < 5 ? 'sesje' : 'sesji'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[16px] font-bold text-white/80">{formatDuration(ms.totalMinutes)}</div>
                  <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    {(ms.totalMinutes / 60).toFixed(1)}h
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Session list */}
      <div className="space-y-3">
        <h2 className="text-[14px] font-semibold text-white/60">Historia sesji</h2>

        {sessions.length === 0 ? (
          <div className="rounded-[18px] p-12 text-center" style={glass()}>
            <Clock className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
            <p className="text-[14px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Brak sesji serwisowych</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session: WorkSession) => (
              <div key={session.id} className="rounded-[16px] p-4 transition-all duration-200"
                style={{ ...glass(), boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(251,146,60,0.10)' }}>
                      <Clock className="h-4 w-4" style={{ color: '#FB923C' }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-white/80 truncate">
                        {formatDate(session.startedAt)}
                        {session.endedAt && <span style={{ color: 'rgba(255,255,255,0.25)' }}> — {formatDate(session.endedAt)}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {session.ticket && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(96,165,250,0.10)', color: '#60A5FA' }}>
                            {session.ticket.ticketNumber}
                          </span>
                        )}
                        {session.location && (
                          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.30)' }}>{session.location.name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <div className="text-[13px] font-semibold text-white/70">
                      {session.durationMin != null ? formatDuration(session.durationMin) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>
                          W trakcie
                        </span>
                      )}
                    </div>
                    {session.notes && (
                      <div className="text-[10px] mt-0.5 max-w-[120px] truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        {session.notes}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
