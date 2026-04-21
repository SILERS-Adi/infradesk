import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

const STEPS = ['Czego dotyczy?', 'Opis', 'Priorytet'] as const;

const CATEGORIES = [
  { value: 'hardware', label: 'Sprzęt', hint: 'drukarki, komputery, routery' },
  { value: 'software', label: 'Oprogramowanie', hint: 'aplikacje, systemy, licencje' },
  { value: 'network', label: 'Sieć', hint: 'internet, WiFi, VPN' },
  { value: 'email', label: 'Poczta', hint: 'Outlook, spam, konta' },
  { value: 'access', label: 'Dostęp', hint: 'hasła, uprawnienia, konta' },
  { value: 'other', label: 'Inne', hint: 'coś innego' },
];

const PRIORITIES = [
  { value: 'LOW', label: 'Niski', hint: 'mogę poczekać kilka dni' },
  { value: 'MEDIUM', label: 'Średni', hint: 'do jutra' },
  { value: 'HIGH', label: 'Wysoki', hint: 'pilne, dziś' },
  { value: 'CRITICAL', label: 'Krytyczny', hint: 'blokuje pracę teraz' },
];

export function CreateTicketWizard() {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');

  const mutation = useMutation({
    mutationFn: async () => (await api.post('/tickets', { title, description, priority, category, source: 'MANUAL' })).data,
    onSuccess: () => { toast.success('Utworzono'); qc.invalidateQueries({ queryKey: ['tickets'] }); },
  });

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex-1 flex items-center gap-2">
            <div
              className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold',
                i < step && 'bg-success text-white',
                i === step && 'bg-pri text-white',
                i > step && 'bg-sf2 text-tx3',
              )}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn('text-xs', i === step ? 'text-tx font-medium' : 'text-tx3')}>{label}</span>
            {i < STEPS.length - 1 && <div className={cn('flex-1 h-px', i < step ? 'bg-success' : 'bg-border')} />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => { setCategory(c.value); setStep(1); }}
              className={cn(
                'text-left p-3 rounded-[var(--rs)] border transition-colors',
                category === c.value ? 'border-[var(--bd-f)] bg-[var(--pri-l)]' : 'border-bd hover:bg-sf2',
              )}
            >
              <div className="text-sm font-medium text-tx">{c.label}</div>
              <div className="text-xs text-tx3 mt-0.5">{c.hint}</div>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="text-xs text-tx3 mb-1.5 block">Tytuł (krótko)</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. Drukarka w księgowości nie drukuje" />
          </div>
          <div>
            <label className="text-xs text-tx3 mb-1.5 block">Opis (szczegóły)</label>
            <textarea
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kiedy się zaczęło? Co już próbowałeś? Komunikaty błędów?"
              className="w-full rounded-[var(--rs)] border border-bd bg-sf2 px-3 py-2 text-sm text-tx placeholder:text-tx3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pri"
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value as typeof priority)}
              className={cn(
                'w-full text-left p-3 rounded-[var(--rs)] border transition-colors',
                priority === p.value ? 'border-[var(--bd-f)] bg-[var(--pri-l)]' : 'border-bd hover:bg-sf2',
              )}
            >
              <div className="text-sm font-medium text-tx">{p.label}</div>
              <div className="text-xs text-tx3 mt-0.5">{p.hint}</div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-bd">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4" /> Wstecz
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={step === 1 && (title.length < 3 || description.length < 1)}>
            Dalej <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Utwórz zgłoszenie
          </Button>
        )}
      </div>
    </div>
  );
}
