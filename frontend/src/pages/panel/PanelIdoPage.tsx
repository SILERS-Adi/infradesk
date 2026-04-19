/**
 * PanelIdoPage — chat with IDO (ID Opiekun) client assistant.
 *
 * Phase 7 stub: static intro + capability list. Real backend integration
 * (workspace-scoped prompt + tool calling + WorkSession billing with
 * verify-before-bill) will replace this content.
 */

import React from 'react';
import { MessageCircle, HardDrive, RefreshCw, Printer, Lock, Wifi, Terminal } from 'lucide-react';

export default function PanelIdoPage() {
  const [input, setInput] = React.useState('');

  const capabilities = [
    { icon: <HardDrive size={18} />,  title: 'Miejsce na dysku',        desc: 'Sprawdzę ile zajętego miejsca masz na dysku. Mogę zwolnić Temp + cache przeglądarki jeżeli potrzeba — rozmawiam z agentem Windows.' },
    { icon: <RefreshCw size={18} />,  title: 'Aktualizacje Windows',    desc: 'Sprawdzę jakie są zaległe aktualizacje systemu i programów. Mogę uruchomić aktualizację jeżeli zgodzisz się na restart.' },
    { icon: <Printer size={18} />,    title: 'Drukarka nie drukuje',    desc: 'Najczęstsze: restart Print Spooler, sprawdzenie kolejki zadań. Zrobię to i zweryfikuję że drukuje — jeżeli nie, zgłaszam serwis.' },
    { icon: <Lock size={18} />,       title: 'Nowe hasło',              desc: 'Wygeneruję silne hasło, zapiszę w Twoim vaulcie, nie będę go pamiętać po powiedzeniu Ci go jeden raz.' },
    { icon: <Wifi size={18} />,       title: 'Problemy z Internetem',   desc: 'Speed test, sprawdzenie DNS, restart karty sieciowej. Jak nie pomaga — ticket dla Mariusza z dokładną diagnozą.' },
    { icon: <Terminal size={18} />,   title: 'Inne problemy',           desc: 'Napisz czego potrzebujesz. Zdiagnozuje sam albo od razu założę zgłoszenie dla technika. Nigdy nie naliczam czasu za rzeczy które się nie udały.' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <style>{`
        .ido-hero { padding: 60px 48px; text-align: center; position: relative; overflow: hidden; }
        .ido-orb-big { width: 140px; height: 140px; margin: 0 auto 28px; border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 35%), radial-gradient(circle at 50% 50%, #A78BFA 0%, #8B5CF6 40%, #22D3EE 100%);
          box-shadow: 0 0 80px rgba(139,92,246,.6), 0 0 180px rgba(34,211,238,.3), inset 0 -10px 32px rgba(14,22,40,.35), inset 0 2px 8px rgba(255,255,255,.25);
          animation: orbPulse 3.5s ease-in-out infinite;
        }
        @keyframes orbPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        .ido-title { font-size: clamp(36px, 5vw, 56px); font-weight: 900; letter-spacing: -0.045em; line-height: 1.05; margin-bottom: 16px; background: linear-gradient(135deg, #A78BFA 0%, #22D3EE 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .ido-sub { font-size: 17px; color: var(--text-secondary); max-width: 600px; margin: 0 auto 40px; line-height: 1.6; }
        .ido-input-wrap { display: flex; gap: 12px; max-width: 720px; margin: 0 auto; padding: 6px; background: var(--glass-bg-hi); border: 1px solid var(--glass-border-hi); border-radius: 18px; box-shadow: 0 8px 32px rgba(0,0,0,.24); }
        .ido-input { flex: 1; background: none; border: none; outline: none; padding: 14px 18px; color: var(--text-primary); font-size: 15px; font-family: inherit; }
        .ido-input::placeholder { color: var(--text-tertiary); }
        .ido-send { padding: 12px 24px; background: linear-gradient(135deg, #8B5CF6, #22D3EE); color: white; border: none; border-radius: 14px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(139,92,246,.4); }
        .ido-send:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .cap-title { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; }
        .cap-sub { font-size: 13px; color: var(--text-tertiary); margin-bottom: 20px; }
        .cap-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
        .cap-card { padding: 20px; }
        .cap-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
        .cap-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--brand-gradient-soft, rgba(139,92,246,0.12)); color: #22D3EE; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .cap-name { font-size: 15px; font-weight: 600; color: var(--text-primary); }
        .cap-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.55; }
        .promise { padding: 24px 28px; margin-top: 8px; border: 1px solid rgba(139,92,246,0.3); background: var(--brand-gradient-soft, rgba(139,92,246,0.08)); }
        .promise-title { font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #A78BFA; margin-bottom: 8px; }
        .promise-text { font-size: 14px; color: var(--text-primary); line-height: 1.6; }
      `}</style>

      <div className="panel-glass ido-hero">
        <div className="ido-orb-big" />
        <h1 className="ido-title">Jestem Twoim IDO</h1>
        <p className="ido-sub">
          ID Opiekun — asystent AI SILERS. Pomogę Ci z codziennymi problemami IT, szybciej niż telefon na helpdesk.
          Rozwiązuje sama to co umie, a czego nie umie — zgłaszam technikowi i uprzedzam Cię co dalej.
        </p>
        <div className="ido-input-wrap">
          <input
            className="ido-input"
            placeholder="Opisz co się dzieje…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { alert('IDO chat backend w Phase 7 — wkrótce'); } }}
          />
          <button className="ido-send" onClick={() => alert('IDO chat backend w Phase 7 — wkrótce')}>
            <MessageCircle size={16} /> Wyślij
          </button>
        </div>
      </div>

      <div>
        <div className="cap-title">Co umiem dla Ciebie zrobić</div>
        <div className="cap-sub">Kliknij temat albo napisz sam(a)</div>
        <div className="cap-grid">
          {capabilities.map(c => (
            <div key={c.title} className="panel-glass cap-card">
              <div className="cap-head">
                <div className="cap-icon">{c.icon}</div>
                <div className="cap-name">{c.title}</div>
              </div>
              <div className="cap-desc">{c.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel-glass promise">
        <div className="promise-title">💡 Obietnica IDO</div>
        <div className="promise-text">
          Naliczam czas TYLKO wtedy, kiedy zweryfikuję że akcja naprawdę zadziałała. Próba bez skutku → bezpłatnie, wystawiam zgłoszenie dla Mariusza. Każda akcja co trwa &lt; 1 minuty liczy się jako 15 min (minimum rozliczeniowe).
        </div>
      </div>
    </div>
  );
}
