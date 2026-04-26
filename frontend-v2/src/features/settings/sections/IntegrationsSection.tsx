import { Plug } from 'lucide-react';
import { GoogleIntegrationCard } from '../GoogleIntegrationCard';
import { SectionCard } from '../SectionCard';

export function IntegrationsSection() {
  return (
    <div className="space-y-[var(--sp-5)]">
      <GoogleIntegrationCard />

      <SectionCard
        title="SMTP do wiadomości CRM"
        description="Własny serwer SMTP dla maili wysyłanych z Twojego konta w module CRM."
      >
        <div
          className="p-[var(--sp-3)] rounded-[var(--r-s)] text-[12px] text-[var(--tx3)] flex items-start gap-2"
          style={{ background: 'var(--sf2)', border: '1px dashed var(--bd)' }}
        >
          <Plug size={14} className="mt-0.5 shrink-0" />
          <span>
            Funkcja w przygotowaniu. Konfiguracja skrzynek CRM jest dostępna w panelu
            administratora workspace (Ustawienia firmy → Skrzynki e-mail).
          </span>
        </div>
      </SectionCard>

      <SectionCard
        title="Kalendarz Google"
        description="Synchronizacja zadań i sesji pracy z Google Calendar."
      >
        <div
          className="p-[var(--sp-3)] rounded-[var(--r-s)] text-[12px] text-[var(--tx3)]"
          style={{ background: 'var(--sf2)', border: '1px dashed var(--bd)' }}
        >
          Funkcja w przygotowaniu. Po połączeniu konta Google powyżej zakres read-only
          kalendarza jest już udostępniony — synchronizacja dwustronna dojdzie w kolejnym
          sprincie.
        </div>
      </SectionCard>
    </div>
  );
}
