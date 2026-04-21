import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, User as UserIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

interface CalendarEvent {
  id: string;
  kind: 'task' | 'delegation' | 'session';
  title: string;
  start: string;
  end?: string;
  color: string;
  assignee: string | null;
  href: string;
}

const DAY_NAMES = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];
const MONTH_NAMES = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

export function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const monthStart = cursor;
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);

  // Extend range to show padding days from prev/next month
  const firstDayOfWeek = (monthStart.getDay() + 6) % 7; // Monday = 0
  const gridStart = new Date(monthStart.getTime() - firstDayOfWeek * 86_400_000);
  const gridEnd = new Date(monthEnd.getTime() + (7 - ((monthEnd.getDay() + 6) % 7 || 7)) * 86_400_000);

  const { data } = useQuery<{ events: CalendarEvent[] }>({
    queryKey: ['calendar', cursor.toISOString()],
    queryFn: async () => (await api.get('/calendar/events', {
      params: { from: gridStart.toISOString(), to: gridEnd.toISOString() },
    })).data,
  });

  const events = data?.events ?? [];

  const days = useMemo(() => {
    const arr: Date[] = [];
    const cur = new Date(gridStart);
    while (cur < gridEnd) {
      arr.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return arr;
  }, [gridStart.getTime(), gridEnd.getTime()]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = ev.start.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [events]);

  const today = new Date().toISOString().slice(0, 10);
  const curMonth = cursor.getMonth();

  const prev = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const next = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  const goToday = () => {
    const d = new Date();
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Kalendarz</h1>
          <p className="text-[13px] text-tx2 mt-0.5">Zadania · Delegacje · Sesje pracy</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={goToday}>Dziś</Button>
          <Button size="sm" variant="outline" onClick={next}><ChevronRight className="h-4 w-4" /></Button>
          <span className="text-[14px] font-semibold text-tx ml-3">
            {MONTH_NAMES[curMonth]} {cursor.getFullYear()}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-tx3">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--pri)' }} />Zadania</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--wn)' }} />Delegacje</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--tx3)' }} />Sesje</span>
      </div>

      {/* Grid */}
      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-bd">
          {DAY_NAMES.map((d) => (
            <div key={d} className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-tx3 bg-sf-h">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = d.toISOString().slice(0, 10);
            const isCurMonth = d.getMonth() === curMonth;
            const isToday = key === today;
            const evs = eventsByDay.get(key) ?? [];
            return (
              <div
                key={key}
                className={cn(
                  'min-h-[100px] border-b border-r border-bd p-1.5',
                  !isCurMonth && 'opacity-40',
                )}
                style={{ background: isToday ? 'var(--pri-l)' : undefined }}
              >
                <div className={cn('text-[11px] font-semibold mb-1', isToday ? 'text-pri' : 'text-tx2')}>
                  {d.getDate()}
                </div>
                <div className="space-y-0.5">
                  {evs.slice(0, 3).map((ev) => (
                    <a
                      key={ev.id}
                      href={ev.href}
                      className="block px-1.5 py-0.5 rounded-[6px] text-[10px] truncate press"
                      style={{
                        background: `color-mix(in srgb, ${ev.color} 15%, transparent)`,
                        borderLeft: `2px solid ${ev.color}`,
                        color: 'var(--tx)',
                      }}
                      title={ev.title}
                    >
                      {ev.title}
                    </a>
                  ))}
                  {evs.length > 3 && (
                    <div className="text-[9px] text-tx3 px-1.5">+{evs.length - 3} więcej</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Summary */}
      <Card className="p-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-tx3 mb-3">Wszystkie w zakresie</h3>
        {events.length === 0 ? (
          <p className="text-[13px] text-tx3 text-center py-4">Brak wydarzeń</p>
        ) : (
          <div className="space-y-2">
            {events.slice(0, 20).map((ev) => (
              <a key={ev.id} href={ev.href} className="block hover:bg-sf-h rounded-[var(--r-s)] p-2 press">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: ev.color }} />
                  <Badge variant="neutral" className="text-[9px]">{ev.kind}</Badge>
                  <span className="text-[12px] text-tx flex-1 truncate">{ev.title}</span>
                  <span className="text-[10px] text-tx3 inline-flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" /> {new Date(ev.start).toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                  </span>
                  {ev.assignee && (
                    <span className="text-[10px] text-tx3 inline-flex items-center gap-1">
                      <UserIcon className="h-2.5 w-2.5" /> {ev.assignee}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
