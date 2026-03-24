import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { tasksApi } from '../../../api/tasks';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import { useAuth } from '../../../store/authStore';
import { formatDate, getErrorMessage } from '../../../utils/helpers';
import type { Task, TaskStatus } from '../../../types';

type TabKey = 'NEW' | 'IN_PROGRESS' | 'DONE';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'NEW',         label: 'Nowe',       icon: <Clock className="h-4 w-4" /> },
  { key: 'IN_PROGRESS', label: 'W trakcie',  icon: <Loader2 className="h-4 w-4" /> },
  { key: 'DONE',        label: 'Zrealizowane', icon: <CheckCircle2 className="h-4 w-4" /> },
];

const STATUS_NEXT: Record<TabKey, { label: string; status: TaskStatus } | null> = {
  NEW:         { label: 'Rozpocznij', status: 'IN_PROGRESS' },
  IN_PROGRESS: { label: 'Zakończ',    status: 'DONE' },
  DONE:        null,
};

function TaskCard({ task, onChangeStatus }: { task: Task; onChangeStatus: (id: string, status: TaskStatus) => void }) {
  const next = STATUS_NEXT[task.status as TabKey];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-indigo-600 font-semibold">{task.taskNumber}</span>
            {task.ticket && <PriorityBadge priority={task.ticket.priority} />}
          </div>
          <p className="font-medium text-gray-900 truncate">{task.title}</p>
          {task.ticket?.client && (
            <p className="text-xs text-gray-500 mt-0.5">
              <Link to={`/tickets/${task.ticketId}`} className="text-indigo-600 hover:underline">
                {task.ticket.ticketNumber}
              </Link>
              {' · '}{task.ticket.client.name}
            </p>
          )}
          {task.notes && (
            <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded p-2 whitespace-pre-wrap">{task.notes}</p>
          )}
        </div>
        {next && (
          <button
            onClick={() => onChangeStatus(task.id, next.status)}
            className="flex-shrink-0 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            {next.label}
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        {task.assignedTo && (
          <span>{task.assignedTo.firstName} {task.assignedTo.lastName}</span>
        )}
        <span>·</span>
        <span>{formatDate(task.createdAt)}</span>
        {task.dueAt && <span className="text-amber-600">Termin: {formatDate(task.dueAt)}</span>}
      </div>
    </div>
  );
}

export function TasksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('NEW');
  const isAdmin = user?.role === 'ADMIN';

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', { all: isAdmin }],
    queryFn: () => tasksApi.getAll({ all: isAdmin }),
    refetchInterval: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      tasksApi.changeStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Status zadania zaktualizowany');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const tabTasks = tasks.filter(t => t.status === activeTab);

  return (
    <div>
      <PageHeader
        title="Zadania"
        subtitle={`${tasks.filter(t => t.status !== 'DONE').length} aktywnych`}
      />

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-6">
        <div className="flex border-b border-gray-200">
          {TABS.map(tab => {
            const count = tasks.filter(t => t.status === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === tab.key
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    tab.key === 'NEW' ? 'bg-blue-100 text-blue-700' :
                    tab.key === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : tabTasks.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">Brak zadań w tej kategorii</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tabTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onChangeStatus={(id, status) => statusMutation.mutate({ id, status })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
