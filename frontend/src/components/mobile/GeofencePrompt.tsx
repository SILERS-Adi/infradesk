import { MapPin, Play, Pause, X, Ticket } from 'lucide-react';
import type { GeofenceEvent } from '../../api/geolocation';

interface Props {
  entered: GeofenceEvent[];
  exited: GeofenceEvent[];
  hasActiveSession: boolean;
  activeSessionPaused: boolean;
  onStartSession: (clientId: string, ticketId?: string, locationId?: string) => void;
  onPauseSession: () => void;
  onResumeSession: () => void;
  onDismiss: () => void;
}

export function GeofencePrompt({
  entered, exited, hasActiveSession, activeSessionPaused,
  onStartSession, onPauseSession, onResumeSession, onDismiss,
}: Props) {
  // Priority: entered events first, then exited
  const enteredWithTickets = entered.filter(e => e.tickets.length > 0);
  const exitedWithTickets = exited.filter(e => e.tickets.length > 0);

  if (enteredWithTickets.length === 0 && exitedWithTickets.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 safe-area-pb">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Entered geofence */}
        {enteredWithTickets.map((ev, i) => (
          <div key={`enter-${i}`} className="p-5 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <MapPin className="h-5 w-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">Jesteś w pobliżu!</p>
                <p className="text-xs text-gray-500 truncate">{ev.location.clientName} · {ev.location.name}</p>
              </div>
            </div>

            {ev.tickets.length > 0 && (
              <div className="space-y-1.5 mb-4">
                {ev.tickets.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <Ticket className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-xs font-mono text-gray-400">{t.ticketNumber}</span>
                      <p className="text-sm text-gray-700 truncate">{t.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!hasActiveSession && (
              <button
                onClick={() => onStartSession(ev.location.clientId, ev.tickets[0]?.id, ev.location.id)}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-green-600 text-white font-semibold text-sm active:scale-[0.98] transition-transform"
              >
                <Play className="h-5 w-5" />
                Rozpocznij sesję
              </button>
            )}

            {hasActiveSession && activeSessionPaused && (
              <button
                onClick={onResumeSession}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-green-600 text-white font-semibold text-sm active:scale-[0.98] transition-transform"
              >
                <Play className="h-5 w-5" />
                Wznów sesję
              </button>
            )}
          </div>
        ))}

        {/* Exited geofence */}
        {exitedWithTickets.length > 0 && hasActiveSession && !activeSessionPaused && (
          <div className="p-5 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <MapPin className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Opuszczasz lokalizację</p>
                <p className="text-xs text-gray-500">Wstrzymać sesję?</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onPauseSession}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-white font-semibold text-sm active:scale-95 transition-transform"
              >
                <Pause className="h-5 w-5" />
                Wstrzymaj
              </button>
              <button
                onClick={onDismiss}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm active:scale-95 transition-transform"
              >
                Kontynuuj
              </button>
            </div>
          </div>
        )}

        {/* Dismiss */}
        <button onClick={onDismiss}
          className="w-full py-3 text-sm text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-1">
          <X className="h-4 w-4" />
          Zamknij
        </button>
      </div>
    </div>
  );
}
