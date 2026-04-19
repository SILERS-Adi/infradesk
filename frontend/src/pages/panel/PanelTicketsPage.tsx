/**
 * PanelTicketsPage — tickets list + new ticket form + detail view.
 * Data: /api/tickets (workspace-scoped, MEMBER+ access).
 */

import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ticketsApi } from '../../api/tickets';
import type { Ticket, TicketStatus } from '../../types';
import toast from 'react-hot-toast';
import { Plus, MessageSquare, Clock, User, X } from 'lucide-react';

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Nowe', PENDING: 'Oczekuje', ASSIGNED: 'Przypisane', IN_PROGRESS: 'W trakcie',
  RESOLVED: 'Rozwiązane', CLOSED: 'Zamknięte', CANCELLED: 'Anulowane',
};
const STATUS_COLOR: Record<string, string> = {
  NEW: '#22D3EE', PENDING: '#FBBF24', ASSIGNED: '#A78BFA', IN_PROGRESS: '#8B5CF6',
  RESOLVED: '#34D399', CLOSED: '#6E7894', CANCELLED: '#6E7894',
};
const PRIORITY_LABEL: Record<string, string> = { LOW: 'Niski', MEDIUM: 'Średni', HIGH: 'Wysoki', URGENT: 'Pilny' };
const PRIORITY_COLOR: Record<string, string> = { LOW: '#6E7894', MEDIUM: '#22D3EE', HIGH: '#FBBF24', URGENT: '#F87171' };

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
  const [filter, setFilter] = React.useState<'open' | 'all' | 'mine'>('open');
  const [showNew, setShowNew] = React.useState(params.has('new'));

  const load = React.useCallback(async () => {
    try {
      const all = await ticketsApi.getAll({ limit: 100 });
      setTickets(all);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Błąd pobierania zgłoszeń');
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { setShowNew(params.has('new')); }, [params]);

  const filtered = React.useMemo(() => {
    if (filter === 'open') return tickets.filter(t => !['CLOSED', 'CANCELLED', 'RESOLVED'].includes(t.status));
    return tickets;
  }, [tickets, filter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        .tk-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 8px 4px; flex-wrap: wrap; }
        .tk-title { font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -0.025em; }
        .tk-sub { color: var(--text-secondary); font-size: 14px; margin-top: 6px; }
        .tk-filter { display: inline-flex; padding: 4px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 14px; gap: 2px; }
        .tk-filter__opt { padding: 8px 14px; border-radius: 10px; color: var(--text-secondary); font-size: 13px; font-weight: 500; cursor: pointer; background: none; border: none; font-family: inherit; transition: all 150ms; }
        .tk-filter__opt[aria-pressed="true"] { background: var(--glass-bg-vivid); color: var(--text-primary); border: 1px solid var(--glass-border-hi); }
        .tk-new-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 12px; font-weight: 600; font-size: 14px; background: linear-gradient(135deg, #8B5CF6, #22D3EE); color: white; cursor: pointer; border: none; box-shadow: 0 8px 24px rgba(139,92,246,.35); }
        .tk-new-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .tk-list { display: flex; flex-direction: column; gap: 10px; }
        .tk-item { padding: 18px 22px; cursor: pointer; transition: all 180ms; display: flex; align-items: center; gap: 16px; }
        .tk-item:hover { transform: translateY(-1px); border-color: var(--glass-border-hi); }
        .tk-item__number { font-family: var(--font-mono, monospace); font-size: 12px; color: var(--text-tertiary); font-weight: 600; min-width: 72px; }
        .tk-item__body { flex: 1; min-width: 0; }
        .tk-item__title { font-size: 15px; font-weight: 600; color: var(--text-primary); letter-spacing: -0.01em; }
        .tk-item__meta { display: flex; gap: 12px; margin-top: 4px; font-size: 11px; color: var(--text-tertiary); flex-wrap: wrap; }
        .tk-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 4px 10px; border-radius: 9999px; border: 1px solid; flex-shrink: 0; }
        .drawer-scrim { position: fixed; inset: 0; background: rgba(5,7,14,0.6); backdrop-filter: blur(6px); z-index: 40; animation: tdrFade 200ms ease; }
        .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(560px, 100vw); background: var(--bg-overlay); border-left: 1px solid var(--glass-border-hi); backdrop-filter: blur(24px); z-index: 41; padding: 24px 28px; overflow-y: auto; animation: tdrSlide 260ms cubic-bezier(0.22, 0.82, 0.32, 1); box-shadow: -20px 0 60px rgba(0,0,0,.4); }
        @keyframes tdrFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tdrSlide { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .drawer-head { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
        .drawer-title { font-size: 22px; font-weight: 700; letter-spacing: -0.015em; color: var(--text-primary); }
        .drawer-close { padding: 8px; border-radius: 10px; background: var(--glass-bg); border: 1px solid var(--glass-border); cursor: pointer; color: var(--text-secondary); }
        .form-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
        .form-label { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; color: var(--text-tertiary); text-transform: uppercase; }
        .form-input { padding: 12px 14px; background: var(--glass-bg); border: 1px solid var(--glass-border-hi); border-radius: 10px; color: var(--text-primary); font-size: 14px; font-family: inherit; outline: none; }
        .form-input:focus { border-color: #22D3EE; }
        .form-textarea { min-height: 120px; resize: vertical; }
      `}</style>

      <header className="tk-head">
        <div>
          <h1 className="tk-title">Moje zgłoszenia</h1>
          <div className="tk-sub">{tickets.length} wszystkich · {filtered.length} widocznych</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="tk-filter">
            <button className="tk-filter__opt" aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>Otwarte</button>
            <button className="tk-filter__opt" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Wszystkie</button>
          </div>
          <button className="tk-new-btn" onClick={() => { params.set('new', '1'); setParams(params); }}>
            <Plus size={16} /> Nowe zgłoszenie
          </button>
        </div>
      </header>

      {loading ? (
        <div className="panel-glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Ładowanie…</div>
      ) : filtered.length === 0 ? (
        <div className="panel-glass" style={{ padding: 60, textAlign: 'center' }}>
          <MessageSquare size={32} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            {filter === 'open' ? 'Brak otwartych zgłoszeń' : 'Brak zgłoszeń'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>
            Kliknij "Nowe zgłoszenie" żeby zgłosić problem
          </div>
        </div>
      ) : (
        <div className="tk-list">
          {filtered.map(t => (
            <div key={t.id} className="panel-glass tk-item" onClick={() => navigate(`/panel/tickets/${t.id}`)}>
              <span className="tk-item__number">#{(t as any).ticketNumber ?? t.id.slice(0, 8)}</span>
              <div className="tk-item__body">
                <div className="tk-item__title">{t.title}</div>
                <div className="tk-item__meta">
                  <Clock size={11} style={{ display: 'inline', marginRight: 2 }} /> {formatRel(t.createdAt)}
                  {(t as any).assignedTo && (
                    <span><User size={11} style={{ display: 'inline', marginRight: 2 }} /> {(t as any).assignedTo.firstName}</span>
                  )}
                </div>
              </div>
              <span className="tk-badge" style={{ background: (PRIORITY_COLOR[t.priority] ?? '#6E7894') + '22', color: PRIORITY_COLOR[t.priority] ?? '#6E7894', borderColor: (PRIORITY_COLOR[t.priority] ?? '#6E7894') + '55' }}>
                {PRIORITY_LABEL[t.priority] ?? t.priority}
              </span>
              <span className="tk-badge" style={{ background: (STATUS_COLOR[t.status] ?? '#6E7894') + '22', color: STATUS_COLOR[t.status] ?? '#6E7894', borderColor: (STATUS_COLOR[t.status] ?? '#6E7894') + '55' }}>
                {STATUS_LABEL[t.status] ?? t.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewTicketDrawer onClose={() => { params.delete('new'); setParams(params); }} onCreated={() => { load(); params.delete('new'); setParams(params); }} />}
    </div>
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
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-head">
          <div>
            <div className="drawer-title">Nowe zgłoszenie</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>Opisz problem — ktoś z zespołu się tym zajmie</div>
          </div>
          <button className="drawer-close" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="form-row">
          <label className="form-label">Tytuł</label>
          <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="np. Drukarka nie drukuje" maxLength={120} />
        </div>
        <div className="form-row">
          <label className="form-label">Opis problemu</label>
          <textarea className="form-input form-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Co dokładnie się dzieje? Kiedy zaczęło się dziać? Co już próbowałeś?" />
        </div>
        <div className="form-row">
          <label className="form-label">Priorytet</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: priority === p ? (PRIORITY_COLOR[p] + '22') : 'var(--glass-bg)',
                  color: priority === p ? PRIORITY_COLOR[p] : 'var(--text-secondary)',
                  border: `1px solid ${priority === p ? PRIORITY_COLOR[p] + '88' : 'var(--glass-border)'}`,
                  fontFamily: 'inherit',
                  transition: 'all 150ms',
                }}>
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={submit}
          disabled={saving || !title.trim() || !description.trim()}
          style={{
            width: '100%', padding: 14, borderRadius: 12, fontWeight: 600, fontSize: 14,
            background: 'linear-gradient(135deg, #8B5CF6, #22D3EE)', color: 'white', border: 'none',
            cursor: saving ? 'wait' : 'pointer', marginTop: 8,
            boxShadow: '0 8px 24px rgba(139,92,246,.35)', opacity: saving ? 0.6 : 1,
            fontFamily: 'inherit',
          }}>
          {saving ? 'Wysyłam…' : 'Wyślij zgłoszenie'}
        </button>
      </aside>
    </>
  );
}
