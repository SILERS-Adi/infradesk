/**
 * PanelIdoPage — real IDO chat (proxied to ID CORE with workspace context).
 * Endpoint: POST /api/panel/ido/chat { message } → { response }
 */

import React from 'react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Send, Loader2, RefreshCw, HardDrive, Printer, Lock, Wifi } from 'lucide-react';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
  duration?: number;
}

const SUGGESTIONS = [
  { icon: <HardDrive size={14} />, label: 'Miejsce na dysku', prompt: 'Sprawdź ile mam wolnego miejsca na dysku i co mogę zwolnić' },
  { icon: <RefreshCw size={14} />, label: 'Aktualizacje',     prompt: 'Jakie mam zaległe aktualizacje Windows?' },
  { icon: <Printer size={14} />,   label: 'Drukarka',         prompt: 'Moja drukarka nie drukuje, pomóż' },
  { icon: <Lock size={14} />,      label: 'Nowe hasło',       prompt: 'Wygeneruj mi silne hasło do nowego konta' },
  { icon: <Wifi size={14} />,      label: 'Internet',         prompt: 'Internet działa wolno, co mogę zrobić?' },
];

export default function PanelIdoPage() {
  const [messages, setMessages] = React.useState<Msg[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Cześć! Jestem IDO — Twój asystent IT. W czym mogę pomóc? Możesz opisać problem słowami albo kliknąć jedną z sugestii poniżej.',
      time: new Date().toISOString(),
    },
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
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text: msg, time: new Date().toISOString() }]);
    setSending(true);
    try {
      const { data } = await apiClient.post<{ response: string; durationMs: number }>('/panel/ido/chat', { message: msg });
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`, role: 'assistant',
        text: data.response || '(IDO nie zwróciła odpowiedzi)',
        time: new Date().toISOString(),
        duration: data.durationMs,
      }]);
    } catch (e: any) {
      const errText = e?.response?.data?.detail || e?.response?.data?.error || e?.message || 'Błąd połączenia';
      toast.error(`IDO offline: ${errText}`);
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`, role: 'assistant',
        text: `⚠️ Nie udało się połączyć z IDO (${errText}). Spróbuj za chwilę lub otwórz zgłoszenie ręcznie.`,
        time: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: 'calc(100vh - 140px)', minHeight: 600 }}>
      <style>{`
        .ido-wrap { display: grid; grid-template-rows: auto 1fr auto; gap: 0; height: 100%; }
        .ido-top { display: flex; align-items: center; gap: 16px; padding: 20px 28px; border-bottom: 1px solid var(--glass-border); }
        .ido-top-orb { width: 48px; height: 48px; border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 35%), radial-gradient(circle at 50% 50%, #A78BFA 0%, #8B5CF6 40%, #22D3EE 100%);
          box-shadow: 0 0 30px rgba(139,92,246,.55), inset 0 -3px 10px rgba(14,22,40,.35), inset 0 2px 6px rgba(255,255,255,.25);
          animation: idoOrbLive 3s ease-in-out infinite;
          flex-shrink: 0;
        }
        @keyframes idoOrbLive { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
        .ido-top-title { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; color: var(--text-primary); }
        .ido-top-sub { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
        .ido-top-chip { margin-left: auto; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; padding: 6px 12px; border-radius: 9999px; background: rgba(52,211,153,0.14); color: #34D399; border: 1px solid rgba(52,211,153,0.3); }
        .ido-msgs { overflow-y: auto; padding: 24px 28px; display: flex; flex-direction: column; gap: 16px; }
        .ido-msg { display: flex; gap: 12px; max-width: 85%; }
        .ido-msg--user { align-self: flex-end; flex-direction: row-reverse; }
        .ido-msg-av { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
        .ido-msg--user .ido-msg-av { background: linear-gradient(135deg, #22D3EE, #0891B2); color: #FFF; }
        .ido-msg--assistant .ido-msg-av {
          background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 35%), radial-gradient(circle at 50% 50%, #A78BFA 0%, #8B5CF6 40%, #22D3EE 100%);
          box-shadow: 0 0 14px rgba(139,92,246,.4);
        }
        .ido-msg-body { padding: 12px 16px; border-radius: 14px; font-size: 14px; line-height: 1.55; white-space: pre-wrap; word-wrap: break-word; }
        .ido-msg--user .ido-msg-body { background: linear-gradient(135deg, #8B5CF6, #22D3EE); color: #fff; box-shadow: 0 4px 12px rgba(139,92,246,.3); border-bottom-right-radius: 4px; }
        .ido-msg--assistant .ido-msg-body { background: var(--glass-bg-hi); border: 1px solid var(--glass-border); color: var(--text-primary); border-bottom-left-radius: 4px; }
        .ido-msg-meta { font-size: 10px; color: var(--text-tertiary); margin-top: 4px; padding: 0 4px; font-family: var(--font-mono, monospace); }
        .ido-typing { display: inline-flex; gap: 4px; padding: 14px 18px; background: var(--glass-bg-hi); border: 1px solid var(--glass-border); border-radius: 14px; border-bottom-left-radius: 4px; align-items: center; }
        .ido-typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--text-secondary); opacity: 0.6; animation: idoDot 1.4s infinite ease-in-out; }
        .ido-typing span:nth-child(2) { animation-delay: 0.2s; }
        .ido-typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes idoDot { 0%,80%,100% { transform: scale(0.7); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
        .ido-suggestions { display: flex; gap: 8px; flex-wrap: wrap; padding: 0 28px 14px; }
        .ido-suggest { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 9999px; background: var(--glass-bg); border: 1px solid var(--glass-border); color: var(--text-secondary); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 150ms; font-family: inherit; }
        .ido-suggest:hover { background: var(--glass-bg-hi); color: var(--text-primary); border-color: #22D3EE; }
        .ido-bottom { padding: 16px 20px; border-top: 1px solid var(--glass-border); display: flex; gap: 12px; align-items: flex-end; background: var(--glass-bg); }
        .ido-textarea { flex: 1; resize: none; padding: 14px 18px; background: var(--glass-bg-hi); border: 1px solid var(--glass-border-hi); border-radius: 14px; color: var(--text-primary); font-size: 14px; font-family: inherit; outline: none; max-height: 200px; line-height: 1.5; }
        .ido-textarea:focus { border-color: #22D3EE; }
        .ido-send-btn { padding: 14px 20px; background: linear-gradient(135deg, #8B5CF6, #22D3EE); color: #fff; border: none; border-radius: 14px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(139,92,246,.35); transition: all 150ms; font-family: inherit; }
        .ido-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ido-send-btn:not(:disabled):hover { filter: brightness(1.1); transform: translateY(-1px); }
      `}</style>

      <div className="panel-glass ido-wrap">
        <div className="ido-top">
          <div className="ido-top-orb" />
          <div>
            <div className="ido-top-title">IDO</div>
            <div className="ido-top-sub">ID Opiekun — Twój asystent AI SILERS</div>
          </div>
          <span className="ido-top-chip">Online</span>
        </div>

        <div className="ido-msgs" ref={scrollRef}>
          {messages.map(m => (
            <div key={m.id} className={`ido-msg ido-msg--${m.role}`}>
              <div className="ido-msg-av">{m.role === 'user' ? 'TY' : ''}</div>
              <div>
                <div className="ido-msg-body">{m.text}</div>
                <div className="ido-msg-meta">
                  {new Date(m.time).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                  {m.duration && ` · ${(m.duration / 1000).toFixed(1)}s`}
                </div>
              </div>
            </div>
          ))}
          {sending && (
            <div className="ido-msg ido-msg--assistant">
              <div className="ido-msg-av" />
              <div className="ido-typing"><span /><span /><span /></div>
            </div>
          )}
        </div>

        {messages.length === 1 && (
          <div className="ido-suggestions">
            {SUGGESTIONS.map(s => (
              <button key={s.label} className="ido-suggest" onClick={() => send(s.prompt)}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="ido-bottom">
          <textarea
            ref={inputRef}
            className="ido-textarea"
            rows={1}
            value={input}
            placeholder="Napisz do IDO…"
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button className="ido-send-btn" onClick={() => send()} disabled={!input.trim() || sending}>
            {sending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
            {sending ? '' : 'Wyślij'}
          </button>
        </div>
      </div>
    </div>
  );
}
