/**
 * PanelIdoPage — migrated to primitives (IdoAvatar, AIBubble, TypingIndicator).
 */

import React from 'react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Send, Loader2, RefreshCw, HardDrive, Printer, Lock, Wifi } from 'lucide-react';
import { Card, Button, IdoAvatar, AIBubble, TypingIndicator, Badge } from '../../ui/primitives';

interface Msg { id: string; role: 'user' | 'assistant'; text: string; time: string; duration?: number }

const SUGGESTIONS = [
  { icon: <HardDrive size={14} />, label: 'Miejsce na dysku', prompt: 'Sprawdź ile mam wolnego miejsca na dysku i co mogę zwolnić' },
  { icon: <RefreshCw size={14} />, label: 'Aktualizacje',     prompt: 'Jakie mam zaległe aktualizacje Windows?' },
  { icon: <Printer size={14} />,   label: 'Drukarka',         prompt: 'Moja drukarka nie drukuje, pomóż' },
  { icon: <Lock size={14} />,      label: 'Nowe hasło',       prompt: 'Wygeneruj mi silne hasło do nowego konta' },
  { icon: <Wifi size={14} />,      label: 'Internet',         prompt: 'Internet działa wolno, co mogę zrobić?' },
];

export default function PanelIdoPage() {
  const [messages, setMessages] = React.useState<Msg[]>([
    { id: 'welcome', role: 'assistant', text: 'Cześć! Jestem IDO — Twój asystent IT. W czym mogę pomóc?', time: new Date().toISOString() },
  ]);
  const [input, setInput] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setInput('');
    setMessages(p => [...p, { id: `u-${Date.now()}`, role: 'user', text: msg, time: new Date().toISOString() }]);
    setSending(true);
    try {
      const { data } = await apiClient.post<{ response: string; durationMs: number }>('/panel/ido/chat', { message: msg });
      setMessages(p => [...p, { id: `a-${Date.now()}`, role: 'assistant', text: data.response || '(IDO nie zwróciła odpowiedzi)', time: new Date().toISOString(), duration: data.durationMs }]);
    } catch (e: any) {
      const err = e?.response?.data?.detail || e?.response?.data?.error || e?.message || 'Błąd połączenia';
      toast.error(`IDO offline: ${err}`);
      setMessages(p => [...p, { id: `e-${Date.now()}`, role: 'assistant', text: `⚠ Nie udało się połączyć z IDO (${err}). Spróbuj za chwilę lub otwórz zgłoszenie ręcznie.`, time: new Date().toISOString() }]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', minHeight: 600, padding: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 28px', borderBottom: 'var(--ip-border)' }}>
        <IdoAvatar size="md" />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ip-text)', letterSpacing: '-0.01em' }}>IDO</div>
          <div style={{ fontSize: 12, color: 'var(--ip-text-3)', marginTop: 2 }}>ID Opiekun · asystent AI SILERS</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Badge tone="ok" live>Online</Badge>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.map(m => (
          <div key={m.id} style={{
            display: 'flex', gap: 12, maxWidth: '85%',
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
          }}>
            {m.role === 'assistant'
              ? <IdoAvatar size="sm" />
              : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #22D3EE, #0891B2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: 'var(--ip-font-mono)' }}>TY</div>
            }
            <div>
              <AIBubble role={m.role === 'user' ? 'user' : 'ai'}>{m.text}</AIBubble>
              <div style={{ fontSize: 10, color: 'var(--ip-text-3)', marginTop: 4, padding: '0 4px', fontFamily: 'var(--ip-font-mono)' }}>
                {new Date(m.time).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                {m.duration && ` · ${(m.duration / 1000).toFixed(1)}s`}
              </div>
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display: 'flex', gap: 12, alignSelf: 'flex-start' }}>
            <IdoAvatar size="sm" />
            <TypingIndicator />
          </div>
        )}
      </div>

      {/* Suggestions (on welcome screen) */}
      {messages.length === 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 28px 14px' }}>
          {SUGGESTIONS.map(s => (
            <button
              key={s.label}
              onClick={() => send(s.prompt)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 9999,
                background: 'var(--ip-surface-tile)', border: 'var(--ip-border)',
                color: 'var(--ip-text-2)', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 150ms',
              }}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '16px 20px', borderTop: 'var(--ip-border)', display: 'flex', gap: 12, alignItems: 'flex-end', background: 'var(--ip-surface-tile)' }}>
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          placeholder="Napisz do IDO…"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{ flex: 1, resize: 'none', padding: '14px 18px', background: 'var(--ip-surface-solid)', border: 'var(--ip-border-hi)', borderRadius: 14, color: 'var(--ip-text)', fontSize: 14, fontFamily: 'inherit', outline: 'none', maxHeight: 200, lineHeight: 1.5 }}
        />
        <Button variant="primary" onClick={() => send()} disabled={!input.trim() || sending}>
          {sending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
          {sending ? '' : 'Wyślij'}
        </Button>
      </div>
    </Card>
  );
}
