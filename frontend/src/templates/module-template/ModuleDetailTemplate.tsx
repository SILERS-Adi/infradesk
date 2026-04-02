/**
 * IDS 1.0 — Module Detail Template
 *
 * USE WHEN: Detail/view page for a single record (e.g. /invoicing/documents/:id)
 * PATTERN:  PageHeader (back + actions) → Status badges → Info grid → Items table → Action bar
 *
 * Key decisions:
 * - Always has back button (back prop on PageHeader)
 * - Action buttons in PageHeader (top) AND in action bar (bottom)
 * - Two-column grid for key-value info sections
 * - Full-width card for related items/table
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Edit3, Trash2, Download, Copy, MoreHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

// ── Replace with your record type ──
interface DetailRecord {
  id: string;
  title: string;
  status: 'active' | 'pending' | 'closed';
  createdAt: string;
  description: string;
  metadata: { label: string; value: string }[];
  items: { id: string; name: string; quantity: number; total: number }[];
}

// ── InfoRow: reusable key-value display ──
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--tm)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// ── SectionLabel: uppercase section divider inside Card ──
function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, marginTop: 4 }}>
      <Icon size={14} style={{ color: 'var(--accent)' }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
    </div>
  );
}

export function ModuleDetailTemplate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState('');

  // ── Replace with useQuery ──
  const loading = false;
  const record: DetailRecord = {
    id: id || '1',
    title: 'Element #1',
    status: 'active',
    createdAt: '2026-04-01',
    description: 'Opis elementu dla wzorca modułu.',
    metadata: [
      { label: 'Identyfikator', value: 'EL-2026-001' },
      { label: 'Kategoria', value: 'Usługi IT' },
      { label: 'Utworzono', value: '2026-04-01 12:00' },
      { label: 'Ostatnia zmiana', value: '2026-04-02 09:30' },
    ],
    items: [
      { id: '1', name: 'Pozycja A', quantity: 5, total: 2500 },
      { id: '2', name: 'Pozycja B', quantity: 2, total: 800 },
    ],
  };

  if (loading) return <LoadingSpinner />;

  // ── Actions ──
  async function handleDelete() {
    if (!confirm('Czy na pewno chcesz usunąć?')) return;
    setActionLoading('delete');
    try {
      // await api.delete(`/module/items/${id}`);
      toast.success('Usunięto');
      navigate('..');
    } catch {
      toast.error('Nie udało się usunąć');
    } finally {
      setActionLoading('');
    }
  }

  return (
    <>
      {/* ── PAGE HEADER ──
          Standard: back button + title + subtitle (optional) + action buttons
          back can be a string (explicit path) or true (navigate(-1)) */}
      <PageHeader
        title={record.title}
        subtitle={`ID: ${record.id}`}
        back=".."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="secondary" icon={<Edit3 size={14} />}>Edytuj</Button>
            <Button size="sm" variant="secondary" icon={<Download size={14} />}>Eksport</Button>
          </div>
        }
      />

      <div style={{ padding: '0 24px 24px', maxWidth: 1100 }}>

        {/* ── STATUS BADGES ──
            Placed directly below PageHeader, before content cards.
            Use Badge component with matching status colors. */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <Badge color="green">Aktywny</Badge>
          <Badge color="indigo">Kategoria A</Badge>
        </div>

        {/* ── TWO-COLUMN INFO GRID ──
            Standard: 1fr 1fr with gap 20.
            Each column is a Card with InfoRow components inside.
            Use SectionLabel for grouping within a card. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <Card title="Informacje">
            {record.metadata.map(m => (
              <InfoRow key={m.label} label={m.label} value={m.value} />
            ))}
          </Card>

          <Card title="Opis">
            <p style={{ fontSize: 13, color: 'var(--ts)', lineHeight: 1.6, margin: 0 }}>
              {record.description}
            </p>
          </Card>
        </div>

        {/* ── ITEMS TABLE ──
            Full-width Card with noPadding for flush table edges.
            Uses same TH/TD styling as DataTable. */}
        <Card title="Powiązane pozycje" noPadding>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Nazwa', 'Ilość', 'Wartość'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--td)',
                      textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--hover-bg)',
                      textAlign: h === 'Nazwa' ? 'left' : 'right',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {record.items.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{item.name}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ts)', textAlign: 'right' }}>{item.quantity}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t)', textAlign: 'right' }}>
                      {item.total.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── ACTION BAR ──
            Standard: Card at the bottom with horizontal button row.
            Destructive actions (delete) on the far right with variant="danger". */}
        <div style={{ marginTop: 20 }}>
          <Card noPadding>
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button size="sm" icon={<Download size={14} />}>Eksport</Button>
              <Button size="sm" variant="secondary" icon={<Copy size={14} />}>Duplikuj</Button>
              <div style={{ marginLeft: 'auto' }}>
                <Button size="sm" variant="danger" icon={<Trash2 size={14} />}
                  loading={actionLoading === 'delete'} onClick={handleDelete}>
                  Usuń
                </Button>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </>
  );
}

export { InfoRow, SectionLabel };
