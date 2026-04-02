/**
 * IDS 1.0 — Packaging Board (Advanced Operational View)
 * Kanban-style board for packaging operations.
 * NOT a DataTable — uses Card-based columns.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Truck, RefreshCw, Eye, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { STATUS_MAP, COURIER_MAP } from './constants';
import { fmtWeight } from './utils';
import type { ShipmentRow, BadgeColor } from './types';

interface BoardColumn {
  key: string;
  label: string;
  color: string;
  nextAction?: { label: string; nextStatus: string };
}

const COLUMNS: BoardColumn[] = [
  { key: 'pending', label: 'Do spakowania', color: '#FBBF24', nextAction: { label: 'Rozpocznij', nextStatus: 'PACKING' } },
  { key: 'packing', label: 'W trakcie', color: '#60A5FA', nextAction: { label: 'Spakowane', nextStatus: 'PACKED' } },
  { key: 'packed', label: 'Spakowane', color: '#818CF8', nextAction: { label: 'Wysłane', nextStatus: 'SHIPPED' } },
  { key: 'shipped', label: 'Wysłane', color: '#4ADE80' },
];

export function PackagingBoardPage() {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/packaging/shipments', { params: { per_page: '200' } });
      setShipments(data.items || []);
    } catch {
      toast.error('Nie udało się pobrać przesyłek');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.put(`/packaging/shipments/${id}`, { status: newStatus });
      toast.success('Status zmieniony');
      load();
    } catch {
      toast.error('Nie udało się zmienić statusu');
    }
  };

  if (loading) return <><PageHeader title="Board pakowania" /><LoadingSpinner /></>;

  return (
    <>
      <PageHeader
        title="Board pakowania"
        subtitle="Widok operacyjny przesyłek"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={load}>Odśwież</Button>
            <Link to="/packaging/shipments/new" style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="sm" icon={<Package size={14} />}>Nowa przesyłka</Button>
            </Link>
          </div>
        }
      />

      <div style={{ padding: '0 24px 24px', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(280px, 1fr))`, gap: 16, minWidth: COLUMNS.length * 296 }}>
          {COLUMNS.map(col => {
            const items = shipments.filter(s => s.status === col.key);
            return (
              <div key={col.key} style={{ display: 'flex', flexDirection: 'column', minHeight: 400 }}>
                {/* Column header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: '12px 12px 0 0',
                  background: 'var(--hover-bg)', borderBottom: `2px solid ${col.color}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>{col.label}</span>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                    background: `${col.color}20`, color: col.color,
                  }}>
                    {items.length}
                  </span>
                </div>

                {/* Cards */}
                <div style={{
                  flex: 1, padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8,
                  overflowY: 'auto', maxHeight: 'calc(100vh - 250px)',
                }}>
                  {items.length === 0 && (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--td)', fontSize: 12 }}>
                      Brak przesyłek
                    </div>
                  )}
                  {items.map(s => (
                    <div key={s.id} style={{
                      padding: '14px 16px', borderRadius: 'var(--rs)',
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      transition: 'var(--trf)', cursor: 'pointer',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = col.color; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                      onClick={() => navigate(`/packaging/shipments/${s.id}`)}
                    >
                      {/* Order number + courier */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', fontFamily: 'monospace' }}>
                          {s.orderNumber}
                        </span>
                        <Badge color={(COURIER_MAP[s.courier]?.color || 'gray') as BadgeColor}>
                          {COURIER_MAP[s.courier]?.label || s.courier}
                        </Badge>
                      </div>

                      {/* Client */}
                      <div style={{ fontSize: 12, color: 'var(--ts)', marginBottom: 6 }}>
                        {s.clientName}
                      </div>

                      {/* Meta */}
                      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--tm)', marginBottom: 10 }}>
                        <span>{s.itemCount} poz.</span>
                        <span>{fmtWeight(s.totalWeight)}</span>
                        <span>{s.createdAt}</span>
                      </div>

                      {/* Quick actions */}
                      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                        {col.nextAction && (
                          <button
                            onClick={() => handleStatusChange(s.id, col.nextAction!.nextStatus)}
                            style={{
                              flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none',
                              background: `${col.color}18`, color: col.color,
                              fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'var(--trf)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = `${col.color}30`; }}
                            onMouseLeave={e => { e.currentTarget.style.background = `${col.color}18`; }}
                          >
                            <ChevronRight size={12} /> {col.nextAction.label}
                          </button>
                        )}
                        <Link to={`/packaging/shipments/${s.id}`}
                          style={{
                            padding: '6px 10px', borderRadius: 8,
                            border: '1px solid var(--border)', background: 'transparent',
                            color: 'var(--tm)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                            textDecoration: 'none', transition: 'var(--trf)',
                          }}
                          onClick={e => e.stopPropagation()}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--tm)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                        >
                          <Eye size={12} /> Szczegóły
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
