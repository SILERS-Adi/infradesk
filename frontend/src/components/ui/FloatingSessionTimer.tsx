import { useState, useEffect, useRef } from 'react';
import { Monitor, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { sessionsApi, WorkSession } from '../../api/sessions';
import { EndSessionModal } from './EndSessionModal';

interface Props {
  session: WorkSession;
  hostname: string;
  onEnded: () => void;
}

export function FloatingSessionTimer({ session, hostname, onEnded }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [showModal, setShowModal] = useState(false);
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

  const fmt = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleEnd = async (notes: string, closedTicketIds: string[]) => {
    setEnding(true);
    try {
      await sessionsApi.end(session.id, notes || undefined, closedTicketIds);
      const n = closedTicketIds.length;
      toast.success(n > 1 ? `Sesja zakończona — zamknięto ${n} zgłoszeń` : 'Sesja zakończona');
      setShowModal(false);
      onEnded();
    } catch {
      toast.error('Błąd zakończenia sesji');
    } finally {
      setEnding(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <div className="rounded-2xl shadow-2xl overflow-hidden w-72" style={{ background: 'var(--bg-card)', color: 'var(--t)', border: '1px solid var(--border)' }}>
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

          <div className="px-4 pt-3 pb-2 text-center">
            <p className="text-3xl font-mono font-bold tracking-wider">{fmt(elapsed)}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--tm)' }}>czas połączenia</p>
          </div>

          <div className="px-4 pb-3">
            <button
              onClick={() => setShowModal(true)}
              className="w-full text-sm py-2.5 rounded-xl bg-red-600 hover:bg-red-500 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <X className="h-4 w-4" />
              Zakończ sesję
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <EndSessionModal
          session={session}
          hostname={hostname}
          elapsedSec={elapsed}
          ending={ending}
          onClose={() => setShowModal(false)}
          onConfirm={handleEnd}
        />
      )}
    </>
  );
}
