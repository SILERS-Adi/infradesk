import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Loader2, Play, Pause, Square, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../store/authStore';
import { tasksApi } from '../../api/tasks';
import { sessionsApi } from '../../api/sessions';
import type { Task } from '../../types';

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#EF4444', HIGH: '#F59E0B', MEDIUM: '#5B5FEF', LOW: '#00C2FF',
};

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'NEW', label: 'Nowe' },
  { key: 'IN_PROGRESS', label: 'W trakcie' },
  { key: 'DONE', label: 'Zakończone' },
];

function TaskCard({ task, activeSession }: { task: Task; activeSession: any }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [loading, setLoading] = useState('');

  const isSessionForThis = activeSession?.ticketId === task.ticketId;

  const handleStart = async () => {
    setLoading('start');
    try {
      await sessionsApi.startMobile({ clientId: task.ticket?.workspace?.id ?? task.ticket?.client?.id ?? '', ticketId: task.ticketId });
      // Zmień status zadania na IN_PROGRESS
      if (task.status === 'NEW') {
        await tasksApi.changeStatus(task.id, 'IN_PROGRESS');
      }
      qc.invalidateQueries({ queryKey: ['mobile-active-session'] });
      qc.invalidateQueries({ queryKey: ['mobile-tasks'] });
      qc.invalidateQueries({ queryKey: ['mobile-my-tasks'] });
      toast.success('Sesja rozpoczęta');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? err?.response?.data?.error ?? 'Błąd');
    }
    setLoading('');
  };

  const handlePause = async () => {
    if (!activeSession) return;
    setLoading('pause');
    try { await sessionsApi.pause(activeSession.id); qc.invalidateQueries({ queryKey: ['mobile-active-session'] }); toast('Wstrzymano', { icon: '⏸️' }); }
    catch { toast.error('Błąd'); }
    setLoading('');
  };

  const handleResume = async () => {
    if (!activeSession) return;
    setLoading('resume');
    try { await sessionsApi.resume(activeSession.id); qc.invalidateQueries({ queryKey: ['mobile-active-session'] }); toast.success('Wznowiono'); }
    catch { toast.error('Błąd'); }
    setLoading('');
  };

  const handleEnd = async () => {
    if (!activeSession) return;
    setLoading('end');
    try {
      await sessionsApi.end(activeSession.id);
      // Zmień status zadania na DONE
      await tasksApi.changeStatus(task.id, 'DONE');
      qc.invalidateQueries({ queryKey: ['mobile-active-session'] });
      qc.invalidateQueries({ queryKey: ['mobile-tasks'] });
      qc.invalidateQueries({ queryKey: ['mobile-my-tasks'] });
      toast.success('Zadanie zakończone');
    }
    catch { toast.error('Błąd'); }
    setLoading('');
  };

  const canStart = !activeSession && task.status !== 'DONE';
  const priority = task.ticket?.priority ?? 'MEDIUM';

  return (
    <div className="rounded-[18px] overflow-hidden"
      style={{ background: 'rgba(20,30,48,0.72)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.06)' }}>

      {/* Info row — tap to go to ticket */}
      <button onClick={() => task.ticketId && navigate(`/m/tickets/${task.ticketId}`)}
        className="w-full flex items-center gap-3 p-4 text-left active:opacity-80 transition-opacity">
        <div className="w-1 h-12 rounded-full flex-shrink-0" style={{ background: PRIORITY_COLORS[priority] ?? '#5B5FEF' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-mono" style={{ color: '#6B7280' }}>{task.taskNumber}</span>
            {task.ticket?.ticketNumber && (
              <span className="text-[10px]" style={{ color: '#4B5563' }}>{task.ticket.ticketNumber}</span>
            )}
          </div>
          <p className="text-sm font-semibold truncate" style={{ color: '#E5E7EB' }}>{task.title}</p>
          <p className="text-xs truncate mt-0.5" style={{ color: '#6B7280' }}>{task.ticket?.client?.name}</p>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: '#4B5563' }} />
      </button>

      {/* Session controls — not on DONE */}
      {task.status !== 'DONE' && (
        <div className="px-4 pb-3 flex gap-2">
          {canStart && (
            <button onClick={handleStart} disabled={!!loading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-xs active:scale-[0.97] transition-all duration-200 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #059669, #10B981)', color: '#fff', boxShadow: '0 0 15px rgba(16,185,129,0.25)' }}>
              {loading === 'start' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Start
            </button>
          )}
          {isSessionForThis && activeSession?.status === 'ACTIVE' && (
            <>
              <button onClick={handlePause} disabled={!!loading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-xs active:scale-[0.97] transition-all disabled:opacity-50"
                style={{ background: 'rgba(245,158,11,0.2)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)' }}>
                {loading === 'pause' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />} Pauza
              </button>
              <button onClick={handleEnd} disabled={!!loading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-xs active:scale-[0.97] transition-all disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                {loading === 'end' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />} Zakończ
              </button>
            </>
          )}
          {isSessionForThis && activeSession?.status === 'PAUSED' && (
            <>
              <button onClick={handleResume} disabled={!!loading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-xs active:scale-[0.97] transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #5B5FEF, #00C2FF)', color: '#fff', boxShadow: '0 0 15px rgba(91,95,239,0.25)' }}>
                {loading === 'resume' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Wznów
              </button>
              <button onClick={handleEnd} disabled={!!loading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-xs active:scale-[0.97] transition-all disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                {loading === 'end' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />} Zakończ
              </button>
            </>
          )}
          {!canStart && !isSessionForThis && activeSession && (task.status as string) !== 'DONE' && (
            <div className="flex-1 py-2 text-center">
              <span className="text-[10px]" style={{ color: '#6B7280' }}>Inna sesja aktywna</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MobileTasksPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<string>('NEW');

  const { data: tasks = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['mobile-tasks', tab, user?.id],
    queryFn: () => tasksApi.getAll({ assignedToUserId: user?.id, status: tab }),
    enabled: !!user?.id,
  });

  const { data: activeSession } = useQuery({
    queryKey: ['mobile-active-session'],
    queryFn: () => sessionsApi.getActive(),
    refetchInterval: 30000,
  });

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: '#E5E7EB' }}>Moje zadania</h1>
        <button onClick={() => refetch()} disabled={isFetching}
          className="p-2.5 rounded-xl active:scale-95 transition-all duration-200"
          style={{ background: 'rgba(20,30,48,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {isFetching
            ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#5B5FEF' }} />
            : <RefreshCw className="h-4 w-4" style={{ color: '#6B7280' }} />}
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2">
        {STATUS_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex-1 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 active:scale-[0.97]"
            style={tab === t.key
              ? { background: 'linear-gradient(135deg, #5B5FEF, #4338CA)', color: '#fff', boxShadow: '0 0 20px rgba(91,95,239,0.25)' }
              : { background: 'rgba(20,30,48,0.72)', border: '1px solid rgba(255,255,255,0.08)', color: '#6B7280' }
            }>
            {t.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#5B5FEF' }} />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: '#6B7280' }}>
            {tab === 'NEW' ? 'Brak nowych zadań' : tab === 'IN_PROGRESS' ? 'Brak zadań w trakcie' : 'Brak zakończonych zadań'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} activeSession={activeSession} />
          ))}
        </div>
      )}
    </div>
  );
}
