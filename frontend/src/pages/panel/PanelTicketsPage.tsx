/**
 * PanelTicketsPage — migrated to primitives.
 * Lista zgłoszeń jako ListRow, nowe zgłoszenie drawer z Button + formularz.
 */

import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ticketsApi } from '../../api/tickets';
import type { Ticket } from '../../types';
import toast from 'react-hot-toast';
import { Plus, MessageSquare, Clock, User, X } from 'lucide-react';
import { Card, SectionHeader, Badge, Button, EmptyState, ListRow } from '../../ui/primitives';

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Nowe', PENDING: 'Oczekuje', ASSIGNED: 'Przypisane', IN_PROGRESS: 'W trakcie',
  RESOLVED: 'Rozwiązane', CLOSED: 'Zamknięte', CANCELLED: 'Anulowane',
};
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'blue' | 'gray'> = {
  NEW: 'blue', PENDING: 'warn', ASSIGNED: 'blue', IN_PROGRESS: 'blue',
  RESOLVED: 'ok', CLOSED: 'gray', CANCELLED: 'gray',
};
const PRIORITY_LABEL: Record<string, string> = { LOW: 'Niski', MEDIUM: 'Średni', HIGH: 'Wysoki', URGENT: 'Pilny' };
const PRIORITY_TONE: Record<string, 'gray' | 'blue' | 'warn' | 'bad'> = { LOW: 'gray', MEDIUM: 'blue', HIGH: 'warn', URGENT: 'bad' };

function formatRel(iso: string): string {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return 'przed chwilą';
  if (d < 3600) return `${Math.round(d / 60)} min temu`;
  if (d < 86400) return `${Math.round(d / 3600)} h temu`;
  if (d < 7 * 86400) return `${Math.round(d / 86400)} dni temu`;
  return new Date(iso).toLocaleDateString('pl-PL');
}

export default function PanelTicketsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<'open' | 'all'>('open');
  const [showNew, setShowNew] = React.useState(params.has('new'));

  const load = React.useCallback(() => {
    ticketsApi.getAll({ limit: 100 }).then(setTickets).catch(e => toast.error(e?.response?.data?.message || 'Błąd')).finally(() => setLoading(false));
  }, []);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { setShowNew(params.has('new')); }, [params]);

  const filtered = React.useMemo(() => {
    if (filter === 'open') return tickets.filter(t => !['CLOSED', 'CANCELLED', 'RESOLVED'].includes(t.status));
    return tickets;
  }, [tickets, filter]);

  return (
    <>
      <SectionHeader
        title="Moje zgłoszenia"
        sub={`${tickets.length} wszystkich · ${filtered.length} widocznych`}
        action={(
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', padding: 4, background: 'var(--ip-surface-solid)', border: 'var(--ip-border)', borderRadius: 14, gap: 2 }}>
              <button onClick={() => setFilter('open')}
                style={{ padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', background: filter === 'open' ? 'var(--ip-blue-soft)' : 'transparent', color: filter === 'open' ? 'var(--ip-blue-hi)' : 'var(--ip-text-2)', fontFamily: 'inherit' }}>
                Otwarte
              </button>
              <button onClick={() => setFilter('all')}
                style={{ padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', background: filter === 'all' ? 'var(--ip-blue-soft)' : 'transparent', color: filter === 'all' ? 'var(--ip-blue-hi)' : 'var(--ip-text-2)', fontFamily: 'inherit' }}>
                Wszystkie
              </button>
            </div>
            <Button variant="primary" onClick={() => { params.set('new', '1'); setParams(params); }}>
              <Plus size={15} strokeWidth={2.2} /> Nowe zgłoszenie
            </Button>
          </div>
        )}
      />

      {loading ? (
        <Card><EmptyState icon={<MessageSquare size={28} />} title="Ładowanie…" /></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessageSquare size={28} strokeWidth={1.8} />}
            title={filter === 'open' ? 'Brak otwartych zgłoszeń' : 'Brak zgłoszeń'}
            sub={"Kliknij Nowe zgłoszenie — żeby zgłosić problem"}
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(t => (
            <ListRow key={t.id} onClick={() => navigate(`/panel/tickets/${t.id}`)}>
              <span style={{ fontFamily: 'var(--ip-font-mono)', fontSize: 12, color: 'var(--ip-blue-hi)', fontWeight: 700, minWidth: 72 }}>
                #{(t as any).ticketNumber ?? t.id.slice(0, 8)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ip-text)', letterSpacing: '-0.005em' }}>{t.title}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: 'var(--ip-text-3)', fontFamily: 'var(--ip-font-mono)' }}>
                  <span><Clock size={11} style={{ display: 'inline', marginRight: 2 }} /> {formatRel(t.createdAt)}</span>
                  {(t as any).assignedTo && (
                    <span><User size={11} style={{ display: 'inline', marginRight: 2 }} /> {(t as any).assignedTo.firstName}</span>
                  )}
                </div>
              </div>
              <Badge tone={PRIORITY_TONE[t.priority] ?? 'gray'}>{PRIORITY_LABEL[t.priority] ?? t.priority}</Badge>
              <Badge tone={STATUS_TONE[t.status] ?? 'gray'}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
            </ListRow>
          ))}
        </div>
      )}

      {showNew && <NewTicketDrawer onClose={() => { params.delete('new'); setParams(params); }} onCreated={() => { load(); params.delete('new'); setParams(params); }} />}
    </>
  );
}

function NewTicketDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [priority, setPriority] = React.useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    if (!title.trim() || !description.trim()) { toast.error('Tytuł i opis są wymagane'); return; }
    setSaving(true);
    try {
      await ticketsApi.create({ title, description, priority } as any);
      toast.success('Zgłoszenie utworzone');
      onCreated();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Błąd');
    } finally { setSaving(false); }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,14,0.6)', backdropFilter: 'blur(6px)', zIndex: 40 }} />
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(560px, 100vw)',
        background: 'var(--ip-bg-elev)', borderLeft: 'var(--ip-border-hi)', zIndex: 41,
        padding: '24px 28px', overflowY: 'auto', boxShadow: '-20px 0 60px rgba(0,0,0,0.4)',
        animation: 'uiDrawerSlide 260ms cubic-bezier(0.22, 0.82, 0.32, 1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ip-text)', letterSpacing: '-0.015em' }}>Nowe zgłoszenie</div>
            <div style={{ fontSize: 13, color: 'var(--ip-text-3)', marginTop: 4 }}>Opisz problem — ktoś z zespołu się tym zajmie</div>
          </div>
          <button className="ui-iconbtn" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ip-text-3)', fontFamily: 'var(--ip-font-mono)', marginBottom: 6 }}>TYTUŁ</div>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="np. Drukarka nie drukuje"
              maxLength={120}
              style={{ width: '100%', padding: '12px 14px', background: 'var(--ip-surface-solid)', border: 'var(--ip-border-hi)', borderRadius: 10, color: 'var(--ip-text)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
            />
          </label>
          <label>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ip-text-3)', fontFamily: 'var(--ip-font-mono)', marginBottom: 6 }}>OPIS PROBLEMU</div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Co dokładnie się dzieje? Kiedy zaczęło się dziać? Co już próbowałeś?"
              style={{ width: '100%', minHeight: 120, padding: '12px 14px', background: 'var(--ip-surface-solid)', border: 'var(--ip-border-hi)', borderRadius: 10, color: 'var(--ip-text)', fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
            />
          </label>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ip-text-3)', fontFamily: 'var(--ip-font-mono)', marginBottom: 6 }}>PRIORYTET</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map(p => (
                <button key={p} onClick={() => setPriority(p)}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                    background: priority === p ? `var(--ip-${PRIORITY_TONE[p] === 'gray' ? 'gray' : PRIORITY_TONE[p]}-soft)` : 'var(--ip-surface-solid)',
                    color: priority === p ? `var(--ip-${PRIORITY_TONE[p] === 'blue' ? 'blue-hi' : PRIORITY_TONE[p]})` : 'var(--ip-text-2)',
                    border: `1px solid ${priority === p ? `var(--ip-${PRIORITY_TONE[p] === 'gray' ? 'border' : PRIORITY_TONE[p] + '-edge'})` : 'var(--ip-border)'}`,
                  }}>
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          <Button variant="primary" size="lg" onClick={submit} disabled={saving || !title.trim() || !description.trim()}>
            {saving ? 'Wysyłam…' : 'Wyślij zgłoszenie'}
          </Button>
        </div>
      </aside>
    </>
  );
}
