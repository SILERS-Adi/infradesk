/**
 * IDS 1.0 — PakOps Customer Management
 * Connected to: GET/PATCH /api/packaging/customers/*
 */
import { useState } from 'react';
import {
  Users, Eye, Search, Edit3, Save, X, ChevronLeft,
  ShoppingCart, Mail, Phone, Building2,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Pagination } from '../../../components/ui/Pagination';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { fmtMoney, fmtDate } from './utils';
import type { PackingCustomer } from './types';

export function PackingCustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');

  // List
  const { data: result, isLoading } = useQuery({
    queryKey: ['packaging', 'customers', page, search],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page), per_page: '30' };
      if (search) params.search = search;
      const { data } = await api.get('/packaging/customers', { params });
      return data as { items: PackingCustomer[]; total: number };
    },
  });

  // Detail
  const { data: customer, isLoading: loadingDetail } = useQuery<PackingCustomer & { orders?: any[] }>({
    queryKey: ['packaging', 'customers', selectedId],
    queryFn: async () => { const { data } = await api.get(`/packaging/customers/${selectedId}`); return data; },
    enabled: !!selectedId,
  });

  // Save notes
  const notesMut = useMutation({
    mutationFn: async (notes: string) => {
      await api.patch(`/packaging/customers/${selectedId}/notes`, { notes });
    },
    onSuccess: () => {
      toast.success('Notatki zapisane');
      setEditingNotes(false);
      queryClient.invalidateQueries({ queryKey: ['packaging', 'customers', selectedId] });
    },
    onError: () => toast.error('Nie udało się zapisać notatek'),
  });

  const items = result?.items || [];
  const total = result?.total || 0;

  // Detail view
  if (selectedId) {
    return (
      <div className="pakops">
        <PageHeader title="Klient" back="/packaging/customers"
          actions={<Button variant="ghost" size="sm" icon={<ChevronLeft size={14} />} onClick={() => setSelectedId(null)}>Lista</Button>} />
        <div style={{ padding: '0 24px 24px', maxWidth: 900 }}>
          {loadingDetail ? <LoadingSpinner /> : customer ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Info */}
              <Card noPadding>
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, background: 'var(--accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Users size={22} color="#fff" />
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)' }}>{customer.name}</div>
                      {customer.company && <div style={{ fontSize: 12, color: 'var(--tm)' }}>{customer.company}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {customer.email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ts)' }}>
                        <Mail size={14} style={{ color: 'var(--tm)' }} /> {customer.email}
                      </div>
                    )}
                    {customer.phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ts)' }}>
                        <Phone size={14} style={{ color: 'var(--tm)' }} /> {customer.phone}
                      </div>
                    )}
                    {customer.company && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ts)' }}>
                        <Building2 size={14} style={{ color: 'var(--tm)' }} /> {customer.company}
                      </div>
                    )}
                  </div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span style={{ fontSize: 12, color: 'var(--tm)' }}>Zamówień</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{customer.orderCount}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span style={{ fontSize: 12, color: 'var(--tm)' }}>Łączna wartość</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{fmtMoney(customer.totalSpent)} zł</span>
                  </div>
                  {customer.lastOrderAt && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                      <span style={{ fontSize: 12, color: 'var(--tm)' }}>Ostatnie zamówienie</span>
                      <span style={{ fontSize: 13, color: 'var(--t)' }}>{fmtDate(customer.lastOrderAt)}</span>
                    </div>
                  )}
                </div>
              </Card>

              {/* Notes */}
              <Card title="Notatki" action={
                !editingNotes ? (
                  <Button variant="ghost" size="sm" icon={<Edit3 size={12} />}
                    onClick={() => { setNotesText(customer.notes || ''); setEditingNotes(true); }}>Edytuj</Button>
                ) : null
              }>
                {editingNotes ? (
                  <div>
                    <textarea value={notesText} onChange={e => setNotesText(e.target.value)}
                      style={{
                        width: '100%', minHeight: 120, padding: 10, borderRadius: 8,
                        border: '1px solid var(--border)', background: 'var(--hover-bg)',
                        color: 'var(--t)', fontSize: 13, resize: 'vertical', outline: 'none',
                      }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <Button size="sm" variant="primary" icon={<Save size={12} />}
                        loading={notesMut.isPending} onClick={() => notesMut.mutate(notesText)}>Zapisz</Button>
                      <Button size="sm" variant="secondary" icon={<X size={12} />}
                        onClick={() => setEditingNotes(false)}>Anuluj</Button>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--ts)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {customer.notes || 'Brak notatek'}
                  </p>
                )}
              </Card>

              {/* Order history */}
              {customer.orders && customer.orders.length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <Card title="Historia zamówień" noPadding>
                    {customer.orders.map((o: any) => (
                      <div key={o.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 20px', borderBottom: '1px solid var(--border)',
                      }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', fontFamily: 'monospace' }}>
                            {o.externalOrderId || o.id.slice(0, 8)}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--tm)', marginLeft: 12 }}>{fmtDate(o.createdAt)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{fmtMoney(o.totalAmount)} zł</span>
                          <Badge color={
                            o.status === 'DELIVERED' ? 'green' :
                            o.status === 'SHIPPED' ? 'blue' :
                            o.status === 'CANCELLED' ? 'red' : 'gray'
                          }>{o.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </Card>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--tm)' }}>Klient nie znaleziony</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pakops">
      <PageHeader title="Klienci" subtitle="Lista klientów pakowania" />
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }}
            placeholder="Szukaj klienta (nazwa, email, firma)..." />
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tm)' }}>{total} klientów</span>
        </div>

        {isLoading ? <LoadingSpinner /> : items.length === 0 ? (
          <Card>
            <EmptyState icon={<Users style={{ width: 28, height: 28, color: 'var(--td)' }} />}
              title="Brak klientów" description="Klienci pojawią się po złożeniu zamówień." />
          </Card>
        ) : (
          <div className="page-card" style={{ padding: 0, overflow: 'hidden' }}>
            {items.map(c => (
              <div key={c.id}
                onClick={() => setSelectedId(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  transition: 'background .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, background: 'var(--hover-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Users size={16} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>
                      {[c.email, c.company].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{c.orderCount} zam.</div>
                    <div style={{ fontSize: 11, color: 'var(--accent)' }}>{fmtMoney(c.totalSpent)} zł</div>
                  </div>
                  <Eye size={16} style={{ color: 'var(--tm)' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <Pagination page={page} total={total} perPage={30} onPageChange={setPage} />
      </div>
    </div>
  );
}

export default PackingCustomersPage;
