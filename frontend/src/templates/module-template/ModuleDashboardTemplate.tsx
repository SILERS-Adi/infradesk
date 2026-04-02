/**
 * IDS 1.0 — Module Dashboard Template
 *
 * USE WHEN: Landing page of any module (e.g. /invoicing, /service, /packaging)
 * PATTERN:  PageHeader → KPI strip → Main grid (chart + sidebar) → Bottom tables
 *
 * To use: copy this file, replace "Template" with your module name,
 * replace placeholder data with real useQuery hooks.
 */

import { Link } from 'react-router-dom';
import { TrendingUp, ArrowUpRight, AlertTriangle, BarChart3, Plus } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { KpiCard } from '../../components/ui/KpiCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

// ── Replace with your module's data types ──
interface DashboardData {
  kpiGross: number;
  kpiNet: number;
  kpiAlerts: number;
  kpiCount: number;
  recentItems: { id: string; label: string; status: string; value: string }[];
  statusBreakdown: { label: string; count: number; color: 'gray' | 'blue' | 'green' | 'yellow' | 'red' }[];
}

// ── Replace with useQuery hook ──
const MOCK_DATA: DashboardData = {
  kpiGross: 123456.78,
  kpiNet: 100000.00,
  kpiAlerts: 3,
  kpiCount: 47,
  recentItems: [
    { id: '1', label: 'FV/2026/04/001', status: 'Opłacona', value: '12 300,00 zł' },
    { id: '2', label: 'FV/2026/04/002', status: 'Wystawiona', value: '5 600,00 zł' },
    { id: '3', label: 'PF/2026/04/001', status: 'Szkic', value: '890,00 zł' },
  ],
  statusBreakdown: [
    { label: 'Opłacone', count: 28, color: 'green' },
    { label: 'Wystawione', count: 12, color: 'blue' },
    { label: 'Zaległe', count: 4, color: 'red' },
    { label: 'Szkice', count: 3, color: 'gray' },
  ],
};

export function ModuleDashboardTemplate() {
  // Replace with: const { data, isLoading } = useQuery(...)
  const data = MOCK_DATA;

  return (
    <>
      {/* ── PAGE HEADER ──
          Standard: title + optional subtitle + primary CTA on right
          No back button on dashboard pages */}
      <PageHeader
        title="Module Dashboard"
        subtitle="Przegląd modułu"
        actions={
          <Link to="./items/new" style={{ textDecoration: 'none' }}>
            <Button variant="primary" icon={<Plus size={14} />}>Nowy element</Button>
          </Link>
        }
      />

      <div style={{ padding: '0 24px 24px' }}>

        {/* ── KPI STRIP ──
            Standard: 4 cards, flex-wrap, min-width 200px per card, gap 16px
            Each card: label (uppercase, --td) + value (24px, --t) + icon (40x40 colored circle) */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard label="Wartość brutto"  value="123 456,78 zł" icon={<TrendingUp size={20} color="#fff" />}   color="var(--accent)" />
          <KpiCard label="Wartość netto"   value="100 000,00 zł" icon={<ArrowUpRight size={20} color="#fff" />} color="#4ADE80" />
          <KpiCard label="Wymagają uwagi"  value="3"             icon={<AlertTriangle size={20} color="#fff" />} color="#F87171" />
          <KpiCard label="Elementów"       value="47"            icon={<BarChart3 size={20} color="#fff" />}     color="#60A5FA" />
        </div>

        {/* ── MAIN GRID ──
            Standard: 2-column grid, left wider (chart/main content), right narrower (sidebar stats)
            On mobile: stacks vertically */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 24 }}>

          {/* Left: Recent items or chart */}
          <Card title="Ostatnie elementy" noPadding>
            {data.recentItems.length === 0 ? (
              <EmptyState title="Brak danych" description="Dodaj pierwszy element." />
            ) : (
              <div>
                {data.recentItems.map(item => (
                  <Link key={item.id} to={`./items/${item.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 20px', borderBottom: '1px solid var(--border)',
                      textDecoration: 'none', transition: 'background .15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>{item.status}</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ts)' }}>{item.value}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Right: Status breakdown */}
          <Card title="Statusy">
            {data.statusBreakdown.map(s => (
              <div key={s.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0', borderBottom: '1px solid var(--border)',
              }}>
                <Badge color={s.color}>{s.label}</Badge>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{s.count}</span>
              </div>
            ))}
          </Card>
        </div>

      </div>
    </>
  );
}
