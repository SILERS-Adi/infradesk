import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface Draft {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: string | null;
}

export function CreateTicketFromAi() {
  const qc = useQueryClient();
  const [source, setSource] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [parsing, setParsing] = useState(false);

  // Placeholder local parser — when backend AI endpoint is wired this becomes api.post('/ai/draft-ticket', {source}).
  const parseLocal = async () => {
    setParsing(true);
    await new Promise((r) => setTimeout(r, 500));
    const firstLine = source.split('\n').find((l) => l.trim().length > 0) ?? 'Zgłoszenie z AI';
    const text = source.slice(0, 2000);
    const priority: Draft['priority'] =
      /pilne|krytyczn|blokuj|down|nie działa wcale/i.test(text) ? 'HIGH' :
      /niewielk|kosmetyczn/i.test(text) ? 'LOW' : 'MEDIUM';
    const category =
      /drukark|router|switch|kompu|serwer/i.test(text) ? 'hardware' :
      /outlook|poczt|mail/i.test(text) ? 'email' :
      /vpn|sieć|wifi|internet/i.test(text) ? 'network' :
      /aplikacj|program|softw/i.test(text) ? 'software' : null;
    setDraft({ title: firstLine.slice(0, 120), description: text, priority, category });
    setParsing(false);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!draft) return null;
      return (await api.post('/tickets', { ...draft, source: 'AI_CHAT' })).data;
    },
    onSuccess: () => { toast.success('Zgłoszenie utworzone'); qc.invalidateQueries({ queryKey: ['tickets'] }); },
  });

  if (!draft) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-[var(--rs)] bg-[var(--pri-l)] border border-[var(--bd-f)]">
          <Sparkles className="h-4 w-4 text-pri mt-0.5 shrink-0" />
          <p className="text-xs text-tx">Wklej email od klienta, zrzut ekranu komunikatu błędu, notatkę głosową lub po prostu opisz czego potrzebujesz. Iris rozpozna kategorię, priorytet i stworzy draft.</p>
        </div>
        <textarea
          rows={10}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={"np. „Anna Kowalska: Nie działa mi Outlook od rana. Hasło jest prawdopodobnie ok, bo komórkowy działa. Potrzebuję do końca dnia."}
          className="w-full rounded-[var(--rs)] border border-bd bg-sf2 px-3 py-2 text-sm text-tx placeholder:text-tx3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pri"
        />
        <div className="flex justify-end">
          <Button onClick={parseLocal} disabled={source.trim().length < 10 || parsing}>
            <Wand2 className="h-4 w-4" /> {parsing ? 'Analizuję…' : 'Utwórz draft z AI'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-[var(--rs)] bg-success/10 border border-success/30">
        <Sparkles className="h-4 w-4 text-ok mt-0.5 shrink-0" />
        <p className="text-xs text-tx">Iris stworzyła draft. Sprawdź, popraw jeśli potrzeba i zatwierdź.</p>
      </div>
      <div>
        <label className="text-xs text-tx3 mb-1.5 block">Tytuł</label>
        <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      </div>
      <div>
        <label className="text-xs text-tx3 mb-1.5 block">Opis</label>
        <textarea
          rows={6}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          className="w-full rounded-[var(--rs)] border border-bd bg-sf2 px-3 py-2 text-sm text-tx focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pri"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-tx3 mb-1.5 block">Priorytet</label>
          <select
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: e.target.value as Draft['priority'] })}
            className="h-10 w-full rounded-[var(--rs)] border border-bd bg-sf2 px-3 text-sm text-tx"
          >
            <option value="LOW">Niski</option>
            <option value="MEDIUM">Średni</option>
            <option value="HIGH">Wysoki</option>
            <option value="CRITICAL">Krytyczny</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-tx3 mb-1.5 block">Kategoria</label>
          <Input value={draft.category ?? ''} onChange={(e) => setDraft({ ...draft, category: e.target.value || null })} />
        </div>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-bd">
        <Button variant="ghost" onClick={() => setDraft(null)}>Wróć</Button>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          Utwórz zgłoszenie
        </Button>
      </div>
    </div>
  );
}
