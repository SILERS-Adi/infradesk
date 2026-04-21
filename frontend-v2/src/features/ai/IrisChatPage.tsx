import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Sparkles, Send, User as UserIcon, Loader2, Trash2, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  costPln?: number;
  tokens?: number;
}

const MODELS = [
  { key: 'claude-haiku-4-5-20251001', label: 'Haiku (szybki)', color: 'var(--ok)' },
  { key: 'claude-sonnet-4-6', label: 'Sonnet (balans)', color: 'var(--pri)' },
  { key: 'claude-opus-4-7', label: 'Opus (maksimum)', color: 'var(--wn)' },
] as const;

const SUGGESTIONS = [
  'Podsumuj ticket z ostatniego tygodnia dla serwera w Silers',
  'Jak zdiagnozować powolny RDP na Windows Server 2019?',
  'Napisz polską odpowiedź do klienta o konieczności wymiany dysku',
  'Jakie są typowe przyczyny failed backup MSSQL?',
];

export function IrisChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<(typeof MODELS)[number]['key']>('claude-sonnet-4-6');
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMut = useMutation({
    mutationFn: async (userMsg: string) => {
      const newMessages: Message[] = [...messages, { role: 'user' as const, content: userMsg }];
      setMessages(newMessages);
      setInput('');
      const res = await api.post<{ text: string; inputTokens: number; outputTokens: number; costPln: number; model: string }>(
        '/ai/chat',
        {
          model,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        },
      );
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant' as const,
          content: res.data.text,
          costPln: res.data.costPln,
          tokens: res.data.inputTokens + res.data.outputTokens,
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
          <Sparkles size={18} className="text-[var(--pri)]" />
          <h1 className="text-[18px] font-semibold leading-tight">Iris — AI Copilot</h1>
          <Badge variant="info">v1</Badge>
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
              <Sparkles size={48} className="opacity-30 mb-3" />
              <div className="text-[15px] font-medium text-[var(--tx2)] mb-2">Cześć, jestem Iris</div>
              <div className="text-[13px] mb-[var(--sp-4)] max-w-[400px]">
                Pomogę Ci z ticketami, diagnostyką urządzeń, pisaniem odpowiedzi do klientów i szukaniem rozwiązań.
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
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[var(--pri-l)]">
                <Loader2 size={14} className="animate-spin text-[var(--pri)]" />
              </div>
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
      <div className={`max-w-[75%] ${isUser ? 'text-right' : ''}`}>
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
        {m.costPln !== undefined && (
          <div className="text-[10px] text-[var(--tx3)] mt-1">
            {m.tokens} tokenów · {m.costPln.toFixed(4)} PLN
          </div>
        )}
      </div>
    </div>
  );
}
