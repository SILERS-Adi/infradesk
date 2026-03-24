import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Phone, Mail, Calendar, FileText, Plus, ChevronRight,
  AlertCircle, Trash2, CheckCircle2, Clock,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { crmApi } from '../../../api/crm';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { NewOrderWizard } from '../../../components/forms/NewOrderWizard';
import { getErrorMessage } from '../../../utils/helpers';
import type { CrmActivity, CrmActivityType, QuoteStatus } from '../../../types';

export const CRM_TYPE_CONFIG: Record<CrmActivityType, {
  label: string; icon: React.ReactNode; color: string; bg: string;
}> = {
  PHONE:   { label: 'Telefon',   icon: <Phone className="h-4 w-4" />,    color: 'text-green-600',  bg: 'bg-green-50  border-green-100' },
  EMAIL:   { label: 'E-mail',    icon: <Mail className="h-4 w-4" />,     color: 'text-blue-600',   bg: 'bg-blue-50   border-blue-100' },
  MEETING: { label: 'Spotkanie', icon: <Calendar className="h-4 w-4" />, color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100' },
  QUOTE:   { label: 'Oferta',    icon: <FileText className="h-4 w-4" />, color: 'text-orange-500', bg: 'bg-orange-50 border-orange-100' },
};

export const QUOTE_STATUS_CONFIG: Record<QuoteStatus, { label: string; color: string }> = {
  NEW:         { label: 'Nowe',                 color: 'bg-gray-100 text-gray-600' },
  PREPARING:   { label: 'Wycena w toku',        color: 'bg-yellow-100 text-yellow-700' },
  SENT:        { label: 'Wycena wysłana',       color: 'bg-blue-100 text-blue-700' },
  ACCEPTED:    { label: 'Zaakceptowana',        color: 'bg-green-100 text-green-700' },
  REJECTED:    { label: 'Odrzucona',            color: 'bg-red-100 text-red-600' },
  IN_PROGRESS: { label: 'W realizacji',         color: 'bg-brand-100 text-brand-700' },
  COMPLETED:   { label: 'Zakończone',           color: 'bg-emerald-100 text-emerald-700' },
};

type FilterType = CrmActivityType | 'ALL';

export function CrmPage() {
  const [showWizard, setShowWizard] = useState(false);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['crm', filter],
    queryFn: () => crmApi.getAll(filter !== 'ALL' ? { type: filter } : {}),
  });

  const deleteMutation = useMutation({
    mutationFn: () => crmApi.delete(deleteId!),
    onSuccess: () => { toast.success('Usunięto'); qc.invalidateQueries({ queryKey: ['crm'] }); setDeleteId(null); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div>
      <PageHeader
        title="CRM"
        subtitle="Historia kontaktów i zapytania ofertowe"
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowWizard(true)}>
            Nowe zlecenie
          </Button>
        }
      />

      {/* Filtry */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {(['ALL', 'PHONE', 'EMAIL', 'MEETING', 'QUOTE'] as FilterType[]).map(f => {
          const cfg = f !== 'ALL' ? CRM_TYPE_CONFIG[f] : null;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors',
                filter === f
                  ? (cfg ? `${cfg.color} ${cfg.bg} border-transparent` : 'bg-gray-900 text-white border-transparent')
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              )}
            >
              {cfg?.icon}
              {f === 'ALL' ? 'Wszystkie' : cfg?.label}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400">Ładowanie...</div>
      ) : activities.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400">Brak wpisów CRM</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-50">
          {activities.map(a => (
            <CrmActivityRow key={a.id} activity={a} onDelete={() => setDeleteId(a.id)} />
          ))}
        </div>
      )}

      {/* Wizard */}
      <Modal open={showWizard} onClose={() => setShowWizard(false)} title="" size="lg" noPadding>
        <NewOrderWizard onClose={() => { setShowWizard(false); qc.invalidateQueries({ queryKey: ['crm'] }); }} />
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate()}
        title="Usuń wpis"
        message="Czy na pewno chcesz usunąć ten wpis CRM?"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

function CrmActivityRow({ activity: a, onDelete }: { activity: CrmActivity; onDelete: () => void }) {
  const cfg = CRM_TYPE_CONFIG[a.type];
  const date = new Date(a.occurredAt);
  const dateStr = date.toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

  const summary = a.type === 'PHONE'
    ? a.notes
    : a.type === 'EMAIL'
    ? a.subject
    : a.type === 'MEETING'
    ? (a.title || a.meetingPlace || a.notes)
    : a.quoteDescription;

  return (
    <div className="flex items-start gap-3 p-4 hover:bg-gray-50/50 transition-colors">
      {/* Type icon */}
      <div className={clsx('w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg)}>
        <span className={cfg.color}>{cfg.icon}</span>
      </div>

      <div className="flex-1 min-w-0">
        {/* Client + type */}
        <div className="flex items-center gap-2 flex-wrap">
          {a.client && (
            <Link to={`/clients/${a.client.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
              {a.client.name}
            </Link>
          )}
          <span className={clsx('text-xs font-medium', cfg.color)}>{cfg.label}</span>
          {a.followUpRequired && (
            <span className="flex items-center gap-0.5 text-xs text-amber-600 font-medium">
              <AlertCircle className="h-3 w-3" /> Do działania
            </span>
          )}
          {a.type === 'QUOTE' && a.quoteStatus && (
            <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', QUOTE_STATUS_CONFIG[a.quoteStatus].color)}>
              {QUOTE_STATUS_CONFIG[a.quoteStatus].label}
            </span>
          )}
        </div>
        {/* Summary */}
        {summary && <p className="text-sm text-gray-700 mt-0.5 line-clamp-2">{summary}</p>}
        {/* Quote value */}
        {a.type === 'QUOTE' && a.quoteValue != null && (
          <p className="text-xs text-gray-500 mt-0.5">{a.quoteValue.toLocaleString('pl-PL')} zł</p>
        )}
        {/* Meta */}
        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{dateStr} {timeStr}</span>
          {a.createdBy && <span>{a.createdBy.firstName} {a.createdBy.lastName}</span>}
        </div>
      </div>

      {/* Delete */}
      <button onClick={onDelete} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 mt-1">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
