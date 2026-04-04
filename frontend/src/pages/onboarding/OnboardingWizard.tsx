import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Shield, Headphones, ChevronRight, ChevronLeft, Send, Loader2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../api/client';
import { useAuth } from '../../store/authStore';
import { useTheme } from '../../store/themeStore';

type OrgType = 'client_external_it' | 'internal_it' | 'it_operator';
type RoutingMode = 'internal_only' | 'send_to_default_provider' | 'ask_each_time';

const ORG_TYPES: { id: OrgType; icon: typeof Building2; label: string; desc: string; color: string }[] = [
  {
    id: 'client_external_it',
    icon: Headphones,
    label: 'Korzystam z zewnętrznej obsługi IT',
    desc: 'Moja firma jest obsługiwana przez zewnętrzną firmę informatyczną',
    color: '#3B82F6',
  },
  {
    id: 'internal_it',
    icon: Shield,
    label: 'Zarządzam IT we własnej firmie',
    desc: 'Mam własny dział IT lub sam zarządzam infrastrukturą',
    color: '#8B5CF6',
  },
  {
    id: 'it_operator',
    icon: Building2,
    label: 'Świadczę obsługę IT dla klientów',
    desc: 'Jestem firmą IT obsługującą wielu klientów — Centrum Obsługi IT',
    color: '#F59E0B',
  },
];

const ROUTING_MODES: { id: RoutingMode; label: string; desc: string }[] = [
  { id: 'internal_only', label: 'Obsługa wewnętrzna', desc: 'Zgłoszenia trafiają do mojego zespołu' },
  { id: 'send_to_default_provider', label: 'Wyślij do firmy IT', desc: 'Zgłoszenia automatycznie trafiają do domyślnej firmy IT' },
  { id: 'ask_each_time', label: 'Pytaj przy każdym zgłoszeniu', desc: 'Użytkownik decyduje, kto obsłuży zgłoszenie' },
];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { resolved } = useTheme();
  const isLight = resolved === 'light';

  const [step, setStep] = useState(1);
  const [orgType, setOrgType] = useState<OrgType | null>(null);
  const [routingMode, setRoutingMode] = useState<RoutingMode>('internal_only');
  const [providerEmail, setProviderEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const totalSteps = orgType === 'internal_it' ? 2 : 3;

  const handleFinish = async () => {
    if (!orgType) return;
    setSaving(true);
    try {
      await apiClient.put('/workspaces/onboarding', {
        organizationType: orgType,
        ticketRoutingMode: routingMode,
      });

      // If client with external IT and email provided, send invitation request
      if (orgType === 'client_external_it' && providerEmail) {
        try {
          await apiClient.post('/sharing/request', { email: providerEmail, scope: 'ALL' });
          toast.success('Prośba o obsługę wysłana do ' + providerEmail);
        } catch { /* ignore — not critical */ }
      }

      toast.success('Konfiguracja zapisana!');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    if (step === 1) return !!orgType;
    if (step === 2) return true;
    if (step === 3) return true;
    return false;
  };

  const handleNext = () => {
    if (step === 1 && orgType === 'internal_it') {
      // Internal IT skips step 2 (routing), goes to finish
      setRoutingMode('internal_only');
    }
    if (step === 1 && orgType === 'client_external_it') {
      setRoutingMode('send_to_default_provider');
    }
    if (step === 1 && orgType === 'it_operator') {
      setRoutingMode('internal_only');
    }

    if (step === totalSteps) {
      handleFinish();
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={isLight ? '/logo-dark.png' : '/logo.png'} alt="InfraDesk" className="h-16 mx-auto mb-4" />
          <h1 className="text-xl font-bold" style={{ color: 'var(--t)' }}>
            Witaj, {user?.firstName}!
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--tm)' }}>
            Skonfiguruj swoje środowisko pracy
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
            <div key={s} style={{
              width: s === step ? 32 : 8, height: 8, borderRadius: 4,
              background: s <= step ? 'var(--accent)' : 'var(--border)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>

        {/* Step content */}
        <div style={{
          background: 'var(--bg-card, var(--bg2))',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 32,
        }}>

          {/* Step 1: Organization type */}
          {step === 1 && (
            <div>
              <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--t)' }}>Jaki jest Twój model pracy?</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--tm)' }}>Wybierz, jak korzystasz z IT w swojej firmie</p>

              <div className="flex flex-col gap-3">
                {ORG_TYPES.map(ot => {
                  const Icon = ot.icon;
                  const selected = orgType === ot.id;
                  return (
                    <button key={ot.id} onClick={() => setOrgType(ot.id)}
                      className="text-left transition-all"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
                        borderRadius: 14,
                        border: `2px solid ${selected ? ot.color : 'var(--border)'}`,
                        background: selected ? `${ot.color}08` : 'transparent',
                        cursor: 'pointer',
                      }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                        background: selected ? `${ot.color}15` : 'var(--hover-bg)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon style={{ width: 24, height: 24, color: selected ? ot.color : 'var(--tm)' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: selected ? ot.color : 'var(--t)' }}>{ot.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--tm)', marginTop: 2 }}>{ot.desc}</div>
                      </div>
                      {selected && (
                        <Check style={{ width: 20, height: 20, color: ot.color, flexShrink: 0 }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Helpdesk routing (client_external_it + it_operator) */}
          {step === 2 && orgType !== 'internal_it' && (
            <div>
              <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--t)' }}>
                {orgType === 'client_external_it' ? 'Jak chcesz obsługiwać zgłoszenia?' : 'Konfiguracja Help Desk'}
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--tm)' }}>
                {orgType === 'client_external_it'
                  ? 'Zdecyduj, gdzie trafiają Twoje zgłoszenia serwisowe'
                  : 'Skonfiguruj domyślny tryb obsługi zgłoszeń'}
              </p>

              <div className="flex flex-col gap-3">
                {ROUTING_MODES.map(rm => {
                  const selected = routingMode === rm.id;
                  return (
                    <button key={rm.id} onClick={() => setRoutingMode(rm.id)}
                      className="text-left transition-all"
                      style={{
                        padding: '14px 18px', borderRadius: 12,
                        border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                        background: selected ? 'var(--accent-g)' : 'transparent',
                        cursor: 'pointer',
                      }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: selected ? 'var(--accent)' : 'var(--t)' }}>{rm.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>{rm.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2 for internal_it — skip directly (handled by totalSteps) */}

          {/* Step 3: Provider email (client) or first client (operator) */}
          {step === 3 && orgType === 'client_external_it' && (
            <div>
              <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--t)' }}>Połącz z firmą IT</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--tm)' }}>
                Podaj email firmy IT, która obsługuje Twoją infrastrukturę. Wyślemy zaproszenie do współpracy.
              </p>
              <input
                type="email"
                value={providerEmail}
                onChange={e => setProviderEmail(e.target.value)}
                placeholder="biuro@firmaIT.pl"
                style={{
                  width: '100%', padding: '14px 18px', borderRadius: 12, fontSize: 14,
                  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t)',
                }}
              />
              <p className="text-xs mt-3" style={{ color: 'var(--td)' }}>
                Możesz pominąć ten krok i dodać firmę IT później w ustawieniach.
              </p>
            </div>
          )}

          {step === 3 && orgType === 'it_operator' && (
            <div>
              <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--t)' }}>Centrum Obsługi IT</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--tm)' }}>
                Twoje konto jest skonfigurowane jako Centrum Obsługi IT.
                Po zakończeniu konfiguracji będziesz mógł dodawać klientów z poziomu panelu operacyjnego.
              </p>
              <div style={{
                padding: '16px 20px', borderRadius: 12,
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#F59E0B', marginBottom: 4 }}>Co będzie dostępne:</div>
                <ul style={{ fontSize: 12, color: 'var(--ts)', margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
                  <li>Panel z widokiem na wszystkich klientów</li>
                  <li>Zgłoszenia i urządzenia ze wszystkich firm</li>
                  <li>Zarządzanie klientami i relacjami</li>
                  <li>Rozliczenia i sesje pracy</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          {step > 1 ? (
            <button onClick={() => setStep(s => s - 1)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
                borderRadius: 10, border: '1px solid var(--border)', background: 'none',
                color: 'var(--ts)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>
              <ChevronLeft style={{ width: 16, height: 16 }} /> Wstecz
            </button>
          ) : <div />}

          <button onClick={handleNext} disabled={!canProceed() || saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 24px',
              borderRadius: 10, border: 'none',
              background: canProceed() ? 'var(--accent)' : 'var(--hover-bg)',
              color: canProceed() ? '#fff' : 'var(--td)',
              fontSize: 13, fontWeight: 600,
              cursor: canProceed() && !saving ? 'pointer' : 'default',
              opacity: canProceed() && !saving ? 1 : 0.6,
            }}>
            {saving ? (
              <><Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> Zapisuję...</>
            ) : step === totalSteps ? (
              <><Check style={{ width: 16, height: 16 }} /> Zakończ konfigurację</>
            ) : (
              <>Dalej <ChevronRight style={{ width: 16, height: 16 }} /></>
            )}
          </button>
        </div>

        {/* Skip */}
        <div className="text-center mt-4">
          <button onClick={() => navigate('/dashboard')}
            style={{ background: 'none', border: 'none', color: 'var(--td)', fontSize: 11, cursor: 'pointer' }}>
            Pomiń konfigurację
          </button>
        </div>
      </div>
    </div>
  );
}
