import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, ArrowRight, X, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';

interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  done: boolean;
  cta: { label: string; href: string };
}

interface OnboardingResponse {
  steps: OnboardingStep[];
  completed: number;
  total: number;
}

const DISMISS_KEY = 'idesk-onboarding-dismissed';

export function OnboardingChecklist() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  });

  const { data } = useQuery<OnboardingResponse>({
    queryKey: ['workspace', 'onboarding'],
    queryFn: async () => (await api.get('/workspaces/current/onboarding')).data,
    refetchInterval: 30_000,
    enabled: !dismissed,
  });

  useEffect(() => {
    if (data && data.completed === data.total && !dismissed) {
      // Auto-dismiss po pełnym ukończeniu, żeby checklist nie tkwił na zawsze.
      window.localStorage.setItem(DISMISS_KEY, '1');
      setDismissed(true);
    }
  }, [data, dismissed]);

  function handleDismiss() {
    window.localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  if (dismissed || !data || data.completed === data.total) return null;

  const pct = Math.round((data.completed / data.total) * 100);

  return (
    <Card
      className="p-5 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, var(--pri-l) 0%, var(--sf) 70%)',
        borderColor: 'var(--pri)',
      }}
    >
      <div
        aria-hidden
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, var(--pri), transparent 70%)' }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
              style={{ background: 'var(--pri)', color: 'white' }}
            >
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-tx">Zacznij od tych 4 kroków</h3>
              <p className="text-[12px] text-tx2">
                Ukończ żeby Twój workspace był w pełni funkcjonalny — {data.completed} z {data.total}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h press"
            title="Ukryj — wrócisz tu z menu Pomoc"
            aria-label="Ukryj listę"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div
          className="h-1.5 rounded-full mb-4 overflow-hidden"
          style={{ background: 'var(--sf-h)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'var(--pri)' }}
          />
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {data.steps.map((step) => (
            <li
              key={step.key}
              className="rounded-[var(--r-s)] p-3 border flex items-start gap-3"
              style={{
                borderColor: step.done ? 'var(--ok)' : 'var(--bd)',
                background: step.done ? 'color-mix(in srgb, var(--ok) 6%, var(--sf))' : 'var(--sf)',
                opacity: step.done ? 0.85 : 1,
              }}
            >
              <div className="shrink-0 mt-0.5">
                {step.done
                  ? <CheckCircle2 className="h-5 w-5" style={{ color: 'var(--ok)' }} />
                  : <Circle className="h-5 w-5 text-tx3" />}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[13px] font-bold mb-0.5"
                  style={{
                    color: step.done ? 'var(--tx2)' : 'var(--tx)',
                    textDecoration: step.done ? 'line-through' : 'none',
                  }}
                >
                  {step.label}
                </p>
                <p className="text-[11px] text-tx3 leading-snug mb-2">{step.description}</p>
                {!step.done && (
                  <Link
                    to={step.cta.href}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold press"
                    style={{ color: 'var(--pri)' }}
                  >
                    {step.cta.label} <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
