import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  X, Search, Building2, User, Wrench, MessageSquare,
  Phone, Mail, Calendar, FileText, ChevronRight, ChevronLeft,
  CheckCircle2, AlertCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { clientsApi } from '../../api/clients';
import { locationsApi } from '../../api/locations';
import { devicesApi } from '../../api/devices';
import { usersApi } from '../../api/users';
import { ticketsApi } from '../../api/tickets';
import { crmApi } from '../../api/crm';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { getErrorMessage } from '../../utils/helpers';
import type { Client, CrmActivityType } from '../../types';

// ── Step types ──────────────────────────────────────────────────────────────
type Step =
  | 'client'
  | 'type'
  | 'service'
  | 'crm_type'
  | 'phone'
  | 'email'
  | 'meeting'
  | 'quote';

type OrderType = 'SERVICE' | 'CRM';
type CrmSub = Extract<CrmActivityType, 'PHONE' | 'EMAIL' | 'MEETING' | 'QUOTE'>;

// ── Zod schemas ──────────────────────────────────────────────────────────────
const serviceSchema = z.object({
  locationId:       z.string().min(1, 'Wybierz lokalizację'),
  assignedToUserId: z.string().optional(),
  deviceId:         z.string().optional(),
  title:            z.string().min(1, 'Tytuł jest wymagany'),
  description:      z.string().optional(),
  priority:         z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  dueAt:            z.string().optional(),
  billedInContract: z.boolean().default(false),
});

const phoneSchema = z.object({
  contactPerson:    z.string().optional(),
  notes:            z.string().min(1, 'Notatka jest wymagana'),
  occurredAt:       z.string().optional(),
  followUpRequired: z.boolean().default(false),
  assignedToUserId: z.string().optional(),
});

const emailSchema = z.object({
  subject:          z.string().min(1, 'Temat jest wymagany'),
  notes:            z.string().optional(),
  occurredAt:       z.string().optional(),
  followUpRequired: z.boolean().default(false),
});

const meetingSchema = z.object({
  title:            z.string().optional(),
  meetingPlace:     z.string().optional(),
  participants:     z.string().optional(),
  notes:            z.string().optional(),
  occurredAt:       z.string().optional(),
  followUpRequired: z.boolean().default(false),
});

const quoteSchema = z.object({
  quoteDescription: z.string().min(1, 'Opis zapytania jest wymagany'),
  quoteValue:       z.string().optional(),
  notes:            z.string().optional(),
  assignedToUserId: z.string().optional(),
});

type ServiceForm = z.infer<typeof serviceSchema>;
type PhoneForm = z.infer<typeof phoneSchema>;
type EmailForm = z.infer<typeof emailSchema>;
type MeetingForm = z.infer<typeof meetingSchema>;
type QuoteForm = z.infer<typeof quoteSchema>;

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void;
  defaultClientId?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function NewOrderWizard({ onClose, defaultClientId }: Props) {
  const qc = useQueryClient();

  // Wizard state
  const [step, setStep] = useState<Step>(defaultClientId ? 'type' : 'client');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [crmSub, setCrmSub] = useState<CrmSub | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [done, setDone] = useState(false);

  // Load default client
  const { data: defaultClient } = useQuery({
    queryKey: ['clients', defaultClientId],
    queryFn: () => clientsApi.getOne(defaultClientId!),
    enabled: !!defaultClientId && !selectedClient,
  });

  useEffect(() => {
    if (defaultClient && !selectedClient) {
      setSelectedClient(defaultClient);
    }
  }, [defaultClient]);

  // Clients search
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.getAll(),
    enabled: step === 'client',
  });

  const filteredClients = clientSearch.length > 0
    ? clients.filter(c =>
        c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.taxId ?? '').includes(clientSearch)
      )
    : clients.slice(0, 8);

  // Locations for selected client
  const { data: locations = [] } = useQuery({
    queryKey: ['locations', { clientId: selectedClient?.id }],
    queryFn: () => locationsApi.getAll({ clientId: selectedClient!.id }),
    enabled: !!selectedClient && step === 'service',
  });

  // Devices for selected client
  const { data: devices = [] } = useQuery({
    queryKey: ['devices', { clientId: selectedClient?.id }],
    queryFn: () => devicesApi.getAll({ clientId: selectedClient!.id }),
    enabled: !!selectedClient && step === 'service',
  });

  // Workers (ADMIN + TECHNICIAN)
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll(),
    enabled: step === 'service' || step === 'phone' || step === 'quote',
  });
  const workers = allUsers.filter(u => u.role !== 'CLIENT' && u.isActive);

  // ── Service form ───────────────────────────────────────────────────────────
  const svc = useForm<ServiceForm>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      priority: 'MEDIUM',
      billedInContract: selectedClient?.hasContract ?? false,
    },
  });

  const createTicket = useMutation({
    mutationFn: (d: ServiceForm) => ticketsApi.create({
      clientId: selectedClient!.id,
      locationId: d.locationId,
      deviceId: d.deviceId || undefined,
      assignedToUserId: d.assignedToUserId || undefined,
      type: 'REQUEST',
      priority: d.priority,
      source: 'INTERNAL',
      title: d.title,
      description: d.description || d.title,
      dueAt: d.dueAt ? new Date(d.dueAt).toISOString() : undefined,
      billedInContract: d.billedInContract,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['clients', selectedClient!.id] });
      toast.success('Zlecenie utworzone');
      setDone(true);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // ── CRM mutations ──────────────────────────────────────────────────────────
  const createCrm = useMutation({
    mutationFn: (payload: Parameters<typeof crmApi.create>[0]) => crmApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm'] });
      toast.success('Wpis CRM zapisany');
      setDone(true);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // ── CRM sub-forms ──────────────────────────────────────────────────────────
  const phone = useForm<PhoneForm>({ resolver: zodResolver(phoneSchema), defaultValues: { followUpRequired: false, occurredAt: toDatetimeLocal(new Date()) } });
  const email = useForm<EmailForm>({ resolver: zodResolver(emailSchema), defaultValues: { followUpRequired: false, occurredAt: toDatetimeLocal(new Date()) } });
  const meeting = useForm<MeetingForm>({ resolver: zodResolver(meetingSchema), defaultValues: { followUpRequired: false, occurredAt: toDatetimeLocal(new Date()) } });
  const quote = useForm<QuoteForm>({ resolver: zodResolver(quoteSchema) });

  const submitPhone = (d: PhoneForm) => createCrm.mutate({
    clientId: selectedClient!.id, type: 'PHONE',
    contactPerson: d.contactPerson, notes: d.notes,
    occurredAt: d.occurredAt ? new Date(d.occurredAt).toISOString() : undefined,
    followUpRequired: d.followUpRequired,
    assignedToUserId: d.assignedToUserId || undefined,
  });

  const submitEmail = (d: EmailForm) => createCrm.mutate({
    clientId: selectedClient!.id, type: 'EMAIL',
    subject: d.subject, notes: d.notes,
    occurredAt: d.occurredAt ? new Date(d.occurredAt).toISOString() : undefined,
    followUpRequired: d.followUpRequired,
  });

  const submitMeeting = (d: MeetingForm) => createCrm.mutate({
    clientId: selectedClient!.id, type: 'MEETING',
    title: d.title, meetingPlace: d.meetingPlace,
    participants: d.participants, notes: d.notes,
    occurredAt: d.occurredAt ? new Date(d.occurredAt).toISOString() : undefined,
    followUpRequired: d.followUpRequired,
  });

  const submitQuote = (d: QuoteForm) => createCrm.mutate({
    clientId: selectedClient!.id, type: 'QUOTE',
    quoteDescription: d.quoteDescription,
    quoteValue: d.quoteValue ? parseFloat(d.quoteValue) : undefined,
    notes: d.notes,
    assignedToUserId: d.assignedToUserId || undefined,
    quoteStatus: 'NEW',
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const goBack = useCallback(() => {
    if (step === 'type')      setStep('client');
    if (step === 'service')   { setStep('type'); setOrderType(null); }
    if (step === 'crm_type')  { setStep('type'); setOrderType(null); }
    if (['phone','email','meeting','quote'].includes(step)) { setStep('crm_type'); setCrmSub(null); }
  }, [step]);

  const clientName = selectedClient?.name ?? (defaultClient as Client | undefined)?.name ?? '';

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 gap-4">
        <CheckCircle2 className="h-14 w-14 text-green-500" />
        <p className="text-lg font-semibold text-gray-900">Zapisano pomyślnie!</p>
        <Button onClick={onClose}>Zamknij</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[90vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          {step !== 'client' && !defaultClientId && (
            <button onClick={goBack} className="text-gray-400 hover:text-gray-600">
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {step !== 'client' && step !== 'type' && (
            <button onClick={goBack} className="text-gray-400 hover:text-gray-600">
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div>
            <h2 className="text-base font-bold text-gray-900">Nowe zlecenie</h2>
            {clientName && <p className="text-xs text-gray-400">{clientName}</p>}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">

        {/* ── STEP 1: CLIENT ───────────────────────────────────────────────── */}
        {step === 'client' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700 mb-3">Wybierz klienta</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                autoFocus
                placeholder="Szukaj firmy lub NIP..."
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {filteredClients.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedClient(c); setStep('type'); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-brand-300 hover:bg-brand-50 transition-colors text-left"
                >
                  {c.logoUrl
                    ? <img src={c.logoUrl} alt={c.name} className="w-9 h-9 rounded-lg object-contain bg-gray-50 border border-gray-100 flex-shrink-0" />
                    : <div className="w-9 h-9 rounded-lg bg-brand-100 text-brand-700 font-bold text-sm flex items-center justify-center flex-shrink-0">{c.name.slice(0,2).toUpperCase()}</div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">{c.name}</div>
                    {c.city && <div className="text-xs text-gray-400">{c.city}</div>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                </button>
              ))}
              {filteredClients.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">Brak wyników</p>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 2: TYPE ─────────────────────────────────────────────────── */}
        {step === 'type' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700 mb-4">Co chcesz dodać?</p>
            <TypeCard
              icon={<Wrench className="h-7 w-7" />}
              title="Usługa serwisowa"
              subtitle="Zlecenie, interwencja, naprawa"
              color="blue"
              onClick={() => { setOrderType('SERVICE'); setStep('service'); }}
            />
            <TypeCard
              icon={<MessageSquare className="h-7 w-7" />}
              title="CRM"
              subtitle="Telefon, e-mail, spotkanie, oferta"
              color="green"
              onClick={() => { setOrderType('CRM'); setStep('crm_type'); }}
            />
          </div>
        )}

        {/* ── STEP 3a: SERVICE FORM ─────────────────────────────────────────── */}
        {step === 'service' && (
          <form onSubmit={svc.handleSubmit(d => createTicket.mutate(d))} className="space-y-4">
            <Select
              label="Lokalizacja *"
              placeholder="Wybierz lokalizację"
              options={locations.map(l => ({ value: l.id, label: `${l.name} — ${l.city ?? ''}` }))}
              {...svc.register('locationId')}
              error={svc.formState.errors.locationId?.message}
            />
            <Select
              label="Urządzenie (opcjonalnie)"
              placeholder="Brak / wybierz urządzenie"
              options={[{ value: '', label: '— brak urządzenia —' }, ...devices.map(d => ({ value: d.id, label: d.name }))]}
              {...svc.register('deviceId')}
            />
            <Select
              label="Pracownik (opcjonalnie)"
              placeholder="Nieprzypisany"
              options={[{ value: '', label: '— nieprzypisany —' }, ...workers.map(u => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))]}
              {...svc.register('assignedToUserId')}
            />
            <Input label="Tytuł *" {...svc.register('title')} error={svc.formState.errors.title?.message} />
            <Textarea label="Opis" rows={3} {...svc.register('description')} />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Priorytet"
                options={[
                  { value: 'LOW', label: 'Niski' },
                  { value: 'MEDIUM', label: 'Średni' },
                  { value: 'HIGH', label: 'Wysoki' },
                  { value: 'CRITICAL', label: 'Krytyczny' },
                ]}
                {...svc.register('priority')}
              />
              <Input label="Termin realizacji" type="datetime-local" {...svc.register('dueAt')} />
            </div>

            {/* billedInContract */}
            <label className={clsx(
              'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
              svc.watch('billedInContract') ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
            )}>
              <input type="checkbox" {...svc.register('billedInContract')} className="rounded border-gray-300 text-brand-600 w-4 h-4" />
              <div>
                <div className="text-sm font-medium text-gray-800">W ramach umowy</div>
                <div className="text-xs text-gray-400">
                  {selectedClient?.hasContract ? 'Klient ma umowę SLA' : 'Klient nie ma umowy — rozliczenie godzinowe'}
                </div>
              </div>
              {selectedClient?.hasContract && (
                <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">SLA</span>
              )}
            </label>

            <Button type="submit" loading={createTicket.isPending} className="w-full">
              Utwórz zlecenie
            </Button>
          </form>
        )}

        {/* ── STEP 3b: CRM TYPE ─────────────────────────────────────────────── */}
        {step === 'crm_type' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700 mb-4">Typ wpisu CRM</p>
            <TypeCard icon={<Phone className="h-6 w-6" />}    title="Telefon"   subtitle="Notatka z rozmowy telefonicznej" color="green"  onClick={() => { setCrmSub('PHONE');   setStep('phone'); }} />
            <TypeCard icon={<Mail className="h-6 w-6" />}     title="E-mail"   subtitle="Wiadomość e-mail"               color="blue"   onClick={() => { setCrmSub('EMAIL');   setStep('email'); }} />
            <TypeCard icon={<Calendar className="h-6 w-6" />} title="Spotkanie" subtitle="Spotkanie lub wizyta"           color="purple" onClick={() => { setCrmSub('MEETING'); setStep('meeting'); }} />
            <TypeCard icon={<FileText className="h-6 w-6" />} title="Oferta"   subtitle="Zapytanie i wycena"             color="orange" onClick={() => { setCrmSub('QUOTE');   setStep('quote'); }} />
          </div>
        )}

        {/* ── STEP: PHONE ───────────────────────────────────────────────────── */}
        {step === 'phone' && (
          <form onSubmit={phone.handleSubmit(submitPhone)} className="space-y-4">
            <Input label="Data i godzina" type="datetime-local" {...phone.register('occurredAt')} />
            <Input label="Osoba kontaktowa" placeholder="Imię i nazwisko..." {...phone.register('contactPerson')} />
            <Textarea label="Notatka z rozmowy *" rows={4} placeholder="O czym rozmawialiście..." {...phone.register('notes')} error={phone.formState.errors.notes?.message} />
            <Select
              label="Przypisz do pracownika"
              placeholder="— nieprzypisany —"
              options={[{ value: '', label: '— nieprzypisany —' }, ...workers.map(u => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))]}
              {...phone.register('assignedToUserId')}
            />
            <FollowUpToggle register={phone.register as (...args: unknown[]) => unknown} watch={phone.watch as (name: string) => unknown} />
            <Button type="submit" loading={createCrm.isPending} className="w-full">Zapisz rozmowę</Button>
          </form>
        )}

        {/* ── STEP: EMAIL ───────────────────────────────────────────────────── */}
        {step === 'email' && (
          <form onSubmit={email.handleSubmit(submitEmail)} className="space-y-4">
            <Input label="Temat *" {...email.register('subject')} error={email.formState.errors.subject?.message} />
            <Input label="Data i godzina" type="datetime-local" {...email.register('occurredAt')} />
            <Textarea label="Treść / notatka" rows={4} {...email.register('notes')} />
            <FollowUpToggle register={email.register as (...args: unknown[]) => unknown} watch={email.watch as (name: string) => unknown} />
            <Button type="submit" loading={createCrm.isPending} className="w-full">Zapisz e-mail</Button>
          </form>
        )}

        {/* ── STEP: MEETING ─────────────────────────────────────────────────── */}
        {step === 'meeting' && (
          <form onSubmit={meeting.handleSubmit(submitMeeting)} className="space-y-4">
            <Input label="Tytuł spotkania" placeholder="np. Przegląd umowy..." {...meeting.register('title')} />
            <Input label="Data i godzina" type="datetime-local" {...meeting.register('occurredAt')} />
            <Input label="Miejsce" placeholder="Adres lub link..." {...meeting.register('meetingPlace')} />
            <Input label="Uczestnicy" placeholder="np. Jan Kowalski, Anna Nowak" {...meeting.register('participants')} />
            <Textarea label="Opis / notatki" rows={3} {...meeting.register('notes')} />
            <FollowUpToggle register={meeting.register as (...args: unknown[]) => unknown} watch={meeting.watch as (name: string) => unknown} />
            <Button type="submit" loading={createCrm.isPending} className="w-full">Zapisz spotkanie</Button>
          </form>
        )}

        {/* ── STEP: QUOTE ───────────────────────────────────────────────────── */}
        {step === 'quote' && (
          <form onSubmit={quote.handleSubmit(submitQuote)} className="space-y-4">
            <div className="p-3 bg-orange-50 border border-orange-100 rounded-xl flex items-center gap-2 text-xs text-orange-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              Nowe zapytanie zostanie utworzone ze statusem <strong>Nowe</strong>.
            </div>
            <Textarea
              label="Opis zapytania *"
              rows={4}
              placeholder="np. 7 monitorów 27&quot; + montaż na ścianie..."
              {...quote.register('quoteDescription')}
              error={quote.formState.errors.quoteDescription?.message}
            />
            <Input label="Wstępna wartość wyceny (zł)" type="number" step="0.01" placeholder="0.00" {...quote.register('quoteValue')} />
            <Textarea label="Notatki" rows={2} {...quote.register('notes')} />
            <Select
              label="Przypisz do pracownika"
              placeholder="— nieprzypisany —"
              options={[{ value: '', label: '— nieprzypisany —' }, ...workers.map(u => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))]}
              {...quote.register('assignedToUserId')}
            />
            <Button type="submit" loading={createCrm.isPending} className="w-full">Utwórz zapytanie ofertowe</Button>
          </form>
        )}

      </div>
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function TypeCard({ icon, title, subtitle, color, onClick }: {
  icon: React.ReactNode; title: string; subtitle: string;
  color: 'blue' | 'green' | 'purple' | 'orange'; onClick: () => void;
}) {
  const colors = {
    blue:   'bg-blue-50   border-blue-100   hover:border-blue-400   text-blue-600',
    green:  'bg-green-50  border-green-100  hover:border-green-400  text-green-600',
    purple: 'bg-violet-50 border-violet-100 hover:border-violet-400 text-violet-600',
    orange: 'bg-orange-50 border-orange-100 hover:border-orange-400 text-orange-500',
  };
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-colors text-left',
        colors[color]
      )}
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1">
        <div className="font-semibold text-gray-900">{title}</div>
        <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
    </button>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FollowUpToggle({ register, watch }: { register: (...args: any[]) => any; watch: (name: string) => unknown }) {
  const value = watch('followUpRequired');
  return (
    <label className={clsx(
      'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
      value ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
    )}>
      <input type="checkbox" {...register('followUpRequired')} className="rounded border-gray-300 text-amber-500 w-4 h-4" />
      <div>
        <div className="text-sm font-medium text-gray-800">Wymaga dalszego działania</div>
        <div className="text-xs text-gray-400">Zostanie oznaczone do śledzenia</div>
      </div>
    </label>
  );
}

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
