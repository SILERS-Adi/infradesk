import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Receipt, Clock, User, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { formatDatePl } from '@/lib/utils';

interface BillingData {
  month: string;
  technicians: Array<{
    technicianId: string;
    technicianName: string;
    totalMinutes: number;
    billableMinutes: number;
    sessionsCount: number;
    estimatedAmountPln: number;
  }>;
  sessions: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    billableMinutes: number | null;
    durationMinutes: number | null;
    notes: string | null;
    hourlyRateNet: string | null;
    technician: { firstName: string; lastName: string };
    ticketLinks: Array<{ ticket: { id: string; ticketNumber: string; title: string } }>;
  }>;
  totalSessions: number;
  totalMinutes: number;
  totalBillableMinutes: number;
  totalEstimatedPln: number;
}

export function BillingPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const { data, isLoading } = useQuery<BillingData>({
    queryKey: ['billing', month],
    queryFn: async () => (await api.get('/billing/time', { params: { month } })).data,
  });

  const prev = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y!, m! - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const next = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y!, m!, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const monthDisplay = month && (() => {
    const [y, m] = month.split('-').map(Number);
    const names = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
    return `${names[m! - 1]} ${y}`;
  })();

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Rozliczenia</h1>
          <p className="text-[13px] text-tx2 mt-0.5">Czas pracy techników × stawka godzinowa</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-[14px] font-semibold text-tx px-3 py-1 bg-sf-h rounded-[var(--r-s)]">{monthDisplay}</span>
          <Button size="sm" variant="outline" onClick={next}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-10 text-center text-tx3">Ładowanie…</Card>
      ) : !data || data.totalSessions === 0 ? (
        <Card className="p-10 text-center">
          <Receipt className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Brak rozliczonych sesji</p>
          <p className="text-[13px] text-tx3">{monthDisplay} — nic do rozliczenia w tym miesiącu.</p>
        </Card>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stg">
            <StatCard icon={Clock} label="Godzin pracy" value={(data.totalBillableMinutes / 60).toFixed(1)} accent="primary" />
            <StatCard icon={Receipt} label="Sesji" value={data.totalSessions} accent="neutral" />
            <StatCard icon={User} label="Techników" value={data.technicians.length} accent="warning" />
            <StatCard icon={TrendingUp} label="Do zafakturowania" value={`${data.totalEstimatedPln.toFixed(0)} PLN`} accent="success" />
          </div>

          {/* Per-technician breakdown */}
          <Card>
            <div className="px-5 py-4 border-b border-bd">
              <h3 className="text-[14px] font-semibold text-tx">Według technika</h3>
            </div>
            <div className="p-5 space-y-3">
              {data.technicians.map((t) => {
                const hours = t.billableMinutes / 60;
                return (
                  <div key={t.technicianId} className="flex items-center justify-between p-3 rounded-[var(--r-s)] bg-sf-h">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ background: 'linear-gradient(135deg, var(--pri), #7c3aed)' }}
                      >
                        {t.technicianName.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-tx">{t.technicianName}</p>
                        <p className="text-[11px] text-tx3">{t.sessionsCount} sesji · {hours.toFixed(1)}h billable</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[16px] font-bold text-tx tabular-nums">{t.estimatedAmountPln.toFixed(2)} PLN</p>
                      <p className="text-[10px] text-tx3">szacowane</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Sessions list */}
          <Card>
            <div className="px-5 py-4 border-b border-bd">
              <h3 className="text-[14px] font-semibold text-tx">Szczegółowo — {data.sessions.length} sesji</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-sf-h border-b border-bd">
                  <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-tx3">
                    <th className="px-4 py-2.5 font-bold">Technik</th>
                    <th className="px-4 py-2.5 font-bold">Zgłoszenia</th>
                    <th className="px-4 py-2.5 font-bold">Start</th>
                    <th className="px-4 py-2.5 font-bold">Czas (billable)</th>
                    <th className="px-4 py-2.5 font-bold">Stawka</th>
                    <th className="px-4 py-2.5 font-bold text-right">Kwota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bd">
                  {data.sessions.map((s) => {
                    const rate = s.hourlyRateNet ? Number(s.hourlyRateNet) : null;
                    const amount = rate && s.billableMinutes ? (s.billableMinutes / 60) * rate : 0;
                    return (
                      <tr key={s.id} className="hover:bg-sf-h">
                        <td className="px-4 py-2 text-tx">{s.technician.firstName} {s.technician.lastName}</td>
                        <td className="px-4 py-2 text-tx3">
                          {s.ticketLinks.map((l) => l.ticket.ticketNumber).join(', ') || '—'}
                        </td>
                        <td className="px-4 py-2 text-tx3 text-[11px]">{formatDatePl(s.startedAt)}</td>
                        <td className="px-4 py-2 text-tx tabular-nums">{s.billableMinutes ?? 0} min</td>
                        <td className="px-4 py-2 text-tx3 tabular-nums">{rate ? `${rate.toFixed(0)} /h` : '—'}</td>
                        <td className="px-4 py-2 text-right text-tx font-semibold tabular-nums">{amount.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="pt-4 flex items-center justify-end gap-2 border-t border-bd">
            <p className="text-[11px] text-tx3">Eksport do FINANSE (V1) wkrótce — Sprint 6</p>
          </div>
        </>
      )}
    </div>
  );
}
