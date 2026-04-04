import { useState, useEffect, useRef } from 'react';
import { Monitor, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { sessionsApi, WorkSession } from '../../api/sessions';

interface Props {
  session: WorkSession;
  hostname: string;
  onEnded: () => void;
}

export function FloatingSessionTimer({ session, hostname, onEnded }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [ending, setEnding] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = new Date(session.startedAt).getTime();
    setElapsed(Math.floor((Date.now() - start) / 1000));
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [session.startedAt]);

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const handleEnd = async () => {
    setEnding(true);
    try {
      await sessionsApi.end(session.id, notes || undefined);
      toast.success('Sesja zakończona');
      onEnded();
    } catch {
      toast.error('Błąd zakończenia sesji');
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="rounded-2xl shadow-2xl overflow-hidden w-72" style={{ background: 'var(--bg-card)', color: 'var(--t)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-indigo-600">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <Monitor className="h-4 w-4" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{hostname}</p>
            {session.client && (
              <p className="text-[10px] text-indigo-200 truncate">{session.client.name}</p>
            )}
          </div>
        </div>

        {/* Timer */}
        <div className="px-4 pt-3 pb-2 text-center">
          <p className="text-3xl font-mono font-bold tracking-wider">{fmt(elapsed)}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--tm)' }}>czas połączenia</p>
        </div>

        {/* Notes section */}
        {showNotes ? (
          <div className="px-4 pb-3 space-y-2">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Co zrobiłeś w tej sesji?"
              rows={3}
              className="w-full text-xs rounded-xl px-3 py-2 resize-none focus:outline-none"
              style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowNotes(false)}
                className="flex-1 text-xs py-2 rounded-xl transition-colors"
                style={{ background: 'var(--hover-bg)', color: 'var(--ts)' }}
              >
                Anuluj
              </button>
              <button
                onClick={handleEnd}
                disabled={ending}
                className="flex-1 text-xs py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition-colors font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                {ending ? 'Zapisuję...' : 'Zakończ'}
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 pb-3">
            <button
              onClick={() => setShowNotes(true)}
              className="w-full text-sm py-2.5 rounded-xl bg-red-600 hover:bg-red-500 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <X className="h-4 w-4" />
              Zakończ sesję
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
