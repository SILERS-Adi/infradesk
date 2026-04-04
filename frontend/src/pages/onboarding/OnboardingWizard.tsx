import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Shield, Headphones, ChevronRight, ChevronLeft, Loader2, Check, Users, Monitor, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../api/client';
import { useAuth } from '../../store/authStore';
import { useTheme } from '../../store/themeStore';

type WsType = 'msp' | 'internal_it' | 'client';
type RoutingMode = 'internal_only' | 'send_to_default_provider' | 'ask_each_time';

const WS_TYPES: { id: WsType; icon: typeof Building2; label: string; desc: string; color: string }[] = [
  {
    id: 'msp',
    icon: Building2,
    label: 'Świadczę obsługę IT dla klientów',
    desc: 'Jestem firmą IT obsługującą wielu klientów — MSP / Centrum Obsługi IT',
    color: '#F59E0B',
  },
  {
    id: 'internal_it',
    icon: Shield,
    label: 'Zarządzam IT we własnej firmie',
    desc: 'Mam własny dział IT lub sam zarządzam infrastrukturą',
    color: '#8B5CF6',
  },
  {
    id: 'client',
    icon: Headphones,
    label: 'Korzystam z zewnętrznej obsługi IT',
    desc: 'Moja firma jest obsługiwana przez zewnętrzną firmę informatyczną',
    color: '#3B82F6',
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
  const [orgType, setOrgType] = useState<WsType | null>(null);
  const [routingMode, setRoutingMode] = useState<RoutingMode>('internal_only');
  const [providerEmail, setProviderEmail] = useState('');
  const [saving, setSaving] = useState(false);

  // Step 4 state
  const [inviteEmails, setInviteEmails] = useState('');

  // Steps: 1=org, 2=routing (skip for internal_it), 3=provider/operator, 4=users/devices/agent
  const totalSteps = orgType === 'internal_it' ? 3 : 4;

  const handleFinish = async () => {
    if (!orgType) return;
    setSaving(true);
    try {
      await apiClient.put('/workspaces/onboarding', {
        organizationType: orgType,
        ticketRoutingMode: routingMode,
      });

      // If client with external IT and email provided, send invitation request
      if (orgType === 'client' && providerEmail) {
        try {
          await apiClient.post('/sharing/request', { email: providerEmail, scope: 'ALL' });
          toast.success('Prośba o obsługę wysłana do ' + providerEmail);
        } catch { /* ignore — not critical */ }
      }

      // Invite users if emails provided
      if (inviteEmails.trim()) {
        const emails = inviteEmails.split(/[,;\n]+/).map(e => e.trim()).filter(Boolean);
        for (const email of emails) {
          try {
            await apiClient.post('/users/invite', { email, role: 'MEMBER' });
          } catch { /* ignore individual failures */ }
        }
        if (emails.length > 0) toast.success(`Zaproszono ${emails.length} użytkowników`);
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
    return true;
  };

  const handleNext = () => {
    if (step === 1 && orgType === 'internal_it') {
      setRoutingMode('internal_only');
      // Skip step 2 (routing), go to step 3 (which is "users/devices" for internal_it)
      setStep(3);
      return;
    }
    if (step === 1 && orgType === 'client') {
      setRoutingMode('send_to_default_provider');
    }
    if (step === 1 && orgType === 'msp') {
      setRoutingMode('internal_only');
    }

    if (step === totalSteps) {
      handleFinish();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleBack = () => {
    if (step === 3 && orgType === 'internal_it') {
      setStep(1); // skip back over step 2
      return;
    }
    setStep(s => s - 1);
  };

  // For internal_it: step 3 = users/devices (what is normally step 4)
  const isOnUsersStep = orgType === 'internal_it' ? step === 3 : step === 4;
  const isOnProviderStep = orgType !== 'internal_it' && step === 3;

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
                {WS_TYPES.map(ot => {
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

          {/* Step 2: Helpdesk routing (client + msp) */}
          {step === 2 && orgType !== 'internal_it' && (
            <div>
              <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--t)' }}>
                {orgType === 'client' ? 'Jak chcesz obsługiwać zgłoszenia?' : 'Konfiguracja Help Desk'}
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--tm)' }}>
                {orgType === 'client'
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

          {/* Step 3: Provider email (client) or first client info (operator) */}
          {isOnProviderStep && orgType === 'client' && (
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

          {isOnProviderStep && orgType === 'msp' && (
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

          {/* Step 4 (or 3 for internal_it): Users, devices, agent */}
          {isOnUsersStep && (
            <div>
              <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--t)' }}>Dodaj zespół i urządzenia</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--tm)' }}>
                Zaproś współpracowników i skonfiguruj monitorowanie. Możesz to zrobić później.
              </p>

              {/* Invite users */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Users style={{ width: 18, height: 18, color: 'var(--accent)' }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>Zaproś użytkowników</span>
                </div>
                <textarea
                  value={inviteEmails}
                  onChange={e => setInviteEmails(e.target.value)}
                  placeholder="jan@firma.pl, anna@firma.pl&#10;(oddziel emaile przecinkami lub nową linią)"
                  rows={3}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 12, fontSize: 13,
                    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t)',
                    resize: 'vertical',
                  }}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--td)' }}>
                  Zaproszeni otrzymają email z linkiem do dołączenia.
                </p>
              </div>

              {/* Devices & Agent */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
              }}>
                <div style={{
                  padding: '16px 18px', borderRadius: 12, border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
                onClick={() => { handleFinish().then(() => navigate('/devices')); }}
                >
                  <Monitor style={{ width: 20, height: 20, color: '#22C55E', marginBottom: 8 }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>Dodaj urządzenia</div>
                  <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>Ręcznie lub przez import</div>
                </div>
                <div style={{
                  padding: '16px 18px', borderRadius: 12, border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
                onClick={() => { handleFinish().then(() => navigate('/agents')); }}
                >
                  <Download style={{ width: 20, height: 20, color: '#6366F1', marginBottom: 8 }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>Zainstaluj agenta</div>
                  <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>Automatyczny monitoring</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          {step > 1 ? (
            <button onClick={handleBack}
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
