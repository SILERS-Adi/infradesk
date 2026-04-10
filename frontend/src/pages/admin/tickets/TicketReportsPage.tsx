/**
 * IDS 1.0 — Ticket Reports
 */
import { useState, useEffect, useCallback } from 'react';
import { Ticket, Clock, Users, MapPin, BarChart3, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { KpiCard } from '../../../components/ui/KpiCard';
import { Badge } from '../../../components/ui/Badge';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';

type BadgeColor = 'gray' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'indigo' | 'purple';

const STATUS_MAP: Record<string, { label: string; color: BadgeColor }> = {
  PENDING: { label: 'Oczekujące', color: 'yellow' },
  ASSIGNED: { label: 'Przydzielone', color: 'blue' },
  IN_PROGRESS: { label: 'W trakcie', color: 'indigo' },
  RESOLVED: { label: 'Rozwiązane', color: 'green' },
  COMPLETED: { label: 'Zakończone', color: 'green' },
  CANCELLED: { label: 'Anulowane', color: 'gray' },
  WAITING_FOR_CLIENT: { label: 'Oczekuje na klienta', color: 'orange' },
};

const PRIORITY_MAP: Record<string, { label: string; color: BadgeColor }> = {
  LOW: { label: 'Niski', color: 'gray' },
  MEDIUM: { label: 'Średni', color: 'blue' },
  HIGH: { label: 'Wysoki', color: 'orange' },
  CRITICAL: { label: 'Krytyczny', color: 'red' },
};

const TYPE_MAP: Record<string, string> = {
  INCIDENT: 'Incydent', REQUEST: 'Prośba', MAINTENANCE: 'Konserwacja', INSTALLATION: 'Instalacja', OTHER: 'Inne',
};

interface ReportData {
  total: number; open: number; resolved: number; avgResolutionHours: number;
  byStatus: { status: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  byType: { type: string; count: number }[];
  monthlyStats: { month: string; count: number }[];
  topLocations: { name: string; count: number }[];
  perTechnician: { name: string; count: number; resolved: number }[];
}

export function TicketReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/tickets/reports/stats');
      setData(res);
    } catch { toast.error('Nie udało się pobrać raportu'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <><PageHeader title="Raporty zgłoszeń" /><LoadingSpinner /></>;
  if (!data) return <><PageHeader title="Raporty zgłoszeń" /><div style={{ padding: 24, color: 'var(--tm)' }}>Brak danych</div></>;

  const maxMonthly = Math.max(...data.monthlyStats.map(m => m.count), 1);

  const locationCols: Column<{ name: string; count: number }>[] = [
    { key: 'name', header: 'Lokalizacja', render: r => <span style={{ fontWeight: 600, color: 'var(--t)' }}>{r.name}</span> },
    { key: 'count', header: 'Zgłoszenia', render: r => <span style={{ display: 'block', textAlign: 'right', fontWeight: 600 }}>{r.count}</span> },
  ];

  const techCols: Column<{ name: string; count: number; resolved: number }>[] = [
    { key: 'name', header: 'Technik', render: r => <span style={{ fontWeight: 600, color: 'var(--t)' }}>{r.name}</span> },
    { key: 'count', header: 'Przypisane', render: r => <span style={{ display: 'block', textAlign: 'right' }}>{r.count}</span> },
    { key: 'resolved', header: 'Rozwiązane', render: r => <span style={{ display: 'block', textAlign: 'right', fontWeight: 600, color: '#4ADE80' }}>{r.resolved}</span> },
  ];

  return (
    <>
      <PageHeader title="Raporty zgłoszeń" helpKey="ticketReports" subtitle="Statystyki i analiza zgłoszeń" />
      <div style={{ padding: '0 24px 24px' }}>
        {/* KPI */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard label="Wszystkich" value={String(data.total)} icon={<Ticket size={20} color="#fff" />} color="var(--accent)" />
          <KpiCard label="Otwartych" value={String(data.open)} icon={<TrendingUp size={20} color="#fff" />} color="#FBBF24" />
          <KpiCard label="Rozwiązanych" value={String(data.resolved)} icon={<BarChart3 size={20} color="#fff" />} color="#4ADE80" />
          <KpiCard label="Śr. czas rozw." value={`${data.avgResolutionHours}h`} icon={<Clock size={20} color="#fff" />} color="#60A5FA" />
        </div>

        {/* Charts + Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 24 }}>
          <Card title="Zgłoszenia miesięcznie">
            {data.monthlyStats.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>Brak danych</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 180, padding: '0 4px' }}>
                {data.monthlyStats.map((m, i) => {
                  const h = Math.max(4, (m.count / maxMonthly) * 160);
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 0', minWidth: 0 }}>
                      <div title={`${m.month}: ${m.count} zgłoszeń`}
                        style={{ width: '100%', maxWidth: 40, height: h, borderRadius: '4px 4px 0 0', background: 'linear-gradient(180deg, var(--accent), var(--accent-s))', opacity: 0.85 }} />
                      <div style={{ fontSize: 9, color: 'var(--tm)', marginTop: 4, whiteSpace: 'nowrap' }}>{m.month.slice(5)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Card title="Statusy">
              {data.byStatus.map(s => (
                <div key={s.status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <Badge color={STATUS_MAP[s.status]?.color || 'gray'}>{STATUS_MAP[s.status]?.label || s.status}</Badge>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{s.count}</span>
                </div>
              ))}
            </Card>
            <Card title="Priorytety">
              {data.byPriority.map(p => (
                <div key={p.priority} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <Badge color={PRIORITY_MAP[p.priority]?.color || 'gray'}>{PRIORITY_MAP[p.priority]?.label || p.priority}</Badge>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{p.count}</span>
                </div>
              ))}
            </Card>
          </div>
        </div>

        {/* Tables */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <Card title="Top lokalizacje" noPadding>
            <DataTable columns={locationCols} data={data.topLocations} keyExtractor={r => r.name}
              emptyTitle="Brak danych" emptyDescription="Brak zgłoszeń z lokalizacjami." />
          </Card>
          <Card title="Per technik" noPadding>
            <DataTable columns={techCols} data={data.perTechnician} keyExtractor={r => r.name}
              emptyTitle="Brak danych" emptyDescription="Brak przypisanych zgłoszeń." />
          </Card>
        </div>

        {/* By type */}
        {data.byType.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <Card title="Typy zgłoszeń">
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {data.byType.map(t => (
                  <div key={t.type} style={{ padding: '8px 16px', borderRadius: 'var(--rs)', background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--tm)', marginBottom: 2 }}>{TYPE_MAP[t.type] || t.type}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)' }}>{t.count}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
