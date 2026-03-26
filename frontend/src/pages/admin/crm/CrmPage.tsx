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
import { UnifiedTicketWizard } from '../../../components/wizard/UnifiedTicketWizard';
import { getErrorMessage } from '../../../utils/helpers';
import type { CrmActivity, CrmActivityType, QuoteStatus } from '../../../types';

export const CRM_TYPE_CONFIG: Record<CrmActivityType, {
  label: string; icon: React.ReactNode; color: string; bg: string;
}> = {
  PHONE:   { label: 'Telefon',   icon: <Phone className="h-4 w-4" />,    color: '#4ADE80',  bg: 'rgba(34,197,94,0.12)' },
  EMAIL:   { label: 'E-mail',    icon: <Mail className="h-4 w-4" />,     color: '#60A5FA',  bg: 'rgba(59,130,246,0.12)' },
  MEETING: { label: 'Spotkanie', icon: <Calendar className="h-4 w-4" />, color: '#A78BFA',  bg: 'rgba(139,92,246,0.12)' },
  QUOTE:   { label: 'Oferta',    icon: <FileText className="h-4 w-4" />, color: '#FB923C',  bg: 'rgba(249,115,22,0.12)' },
};

export const QUOTE_STATUS_CONFIG: Record<QuoteStatus, { label: string; bg: string; color: string }> = {
  NEW:         { label: 'Nowe',                 bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)' },
  PREPARING:   { label: 'Wycena w toku',        bg: 'rgba(234,179,8,0.12)',   color: '#FACC15' },
  SENT:        { label: 'Wycena wysłana',       bg: 'rgba(59,130,246,0.12)',  color: '#60A5FA' },
  ACCEPTED:    { label: 'Zaakceptowana',        bg: 'rgba(34,197,94,0.12)',   color: '#4ADE80' },
  REJECTED:    { label: 'Odrzucona',            bg: 'rgba(239,68,68,0.12)',   color: '#F87171' },
  IN_PROGRESS: { label: 'W realizacji',         bg: 'rgba(139,92,246,0.12)',  color: '#A78BFA' },
  COMPLETED:   { label: 'Zakończone',           bg: 'rgba(16,185,129,0.12)',  color: '#34D399' },
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
            Nowe zgłoszenie
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors"
              style={filter === f
                ? (cfg
                  ? { color: cfg.color, background: cfg.bg, borderColor: 'transparent' }
                  : { background: 'rgba(255,255,255,0.1)', color: '#fff', borderColor: 'transparent' })
                : { background: 'rgba(255,255,255,0.025)', color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.06)' }
              }
            >
              {cfg?.icon}
              {f === 'ALL' ? 'Wszystkie' : cfg?.label}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>Ładowanie...</div>
      ) : activities.length === 0 ? (
        <div className="rounded-2xl p-8 text-center text-sm" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>Brak wpisów CRM</div>
      ) : (
        <div className="rounded-2xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {activities.map((a, i) => (
            <CrmActivityRow key={a.id} activity={a} onDelete={() => setDeleteId(a.id)} isLast={i === activities.length - 1} />
          ))}
        </div>
      )}

      {/* Unified Wizard */}
      <UnifiedTicketWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onSuccess={() => { qc.invalidateQueries({ queryKey: ['crm'] }); }}
      />

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

function CrmActivityRow({ activity: a, onDelete, isLast }: { activity: CrmActivity; onDelete: () => void; isLast?: boolean }) {
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
    <div
      className="flex items-start gap-3 p-4 hover:bg-white/[0.03] transition-colors"
      style={!isLast ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : undefined}
    >
      {/* Type icon */}
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: cfg.bg, border: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ color: cfg.color }}>{cfg.icon}</span>
      </div>

      <div className="flex-1 min-w-0">
        {/* Client + type */}
        <div className="flex items-center gap-2 flex-wrap">
          {a.client && (
            <Link to={`/clients/${a.client.id}`} className="text-xs font-semibold text-violet-400 hover:underline">
              {a.client.name}
            </Link>
          )}
          <span className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
          {a.followUpRequired && (
            <span className="flex items-center gap-0.5 text-xs text-amber-400 font-medium">
              <AlertCircle className="h-3 w-3" /> Do działania
            </span>
          )}
          {a.type === 'QUOTE' && a.quoteStatus && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: QUOTE_STATUS_CONFIG[a.quoteStatus].bg, color: QUOTE_STATUS_CONFIG[a.quoteStatus].color }}
            >
              {QUOTE_STATUS_CONFIG[a.quoteStatus].label}
            </span>
          )}
        </div>
        {/* Summary */}
        {summary && <p className="text-sm mt-0.5 line-clamp-2" style={{ color: 'rgba(255,255,255,0.6)' }}>{summary}</p>}
        {/* Quote value */}
        {a.type === 'QUOTE' && a.quoteValue != null && (
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{a.quoteValue.toLocaleString('pl-PL')} zł</p>
        )}
        {/* Meta */}
        <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{dateStr} {timeStr}</span>
          {a.createdBy && <span>{a.createdBy.firstName} {a.createdBy.lastName}</span>}
        </div>
      </div>

      {/* Delete */}
      <button onClick={onDelete} className="hover:text-red-400 transition-colors flex-shrink-0 mt-1" style={{ color: 'rgba(255,255,255,0.15)' }}>
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
