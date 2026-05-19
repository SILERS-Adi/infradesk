import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Phone, Mail, Calendar, FileText, ExternalLink, CheckCircle2, Trash2, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { formatRelativePl } from '@/lib/utils';

type CrmType = 'PHONE' | 'MEETING' | 'EMAIL' | 'QUOTE' | 'OTHER';
interface CrmActivity {
  id: string;
  type: CrmType;
  title: string;
  notes: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  followUpRequired: boolean;
  followUpAt: string | null;
  billable: boolean;
  quoteValueNet: string | null;
  createdAt: string;
  createdBy: { id: string; firstName: string | null; lastName: string | null };
  assignedTo: { id: string; firstName: string | null; lastName: string | null } | null;
  linkedTicket: { id: string; ticketNumber: string; title: string } | null;
}

const TYPE_META: Record<CrmType, { label: string; icon: typeof Phone; color: string }> = {
  PHONE: { label: 'Telefon', icon: Phone, color: 'var(--pri)' },
  MEETING: { label: 'Spotkanie', icon: Calendar, color: 'var(--in)' },
  EMAIL: { label: 'E-mail', icon: Mail, color: 'var(--wn)' },
  QUOTE: { label: 'Oferta', icon: FileText, color: 'var(--ok)' },
  OTHER: { label: 'Inne', icon: FileText, color: 'var(--tx3)' },
};

export function ActivitiesTab() {
  const qc = useQueryClient();
  const [onlyMine, setOnlyMine] = useState(true);
  const [filterType, setFilterType] = useState<'' | CrmType>('');

  const { data, isLoading } = useQuery<{ items: CrmActivity[] }>({
    queryKey: ['crm', 'activities', onlyMine, filterType],
    queryFn: async () => (await api.get('/crm/activities', {
      params: {
        onlyMine: onlyMine ? 'true' : 'false',
        type: filterType || undefined,
        limit: 100,
      },
    })).data,
  });

  const items = data?.items ?? [];

  const toggle = useMutation({
    mutationFn: async (vars: { id: string; completed: boolean }) =>
      (await api.patch(`/crm/activities/${vars.id}`, { completed: vars.completed })).data,
    onSuccess: (_d, vars) => {
      toast.success(vars.completed ? 'Oznaczone jako wykonane' : 'Przywrócone do zaplanowanych');
      qc.invalidateQueries({ queryKey: ['crm', 'activities'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err?.response?.data?.message ?? 'Błąd zmiany statusu'),
  });
  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/crm/activities/${id}`)).data,
    onSuccess: () => {
      toast.success('Aktywność usunięta');
      qc.invalidateQueries({ queryKey: ['crm', 'activities'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err?.response?.data?.message ?? 'Błąd usuwania'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            Tylko moje
          </label>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setFilterType('')}
              className="px-2 py-1 rounded-full text-[11px] border"
              style={{
                borderColor: filterType === '' ? 'var(--pri)' : 'var(--bd)',
                background: filterType === '' ? 'var(--pri-l)' : 'transparent',
                color: filterType === '' ? 'var(--pri)' : 'var(--tx2)',
              }}
            >Wszystkie</button>
            {(Object.keys(TYPE_META) as CrmType[]).map((t) => {
              const m = TYPE_META[t];
              const Icon = m.icon;
              const active = filterType === t;
              return (
                <button key={t} type="button" onClick={() => setFilterType(t)}
                  className="px-2 py-1 rounded-full text-[11px] border inline-flex items-center gap-1"
                  style={{
                    borderColor: active ? m.color : 'var(--bd)',
                    background: active ? `color-mix(in srgb, ${m.color} 12%, transparent)` : 'transparent',
                    color: active ? m.color : 'var(--tx2)',
                  }}
                >
                  <Icon className="h-2.5 w-2.5" /> {m.label}
                </button>
              );
            })}
          </div>
        </div>
        <span className="text-[12px] text-tx3">{items.length} aktywności</span>
      </div>

      {isLoading ? <SkeletonCard /> : items.length === 0 ? (
        <Card className="p-10 text-center">
          <FileText className="h-10 w-10 mx-auto mb-3 text-tx3 opacity-40" />
          <p className="text-tx font-medium mb-1">Brak aktywności</p>
          <p className="text-[13px] text-tx3">
            Aktywności CRM powstają automatycznie gdy tworzysz zgłoszenie z komponentem CRM (telefon/spotkanie/email/oferta).
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-bd overflow-hidden">
          {items.map((a) => {
            const meta = TYPE_META[a.type] ?? TYPE_META.OTHER;
            const Icon = meta.icon;
            const done = !!a.completedAt;
            return (
              <div key={a.id} className="flex items-start gap-3 p-3 hover:bg-sf-h">
                <div
                  className="w-8 h-8 rounded-[var(--r-s)] shrink-0 flex items-center justify-center"
                  style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium text-tx truncate">{a.title}</span>
                    <Badge variant={done ? 'success' : 'neutral'}>{done ? 'Zrobione' : 'Zaplanowane'}</Badge>
                    {a.billable && <Badge variant="warning">Bilowane</Badge>}
                    {a.quoteValueNet && <Badge variant="accent">{Number(a.quoteValueNet).toFixed(2)} zł</Badge>}
                    {a.followUpRequired && <Badge variant="danger">Follow-up</Badge>}
                  </div>
                  {a.notes && <div className="text-[12px] text-tx2 mt-1 line-clamp-2">{a.notes}</div>}
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-tx3 flex-wrap">
                    {a.scheduledAt && <span>📅 {formatRelativePl(a.scheduledAt)}</span>}
                    <span>Przez {[a.createdBy.firstName, a.createdBy.lastName].filter(Boolean).join(' ') || '?'}</span>
                    {a.linkedTicket && (
                      <Link to={`/tickets/${a.linkedTicket.id}`} className="hover:text-pri inline-flex items-center gap-0.5">
                        <ExternalLink className="h-2.5 w-2.5" /> {a.linkedTicket.ticketNumber}
                      </Link>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ id: a.id, completed: !done })}
                    title={done ? 'Cofnij — przywróć do zaplanowanych' : 'Oznacz jako wykonane'}
                    className="p-1.5 rounded-[var(--r-s)] hover:bg-sf-h press"
                    style={{ color: done ? 'var(--tx3)' : 'var(--ok)' }}
                  >
                    {done ? <RotateCcw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    disabled={del.isPending}
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: `Usunąć aktywność "${a.title}"?`,
                        message: 'Akcja nieodwracalna.',
                        confirmLabel: 'Usuń',
                        danger: true,
                      });
                      if (ok) del.mutate(a.id);
                    }}
                    title="Usuń aktywność"
                    className="p-1.5 rounded-[var(--r-s)] hover:bg-sf-h press text-er"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
