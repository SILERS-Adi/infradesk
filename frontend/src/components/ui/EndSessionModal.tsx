import { useEffect, useState } from 'react';
import { Check, X, Monitor, Ticket as TicketIcon } from 'lucide-react';
import { ticketsApi } from '../../api/tickets';
import { WorkSession } from '../../api/sessions';
import type { Ticket } from '../../types';

interface Props {
  session: WorkSession;
  hostname: string;
  elapsedSec: number;
  ending: boolean;
  onClose: () => void;
  onConfirm: (notes: string, closedTicketIds: string[]) => void;
}

const OPEN_STATUSES = ['NEW', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CLIENT'];

function fmtElapsed(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
    : `${m}m ${String(s).padStart(2, '0')}s`;
}

export function EndSessionModal({ session, hostname, elapsedSec, ending, onClose, onConfirm }: Props) {
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const deviceId = session.deviceId ?? session.device?.id;
    if (!deviceId) { setTickets([]); setLoading(false); return; }
    ticketsApi.getAll({ deviceId, limit: 100 } as any)
      .then((list: Ticket[]) => {
        const open = list.filter(t => OPEN_STATUSES.includes(t.status));
        setTickets(open);
        // Pre-check the session's own ticket if present
        if (session.ticketId && open.some(t => t.id === session.ticketId)) {
          setSelected({ [session.ticketId]: true });
        }
      })
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [session.deviceId, session.device?.id, session.ticketId]);

  const toggle = (id: string) => setSelected(s => ({ ...s, [id]: !s[id] }));
  const selectedIds = Object.keys(selected).filter(k => selected[k]);

  const isRemote = (session as any).serviceMode === 'REMOTE' || (session as any).rustdeskSessionId;
  const mode = isRemote ? 'Zdalny' : 'Lokalny';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--bg-card)', color: 'var(--t)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-indigo-600 text-white">
          <Monitor className="h-5 w-5" />
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold truncate">Kończenie sesji: {hostname}</p>
            <p className="text-xs text-indigo-100">Czas pracy: {fmtElapsed(elapsedSec)} · Tryb: {mode}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10" aria-label="Zamknij"><X className="h-5 w-5" /></button>
        </div>

        {/* Other open tickets for this device */}
        <div className="px-5 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
          {loading ? (
            <p className="text-sm" style={{ color: 'var(--tm)' }}>Ładowanie otwartych zgłoszeń…</p>
          ) : tickets.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--tm)' }}>Brak innych otwartych zgłoszeń na tym komputerze.</p>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--tm)' }}>
                Otwarte zgłoszenia na tym komputerze — zaznacz co zrobione przy okazji:
              </p>
              <div className="space-y-2">
                {tickets.map(t => (
                  <label key={t.id} className="flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:bg-[var(--hover-bg)]" style={{ border: '1px solid var(--border)' }}>
                    <input
                      type="checkbox"
                      checked={!!selected[t.id]}
                      onChange={() => toggle(t.id)}
                      className="mt-0.5 h-4 w-4 accent-indigo-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--tm)' }}>
                        <TicketIcon className="h-3 w-3" />
                        <span className="font-mono">{t.ticketNumber}</span>
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase" style={{ background: 'var(--hover-bg)' }}>{t.status}</span>
                        {t.id === session.ticketId && <span className="text-indigo-500 font-semibold">· bieżący</span>}
                      </div>
                      <p className="text-sm font-medium mt-0.5 line-clamp-2">{t.title}</p>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}

          {/* Notes */}
          <div className="pt-2">
            <label className="block text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--tm)' }}>
              Uwagi do sesji (widoczne w zgłoszeniach)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Krótki opis co zrobiono…"
              rows={3}
              className="w-full text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 flex gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onClose}
            disabled={ending}
            className="flex-1 text-sm py-2.5 rounded-xl transition-colors"
            style={{ background: 'var(--hover-bg)', color: 'var(--ts)' }}
          >
            Anuluj
          </button>
          <button
            onClick={() => onConfirm(notes, selectedIds)}
            disabled={ending}
            className="flex-1 text-sm py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition-colors font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {ending ? 'Zapisuję…' : selectedIds.length > 0 ? `Zakończ i zamknij ${selectedIds.length}` : 'Zakończ sesję'}
          </button>
        </div>
      </div>
    </div>
  );
}
