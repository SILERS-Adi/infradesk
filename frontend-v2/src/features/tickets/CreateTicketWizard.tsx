import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

type TicketType = 'INCIDENT' | 'REQUEST' | 'MAINTENANCE' | 'INSTALLATION' | 'COMPLAINT' | 'OTHER';

const TYPE_OPTIONS: { value: TicketType; label: string; desc: string }[] = [
  { value: 'INCIDENT', label: 'Naprawa / incydent', desc: 'coś nie działa, awaria, błąd' },
  { value: 'REQUEST', label: 'Prośba / zamówienie', desc: 'oferta, wycena, zakup sprzętu' },
  { value: 'MAINTENANCE', label: 'Konserwacja', desc: 'przegląd, aktualizacja, backup' },
  { value: 'INSTALLATION', label: 'Instalacja / wdrożenie', desc: 'nowy sprzęt, konfiguracja' },
  { value: 'COMPLAINT', label: 'Reklamacja', desc: 'zgłoszenie reklamacyjne' },
  { value: 'OTHER', label: 'Inne', desc: '' },
];

const CATEGORIES_BY_TYPE: Record<TicketType, string[]> = {
  INCIDENT:     ['Sprzęt', 'Oprogramowanie', 'Sieć', 'Poczta', 'Dostęp', 'Serwer', 'Drukarka', 'Inne'],
  REQUEST:      ['Oferta', 'Wycena', 'Zamówienie sprzętu', 'Zamówienie licencji', 'Konsultacja', 'Szkolenie', 'Inne'],
  MAINTENANCE:  ['Przegląd', 'Aktualizacja', 'Backup', 'Optymalizacja', 'Czyszczenie', 'Inne'],
  INSTALLATION: ['Nowy sprzęt', 'Nowe oprogramowanie', 'Konfiguracja sieci', 'Migracja', 'Inne'],
  COMPLAINT:    ['Jakość usługi', 'Błędna wycena', 'Sprzęt uszkodzony', 'Inne'],
  OTHER:        ['Inne'],
};

const PRIORITIES = [
  { value: 'LOW', label: 'Niski', hint: 'mogę poczekać' },
  { value: 'MEDIUM', label: 'Średni', hint: 'do jutra' },
  { value: 'HIGH', label: 'Wysoki', hint: 'pilne, dziś' },
  { value: 'CRITICAL', label: 'Krytyczny', hint: 'blokuje pracę teraz' },
] as const;

const STEPS = ['Typ', 'Kategoria', 'Gdzie?', 'Opis', 'Priorytet', 'Kto zgłasza?'] as const;

interface DeviceOpt { id: string; name: string; hostname: string | null; location?: { id: string; name: string } | null }
interface LocationOpt { id: string; name: string; city: string | null }

export function CreateTicketWizard() {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [type, setType] = useState<TicketType | ''>('');
  const [category, setCategory] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [requesterPhone, setRequesterPhone] = useState('');

  const devicesQ = useQuery<{ devices: DeviceOpt[] }>({
    queryKey: ['devices', 'list'],
    queryFn: async () => (await api.get('/devices')).data,
    staleTime: 60_000,
  });
  const locationsQ = useQuery<{ locations: LocationOpt[] }>({
    queryKey: ['locations', 'list'],
    queryFn: async () => (await api.get('/locations')).data,
    staleTime: 60_000,
  });

  const categories = useMemo(() => (type ? CATEGORIES_BY_TYPE[type] : []), [type]);
  const devices = devicesQ.data?.devices ?? [];
  const locations = locationsQ.data?.locations ?? [];
  const pickedDevice = devices.find((d) => d.id === deviceId);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        type: type || 'INCIDENT',
        title,
        description,
        priority,
        source: 'MANUAL',
      };
      if (category) payload.category = category;
      if (deviceId) payload.deviceId = deviceId;
      if (locationId) payload.locationId = locationId;
      else if (pickedDevice?.location?.id) payload.locationId = pickedDevice.location.id;
      if (requesterName) payload.requesterName = requesterName;
      if (requesterEmail) payload.requesterEmail = requesterEmail;
      if (requesterPhone) payload.requesterPhone = requesterPhone;
      return (await api.post('/tickets', payload)).data;
    },
    onSuccess: () => {
      toast.success('Utworzono zgłoszenie');
      qc.invalidateQueries({ queryKey: ['tickets'] });
      setStep(0);
      setType(''); setCategory(''); setDeviceId(''); setLocationId('');
      setTitle(''); setDescription(''); setPriority('MEDIUM');
      setRequesterName(''); setRequesterEmail(''); setRequesterPhone('');
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? 'Błąd');
    },
  });

  const canNext = (() => {
    if (step === 0) return !!type;
    if (step === 1) return true; // kategoria opcjonalna
    if (step === 2) return true; // urządzenie/lokalizacja opcjonalne
    if (step === 3) return title.length >= 3 && description.length > 0;
    if (step === 4) return true;
    if (step === 5) return true;
    return false;
  })();

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-1 shrink-0">
            <div
              className={cn(
                'h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0',
                i < step && 'bg-ok text-white',
                i === step && 'bg-pri text-white',
                i > step && 'bg-sf2 text-tx3 border border-bd',
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span className={cn('text-[10px] whitespace-nowrap', i === step ? 'text-tx font-medium' : 'text-tx3')}>{label}</span>
            {i < STEPS.length - 1 && <div className={cn('w-4 h-px shrink-0', i < step ? 'bg-ok' : 'bg-bd')} />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div>
          <p className="text-[12px] text-tx3 mb-3">Czego dotyczy to zgłoszenie?</p>
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => { setType(t.value); setCategory(''); setStep(1); }}
                className="text-left p-3 rounded-[var(--r-s)] border transition-colors"
                style={{
                  borderColor: type === t.value ? 'var(--pri)' : 'var(--bd)',
                  background: type === t.value ? 'var(--pri-l)' : 'transparent',
                }}
              >
                <div className="text-[13px] font-semibold text-tx">{t.label}</div>
                {t.desc && <div className="text-[11px] text-tx3 mt-0.5">{t.desc}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <p className="text-[12px] text-tx3 mb-3">Wybierz kategorię (opcjonalne)</p>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(category === c ? '' : c)}
                className="px-3 py-1.5 rounded-full text-[12px] border transition-colors"
                style={{
                  borderColor: category === c ? 'var(--pri)' : 'var(--bd)',
                  background: category === c ? 'var(--pri-l)' : 'var(--sf2)',
                  color: category === c ? 'var(--pri)' : 'var(--tx2)',
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-[12px] text-tx3">Którego urządzenia dotyczy? (opcjonalne)</p>
          <div>
            <label className="text-[11px] font-semibold text-tx3 block mb-1">Urządzenie</label>
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px] text-tx"
            >
              <option value="">— brak / nie dotyczy —</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name}{d.hostname ? ` (${d.hostname})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-tx3 block mb-1">
              Lokalizacja {pickedDevice?.location && <span className="text-tx3">(auto: {pickedDevice.location.name})</span>}
            </label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="h-10 w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 text-[13px] text-tx"
            >
              <option value="">— automatycznie —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}{l.city ? `, ${l.city}` : ''}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-tx3 block mb-1">Tytuł *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. Drukarka w księgowości nie drukuje" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-tx3 block mb-1">Opis *</label>
            <textarea
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kiedy się zaczęło? Co już próbowaliście? Komunikaty błędów?"
              className="w-full rounded-[var(--r-s)] border border-bd bg-sf2 px-3 py-2 text-[13px] text-tx placeholder:text-tx3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pri"
            />
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <p className="text-[12px] text-tx3 mb-3">Jaki priorytet?</p>
          <div className="space-y-2">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPriority(p.value)}
                className="w-full text-left p-3 rounded-[var(--r-s)] border transition-colors"
                style={{
                  borderColor: priority === p.value ? 'var(--pri)' : 'var(--bd)',
                  background: priority === p.value ? 'var(--pri-l)' : 'transparent',
                }}
              >
                <div className="text-[13px] font-medium text-tx">{p.label}</div>
                <div className="text-[11px] text-tx3 mt-0.5">{p.hint}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <p className="text-[12px] text-tx3">Kto jest osobą kontaktową? (opcjonalne — wypełnij jeśli zgłaszający nie ma konta)</p>
          <div>
            <label className="text-[11px] font-semibold text-tx3 block mb-1">Imię i nazwisko</label>
            <Input value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="Anna Kowalska" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Email</label>
              <Input type="email" value={requesterEmail} onChange={(e) => setRequesterEmail(e.target.value)} placeholder="anna@klient.pl" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-tx3 block mb-1">Telefon</label>
              <Input value={requesterPhone} onChange={(e) => setRequesterPhone(e.target.value)} placeholder="501 234 567" />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-bd">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4" /> Wstecz
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Dalej <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !title || !description}>
            {mutation.isPending ? 'Tworzenie…' : 'Utwórz zgłoszenie'}
          </Button>
        )}
      </div>
    </div>
  );
}
