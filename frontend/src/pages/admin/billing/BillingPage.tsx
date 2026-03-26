import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Receipt, Building2, Clock, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { sessionsApi, WorkSession } from '../../../api/sessions';
import { clientsApi } from '../../../api/clients';
import { ticketsApi } from '../../../api/tickets';
import { PageHeader } from '../../../components/ui/PageHeader';
import type { Client } from '../../../types';

function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatMoney(val: number): string {
  return val.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
}

interface ClientBilling {
  client: Client;
  sessions: WorkSession[];
  totalMinutes: number;
  billableHours: number;
  contractHours: number;
  overHours: number;
  hourlyRate: number;
  overRate: number;
  hasContract: boolean;
  contractValue: number;
  totalValue: number;
  ticketCount: number;
}

export function BillingPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const from = new Date(year, month, 1).toISOString();
  const to = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['sessions-billing', from, to],
    queryFn: () => sessionsApi.getAll({ from, to }),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.getAll(),
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets-billing', from, to],
    queryFn: () => ticketsApi.getAll(),
  });

  const billingData = useMemo((): ClientBilling[] => {
    const clientMap = new Map<string, Client>();
    for (const c of clients) clientMap.set(c.id, c);

    const sessionsByClient = new Map<string, WorkSession[]>();
    for (const s of sessions) {
      if (!s.clientId) continue;
      const arr = sessionsByClient.get(s.clientId) ?? [];
      arr.push(s);
      sessionsByClient.set(s.clientId, arr);
    }

    const ticketsByClient = new Map<string, number>();
    for (const t of tickets) {
      if (!t.clientId) continue;
      const d = new Date(t.reportedAt ?? t.createdAt);
      if (d >= new Date(from) && d <= new Date(to)) {
        ticketsByClient.set(t.clientId, (ticketsByClient.get(t.clientId) ?? 0) + 1);
      }
    }

    // Zbierz wszystkich klientów z sesjami w danym miesiącu
    const result: ClientBilling[] = [];
    for (const [clientId, clientSessions] of sessionsByClient) {
      const client = clientMap.get(clientId);
      if (!client) continue;

      const totalMinutes = clientSessions.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
      const billableHours = Math.ceil(totalMinutes / (client.billingIntervalMinutes ?? 30)) * ((client.billingIntervalMinutes ?? 30) / 60);
      const contractHours = client.contractHours ?? 0;
      const hasContract = client.hasContract ?? false;
      const hourlyRate = client.hourlyRate ?? 0;
      const overRate = client.contractHourlyRateOverLimit ?? hourlyRate;
      const contractValue = client.contractMonthlyValue ?? 0;

      let overHours = 0;
      let totalValue = 0;

      if (hasContract) {
        overHours = Math.max(0, billableHours - contractHours);
        totalValue = contractValue + (overHours * overRate);
      } else {
        totalValue = billableHours * hourlyRate;
      }

      result.push({
        client, sessions: clientSessions,
        totalMinutes, billableHours, contractHours, overHours,
        hourlyRate, overRate, hasContract, contractValue, totalValue,
        ticketCount: ticketsByClient.get(clientId) ?? 0,
      });
    }

    return result.sort((a, b) => b.totalValue - a.totalValue);
  }, [sessions, clients, tickets, from, to]);

  const totalRevenue = billingData.reduce((s, b) => s + b.totalValue, 0);
  const totalHours = billingData.reduce((s, b) => s + b.billableHours, 0);

  const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

  return (
    <div>
      <PageHeader
        title="Rozliczenia"
        subtitle={`${MONTHS[month]} ${year} · ${formatMoney(totalRevenue)} · ${totalHours.toFixed(1)}h`}
      />

      {/* Wybór miesiąca */}
      <div className="flex items-center gap-3 mb-5">
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="text-sm rounded-xl px-3 py-2 focus:outline-none"
          style={{ background: '#0E1425', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }}>
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="text-sm rounded-xl px-3 py-2 focus:outline-none"
          style={{ background: '#0E1425', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Karty podsumowania */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Receipt className="h-4 w-4" style={{ color: '#4ADE80' }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Przychód</span>
          </div>
          <p className="text-2xl font-bold text-white/90">{formatMoney(totalRevenue)}</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4" style={{ color: '#60A5FA' }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Godziny</span>
          </div>
          <p className="text-2xl font-bold text-white/90">{totalHours.toFixed(1)}h</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-4 w-4" style={{ color: '#A78BFA' }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Klienci</span>
          </div>
          <p className="text-2xl font-bold text-white/90">{billingData.length}</p>
        </div>
      </div>

      {/* Tabela klientów */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {sessionsLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-6 w-6 border-2 border-violet-500 border-t-transparent rounded-full" />
          </div>
        ) : billingData.length === 0 ? (
          <div className="text-center py-16">
            <Receipt className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Brak sesji w wybranym miesiącu</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Klient</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Umowa</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Czas pracy</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Godziny</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Nadgodziny</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Zgłoszenia</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Kwota</th>
              </tr>
            </thead>
            <tbody>
              {billingData.map(b => (
                <tr key={b.client.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                  className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link to={`/clients/${b.client.id}`} className="text-[13px] font-medium text-violet-400 hover:underline">
                      {b.client.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {b.hasContract ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5"
                        style={{ background: 'rgba(34,197,94,0.12)', color: '#4ADE80' }}>
                        <CheckCircle2 className="h-3 w-3" />{b.contractHours}h
                      </span>
                    ) : (
                      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Brak</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      {formatDuration(b.totalMinutes)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>
                      {b.billableHours.toFixed(1)}h
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {b.overHours > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: '#F87171' }}>
                        <AlertTriangle className="h-3 w-3" />+{b.overHours.toFixed(1)}h
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{b.ticketCount}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-[13px] font-bold" style={{ color: '#4ADE80' }}>
                      {formatMoney(b.totalValue)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                <td className="px-4 py-3 text-[12px] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>RAZEM</td>
                <td />
                <td className="px-4 py-3 text-right text-[12px] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {formatDuration(billingData.reduce((s, b) => s + b.totalMinutes, 0))}
                </td>
                <td className="px-4 py-3 text-right text-[12px] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {totalHours.toFixed(1)}h
                </td>
                <td className="px-4 py-3 text-right text-[12px] font-bold" style={{ color: '#F87171' }}>
                  {billingData.reduce((s, b) => s + b.overHours, 0).toFixed(1)}h
                </td>
                <td className="px-4 py-3 text-center text-[12px] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {billingData.reduce((s, b) => s + b.ticketCount, 0)}
                </td>
                <td className="px-4 py-3 text-right text-[13px] font-bold" style={{ color: '#4ADE80' }}>
                  {formatMoney(totalRevenue)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
