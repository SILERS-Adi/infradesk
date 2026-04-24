import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Sparkles, Send, User as UserIcon, Trash2, Zap, Wrench, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { IrisCore } from '@/components/iris/IrisCore';

interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  costPln?: number;
  tokens?: number;
  toolCalls?: ToolCall[];
}

interface ChatResponse {
  message: { role: 'assistant'; content: string };
  toolCalls: ToolCall[];
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number; costPln: number; model: string };
}

const MODELS = [
  { key: 'claude-haiku-4-5-20251001', label: 'Haiku (szybki)' },
  { key: 'claude-sonnet-4-6', label: 'Sonnet (balans)' },
  { key: 'claude-opus-4-7', label: 'Opus (maksimum)' },
] as const;

const SUGGESTIONS = [
  'Pokaż moje ostatnie 3 zgłoszenia',
  'Sprawdź status T-2026-0001',
  'Mam problem z drukarką HP — nie drukuje',
  'Poproś o oddzwonienie w sprawie wymiany dysku',
];

const TOOL_LABELS: Record<string, string> = {
  utworz_zgloszenie: 'Utworz zgłoszenie',
  sprawdz_status: 'Sprawdź status',
  lista_moich_zgloszen: 'Lista zgłoszeń',
  zglos_problem_z_urzadzeniem: 'Zgłoś problem z urządzeniem',
  popros_o_oddzwonienie: 'Prośba o oddzwonienie',
  dodaj_komentarz_do_zgloszenia: 'Dodaj komentarz',
  anuluj_zgloszenie: 'Anuluj zgłoszenie',
  ocen_zakonczone: 'Oceń zakończone',
};

export function IrisChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<(typeof MODELS)[number]['key']>('claude-sonnet-4-6');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const sendMut = useMutation({
    mutationFn: async (userMsg: string) => {
      const newMessages: Message[] = [...messages, { role: 'user' as const, content: userMsg }];
      setMessages(newMessages);
      setInput('');
      const res = await api.post<ChatResponse>('/iris/chat', {
        model,
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant' as const,
          content: res.data.message.content,
          costPln: res.data.usage.costPln,
          tokens: res.data.usage.inputTokens + res.data.usage.outputTokens,
          toolCalls: res.data.toolCalls,
        },
      ]);
      return res.data;
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd';
      toast.error(msg);
      setMessages((prev) => prev.slice(0, -1));
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sendMut.isPending]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q && q.trim() && messages.length === 0 && !sendMut.isPending) {
      sendMut.mutate(q.trim());
      searchParams.delete('q');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function send() {
    const trimmed = input.trim();
    if (!trimmed || sendMut.isPending) return;
    sendMut.mutate(trimmed);
  }

  const totalCost = messages.reduce((s, m) => s + (m.costPln ?? 0), 0);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-[900px] mx-auto">
      <div className="flex items-center justify-between gap-[var(--sp-3)] mb-[var(--sp-3)]">
        <div className="flex items-center gap-2">
          <IrisCore size="sm" state={sendMut.isPending ? 'thinking' : 'idle'} ariaLabel="Iris" />
          <h1 className="text-[18px] font-semibold leading-tight">Iris — AI Copilot</h1>
          <Badge variant="info">v2 tools</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={model} onChange={(e) => setModel(e.target.value as typeof model)} className="w-[180px]">
            {MODELS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </Select>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setMessages([])} className="gap-1.5">
              <Trash2 size={12} /> Nowa
            </Button>
          )}
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-[var(--sp-4)] space-y-[var(--sp-4)]">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-[var(--tx3)]">
              <div className="mb-4"><IrisCore size="lg" state="idle" ariaLabel="Iris" /></div>
              <div className="text-[15px] font-medium text-[var(--tx2)] mb-2">Cześć, jestem Iris</div>
              <div className="text-[13px] mb-[var(--sp-4)] max-w-[400px]">
                Pomogę Ci zgłosić problem, sprawdzić status zgłoszenia, anulować lub ocenić zakończone.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-[600px]">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s)}
                    className="text-left p-3 rounded-[var(--r-s)] border border-[var(--bd)] hover:bg-[var(--sf-h)] transition-colors text-[12px] text-[var(--tx2)]"
                  >
                    <Zap size={11} className="inline mr-1.5 text-[var(--pri)]" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => <MessageBubble key={i} m={m} />)
          )}
          {sendMut.isPending && (
            <div className="flex items-start gap-3">
              <div className="shrink-0"><IrisCore size="sm" state="thinking" ariaLabel="Iris" /></div>
              <div className="flex-1 pt-1 text-[13px] text-[var(--tx3)]">Iris myśli…</div>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--bd)] p-[var(--sp-3)] bg-[var(--sf-h)]">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Napisz wiadomość… (Shift+Enter nowa linia)"
              className="flex-1 resize-none min-h-[40px] max-h-[200px] bg-[var(--sf)] border border-[var(--bd)] rounded-[var(--r-s)] px-3 py-2 text-[13px] outline-none focus:border-[var(--pri)]"
              disabled={sendMut.isPending}
            />
            <Button onClick={send} disabled={sendMut.isPending || !input.trim()} className="gap-1.5">
              <Send size={14} /> Wyślij
            </Button>
          </div>
          {totalCost > 0 && (
            <div className="text-[10px] text-[var(--tx3)] mt-2 text-right">
              Sesja: {totalCost.toFixed(4)} PLN · model: {MODELS.find((m) => m.key === model)?.label}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function MessageBubble({ m }: { m: Message }) {
  const isUser = m.role === 'user';
  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: isUser ? 'var(--sf-h)' : 'var(--pri-l)',
          color: isUser ? 'var(--tx2)' : 'var(--pri)',
        }}
      >
        {isUser ? <UserIcon size={14} /> : <Sparkles size={14} />}
      </div>
      <div className={`max-w-[78%] ${isUser ? 'text-right' : ''}`}>
        {m.toolCalls && m.toolCalls.length > 0 && (
          <div className="flex flex-col gap-2 mb-2 text-left">
            {m.toolCalls.map((tc, idx) => <ToolCallCard key={idx} tc={tc} />)}
          </div>
        )}
        {m.content && (
          <div
            className="inline-block text-left rounded-[var(--r-s)] px-3 py-2 text-[13px] whitespace-pre-wrap"
            style={{
              background: isUser ? 'var(--pri-l)' : 'var(--sf-h)',
              color: 'var(--tx)',
              border: '1px solid var(--bd)',
            }}
          >
            {m.content}
          </div>
        )}
        {m.costPln !== undefined && (
          <div className="text-[10px] text-[var(--tx3)] mt-1">
            {m.tokens} tokenów · {m.costPln.toFixed(4)} PLN
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallCard({ tc }: { tc: ToolCall }) {
  const label = TOOL_LABELS[tc.tool] ?? tc.tool;
  const isError = typeof tc.result?.error !== 'undefined';
  const color = isError ? 'var(--er)' : 'var(--ok)';
  const bg = isError ? 'color-mix(in oklab, var(--er) 12%, var(--sf))' : 'color-mix(in oklab, var(--ok) 12%, var(--sf))';
  const url = typeof tc.result?.url === 'string' ? tc.result.url as string : null;

  return (
    <div
      className="rounded-[var(--r-s)] border p-3 text-[12px]"
      style={{ background: bg, borderColor: color }}
    >
      <div className="flex items-center gap-2 mb-1">
        {isError ? <AlertTriangle size={13} style={{ color }} /> : <CheckCircle2 size={13} style={{ color }} />}
        <Wrench size={11} className="text-[var(--tx3)]" />
        <span className="font-medium" style={{ color: 'var(--tx)' }}>{label}</span>
        <span className="text-[var(--tx3)]">·</span>
        <span className="text-[var(--tx3)] text-[11px]">{isError ? 'błąd' : 'ok'}</span>
      </div>
      <ToolResultBody tc={tc} />
      {url && (
        <a
          href={url}
          className="inline-flex items-center gap-1 mt-2 text-[11px] text-[var(--pri)] hover:underline"
          target="_self"
        >
          <ExternalLink size={10} /> Otwórz
        </a>
      )}
    </div>
  );
}

function ToolResultBody({ tc }: { tc: ToolCall }) {
  const r = tc.result ?? {};
  if (typeof r.error !== 'undefined') {
    return <div className="text-[var(--tx2)]">{String(r.message ?? r.error)}</div>;
  }
  switch (tc.tool) {
    case 'utworz_zgloszenie':
    case 'zglos_problem_z_urzadzeniem': {
      const n = r.ticketNumber as string | undefined;
      const dev = r.deviceName as string | undefined;
      return (
        <div className="text-[var(--tx2)]">
          Utworzono zgłoszenie <span className="font-mono font-semibold">{n}</span>
          {dev ? ` (urządzenie: ${dev})` : ''}.
        </div>
      );
    }
    case 'sprawdz_status': {
      const n = r.ticketNumber as string | undefined;
      const st = r.status as string | undefined;
      const a = r.assignedTo as string | null | undefined;
      return (
        <div className="text-[var(--tx2)]">
          <div><span className="font-mono font-semibold">{n}</span> — {r.title as string}</div>
          <div>Status: <span className="font-medium">{st}</span> · priorytet: {r.priority as string} {a ? `· przypisane: ${a}` : ''}</div>
        </div>
      );
    }
    case 'lista_moich_zgloszen': {
      const tks = (r.tickets as Array<{ number: string; title: string; status: string; priority: string }>) ?? [];
      if (tks.length === 0) return <div className="text-[var(--tx3)]">Brak zgłoszeń.</div>;
      return (
        <div className="flex flex-col gap-1">
          {tks.map((t) => (
            <div key={t.number} className="flex items-center gap-2 text-[var(--tx2)]">
              <span className="font-mono text-[11px] font-semibold">{t.number}</span>
              <span className="truncate flex-1">{t.title}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--sf)', border: '1px solid var(--bd)' }}>{t.status}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'popros_o_oddzwonienie': {
      return <div className="text-[var(--tx2)]">{(r.message as string) ?? 'Prośba zarejestrowana.'}</div>;
    }
    case 'dodaj_komentarz_do_zgloszenia':
      return <div className="text-[var(--tx2)]">Komentarz dodany do <span className="font-mono font-semibold">{r.ticketNumber as string}</span>.</div>;
    case 'anuluj_zgloszenie':
      return <div className="text-[var(--tx2)]">Zgłoszenie <span className="font-mono font-semibold">{r.ticketNumber as string}</span> anulowane.</div>;
    case 'ocen_zakonczone':
      return <div className="text-[var(--tx2)]">Oceniono zgłoszenie <span className="font-mono font-semibold">{r.ticketNumber as string}</span>.</div>;
    default:
      return <div className="text-[var(--tx3)] font-mono text-[11px]">{JSON.stringify(r)}</div>;
  }
}
