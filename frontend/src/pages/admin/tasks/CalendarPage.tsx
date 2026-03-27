import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
import type { EventInput, EventDropArg, EventClickArg, EventReceiveArg } from '@fullcalendar/core';
import { ClipboardList, Clock, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import { tasksApi } from '../../../api/tasks';
import { sessionsApi } from '../../../api/sessions';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import { formatDateTime, getErrorMessage } from '../../../utils/helpers';
import type { Task } from '../../../types';

const STATUS_COLORS: Record<string, string> = {
  NEW: '#3B82F6', IN_PROGRESS: '#F59E0B', DONE: '#10B981',
};
const PRIORITY_BORDER: Record<string, string> = {
  CRITICAL: '#EF4444', HIGH: '#F97316', MEDIUM: '#A78BFA', LOW: '#6B7280',
};

function fmtEst(min?: number | null): string {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
}

export function CalendarPage() {
  const qc = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const calendarRef = useRef<any>(null);
  const unscheduledRef = useRef<HTMLDivElement>(null);

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', { all: true }],
    queryFn: () => tasksApi.getAll({ all: true }),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions-calendar'],
    queryFn: () => sessionsApi.getAll({}),
  });

  // Unscheduled tasks (no dueAt)
  const unscheduled = useMemo(() => tasks.filter(t => !t.dueAt && t.status !== 'DONE'), [tasks]);
  const scheduled = useMemo(() => tasks.filter(t => t.dueAt), [tasks]);

  // Init draggable for external events
  useEffect(() => {
    if (!unscheduledRef.current) return;
    const draggable = new Draggable(unscheduledRef.current, {
      itemSelector: '[data-task-id]',
      eventData: (el) => {
        const taskId = el.getAttribute('data-task-id') ?? '';
        const task = tasks.find(t => t.id === taskId);
        return {
          id: taskId,
          title: task ? `${task.taskNumber} ${task.title}` : '',
          backgroundColor: STATUS_COLORS[task?.status ?? 'NEW'],
          borderColor: PRIORITY_BORDER[task?.ticket?.priority ?? 'MEDIUM'],
          allDay: true,
          extendedProps: { type: 'task', task },
        };
      },
    });
    return () => draggable.destroy();
  }, [tasks]);

  const events = useMemo((): EventInput[] => {
    const taskEvents: EventInput[] = scheduled.map(t => ({
      id: t.id,
      title: `${t.taskNumber} ${t.title}`,
      start: t.dueAt!,
      allDay: true,
      backgroundColor: STATUS_COLORS[t.status] ?? '#6B7280',
      borderColor: PRIORITY_BORDER[t.ticket?.priority ?? 'MEDIUM'] ?? '#A78BFA',
      textColor: '#fff',
      extendedProps: { type: 'task', task: t },
    }));

    const sessionEvents: EventInput[] = sessions
      .filter(s => s.startedAt && (s.durationMin || s.status === 'ACTIVE'))
      .map(s => ({
        id: `session-${s.id}`,
        title: `⏱ ${s.client?.name ?? 'Sesja'} ${s.ticket?.ticketNumber ?? ''}`,
        start: s.startedAt,
        end: s.endedAt ?? undefined,
        backgroundColor: s.status === 'ACTIVE' ? 'rgba(34,197,94,0.2)' : 'rgba(139,92,246,0.15)',
        borderColor: s.status === 'ACTIVE' ? '#4ADE80' : '#A78BFA',
        textColor: s.status === 'ACTIVE' ? '#4ADE80' : '#A78BFA',
        editable: false,
        extendedProps: { type: 'session', session: s },
      }));

    return [...taskEvents, ...sessionEvents];
  }, [scheduled, sessions]);

  const updateDueMutation = useMutation({
    mutationFn: ({ id, dueAt }: { id: string; dueAt: string }) => tasksApi.update(id, { dueAt }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Termin ustawiony'); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleEventDrop = (info: EventDropArg) => {
    if (info.event.extendedProps.type !== 'task') { info.revert(); return; }
    const newDate = info.event.start?.toISOString();
    if (newDate) updateDueMutation.mutate({ id: info.event.id, dueAt: newDate });
  };

  const handleEventReceive = (info: EventReceiveArg) => {
    // External drop from unscheduled panel
    const newDate = info.event.start?.toISOString();
    if (newDate && info.event.id) {
      updateDueMutation.mutate({ id: info.event.id, dueAt: newDate });
    }
  };

  const handleEventClick = (info: EventClickArg) => {
    if (info.event.extendedProps.type === 'task') setSelectedTask(info.event.extendedProps.task);
  };

  return (
    <div>
      <PageHeader title="Kalendarz" subtitle="Przeciągnij zadania z panelu na kalendarz" />

      <div className="flex gap-4">
        {/* ── Left: Unscheduled tasks panel ── */}
        <div className="w-64 flex-shrink-0">
          <div className="rounded-xl sticky top-4" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <h3 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Nieprzypisane ({unscheduled.length})
              </h3>
            </div>
            <div ref={unscheduledRef} className="p-2 space-y-1.5 max-h-[70vh] overflow-y-auto">
              {unscheduled.length === 0 ? (
                <p className="text-[11px] text-center py-6" style={{ color: 'rgba(255,255,255,0.25)' }}>Brak zadań bez terminu</p>
              ) : (
                unscheduled.map(t => (
                  <div
                    key={t.id}
                    data-task-id={t.id}
                    className="flex items-start gap-2 p-2.5 rounded-lg cursor-grab active:cursor-grabbing transition-all hover:bg-white/[0.03]"
                    style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.06)`, borderLeftWidth: 3, borderLeftColor: PRIORITY_BORDER[t.ticket?.priority ?? 'MEDIUM'] }}
                  >
                    <GripVertical className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.15)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-mono text-violet-400">{t.taskNumber}</p>
                      <p className="text-[12px] font-medium text-white/80 truncate">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {t.ticket?.client && (
                          <span className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{t.ticket.client.name}</span>
                        )}
                        {t.estimatedMinutes && (
                          <span className="flex items-center gap-0.5 text-[10px] font-medium" style={{ color: '#A78BFA' }}>
                            <Clock className="h-2.5 w-2.5" /> {fmtEst(t.estimatedMinutes)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Calendar ── */}
        <div className="flex-1 min-w-0">
          {/* Legend */}
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <span className="w-3 h-3 rounded" style={{ background: '#3B82F6' }} /> Nowe
            </div>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <span className="w-3 h-3 rounded" style={{ background: '#F59E0B' }} /> W trakcie
            </div>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <span className="w-3 h-3 rounded" style={{ background: '#10B981' }} /> Zrealizowane
            </div>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <span className="w-3 h-3 rounded" style={{ background: 'rgba(139,92,246,0.3)', border: '1px solid #A78BFA' }} /> Sesja
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden p-1" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <style>{`
              .fc { --fc-border-color: rgba(255,255,255,0.06); --fc-page-bg-color: transparent; --fc-neutral-bg-color: rgba(255,255,255,0.02); --fc-list-event-hover-bg-color: rgba(255,255,255,0.04); --fc-today-bg-color: rgba(139,92,246,0.06); --fc-event-text-color: #fff; }
              .fc .fc-col-header-cell { background: rgba(255,255,255,0.02); }
              .fc .fc-col-header-cell-cushion { color: rgba(255,255,255,0.5); font-size: 11px; font-weight: 600; text-transform: uppercase; padding: 8px 4px; }
              .fc .fc-daygrid-day-number { color: rgba(255,255,255,0.6); font-size: 12px; padding: 6px 8px; }
              .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number { color: #A78BFA; font-weight: 700; }
              .fc .fc-event { border-radius: 6px; padding: 2px 6px; font-size: 11px; font-weight: 500; border-width: 2px; border-left-width: 3px; cursor: grab; }
              .fc .fc-event:hover { filter: brightness(1.2); }
              .fc .fc-button { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); font-size: 12px; font-weight: 600; border-radius: 8px; padding: 6px 14px; }
              .fc .fc-button:hover { background: rgba(255,255,255,0.08); color: #fff; }
              .fc .fc-button-active { background: rgba(139,92,246,0.15) !important; border-color: rgba(139,92,246,0.3) !important; color: #A78BFA !important; }
              .fc .fc-toolbar-title { color: rgba(255,255,255,0.85); font-size: 16px; font-weight: 700; }
              .fc .fc-scrollgrid { border: none; }
              .fc .fc-timegrid-slot-label-cushion { color: rgba(255,255,255,0.3); font-size: 10px; }
              .fc td, .fc th { border-color: rgba(255,255,255,0.04) !important; }
              .fc .fc-daygrid-day-frame { min-height: 80px; }
              .fc .fc-popover { background: #0E1425; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; }
              .fc .fc-popover-header { background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.7); font-size: 12px; }
              .fc .fc-more-link { color: #A78BFA; font-size: 11px; font-weight: 600; }
            `}</style>
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              locale="pl"
              firstDay={1}
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
              buttonText={{ today: 'Dziś', month: 'Miesiąc', week: 'Tydzień', day: 'Dzień' }}
              events={events}
              editable={true}
              droppable={true}
              eventDrop={handleEventDrop}
              eventReceive={handleEventReceive}
              eventClick={handleEventClick}
              height="auto"
              dayMaxEvents={4}
              eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            />
          </div>
        </div>
      </div>

      {/* Task detail modal */}
      {selectedTask && (
        <Modal open onClose={() => setSelectedTask(null)} title={selectedTask.taskNumber} size="md">
          <div className="space-y-3">
            <p className="text-[14px] font-semibold text-white/90">{selectedTask.title}</p>
            {selectedTask.description && <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{selectedTask.description}</p>}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Status:</span> <span className="ml-1 text-white/80">{selectedTask.status === 'NEW' ? 'Nowe' : selectedTask.status === 'IN_PROGRESS' ? 'W trakcie' : 'Zrealizowane'}</span></div>
              {selectedTask.ticket && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Priorytet:</span> <span className="ml-1"><PriorityBadge priority={selectedTask.ticket.priority} /></span></div>}
              {selectedTask.ticket?.client && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Klient:</span> <span className="ml-1 text-white/80">{selectedTask.ticket.client.name}</span></div>}
              {selectedTask.assignedTo && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Technik:</span> <span className="ml-1 text-white/80">{selectedTask.assignedTo.firstName} {selectedTask.assignedTo.lastName}</span></div>}
              {selectedTask.dueAt && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Termin:</span> <span className="ml-1 text-amber-400">{formatDateTime(selectedTask.dueAt)}</span></div>}
              {selectedTask.estimatedMinutes && <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Szacowany czas:</span> <span className="ml-1 text-violet-400">{fmtEst(selectedTask.estimatedMinutes)}</span></div>}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setSelectedTask(null)}>Zamknij</Button>
              <Button onClick={() => { window.location.href = '/tasks'; }}>Otwórz zadania</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
