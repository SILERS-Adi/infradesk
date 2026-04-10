import { type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';

/* ═══════════════════════════════════════════════════════════════════
   WizardShell — piękny kreator krok-po-kroku
   Animowany progress bar, ikony kroków, responsywny.
   ═══════════════════════════════════════════════════════════════════ */

export interface WizardStep {
  key: string;
  label: string;
  icon: ReactNode;
  /** Opcjonalny opis kroku widoczny pod tytułem */
  description?: string;
}

interface WizardShellProps {
  steps: WizardStep[];
  currentStep: number;
  children: ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  onSubmit?: () => void;
  nextLabel?: string;
  submitLabel?: string;
  isSubmitting?: boolean;
  /** Czy można przejść dalej (walidacja) */
  canNext?: boolean;
}

export function WizardShell({
  steps, currentStep, children,
  onNext, onBack, onSubmit,
  nextLabel = 'Dalej',
  submitLabel = 'Zapisz',
  isSubmitting = false,
  canNext = true,
}: WizardShellProps) {
  const isLast = currentStep === steps.length - 1;
  const progressPct = ((currentStep + 1) / steps.length) * 100;

  return (
    <div style={{
      borderRadius: 20,
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    }}>
      {/* ── Progress bar ─────────────────────────────────────────── */}
      <div style={{ height: 3, background: 'var(--hover-bg)', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${progressPct}%`,
          background: 'linear-gradient(90deg, #5B5FEF, #8B5CF6, #A78BFA)',
          borderRadius: '0 4px 4px 0',
          transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>

      {/* ── Step indicators ──────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px 24px 16px', gap: 4,
        overflowX: 'auto',
      }}>
        {steps.map((step, i) => {
          const isDone = i < currentStep;
          const isActive = i === currentStep;
          const isFuture = i > currentStep;

          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
              {/* Step circle */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 14px', borderRadius: 12,
                background: isActive
                  ? 'linear-gradient(135deg, rgba(91,95,239,0.15), rgba(139,92,246,0.1))'
                  : isDone ? 'rgba(34,197,94,0.08)' : 'transparent',
                border: isActive
                  ? '1px solid rgba(139,92,246,0.3)'
                  : isDone ? '1px solid rgba(34,197,94,0.15)' : '1px solid transparent',
                transition: 'all 0.3s ease',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isActive
                    ? 'linear-gradient(135deg, #5B5FEF, #8B5CF6)'
                    : isDone ? '#22C55E' : 'var(--hover-bg)',
                  color: isActive || isDone ? '#fff' : 'var(--tm)',
                  fontSize: 13, fontWeight: 700,
                  transition: 'all 0.3s ease',
                  flexShrink: 0,
                }}>
                  {isDone ? <Check size={14} /> : step.icon}
                </div>
                <div style={{ display: isActive ? 'block' : isFuture ? 'none' : 'block' }}>
                  <div style={{
                    fontSize: 11, fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'var(--t)' : isDone ? '#4ADE80' : 'var(--tm)',
                    whiteSpace: 'nowrap',
                  }}>
                    {step.label}
                  </div>
                  {isActive && step.description && (
                    <div style={{ fontSize: 10, color: 'var(--tm)', marginTop: 1 }}>
                      {step.description}
                    </div>
                  )}
                </div>
              </div>

              {/* Connector */}
              {i < steps.length - 1 && (
                <ChevronRight size={14} style={{
                  color: isDone ? '#4ADE80' : 'var(--border)',
                  margin: '0 2px', flexShrink: 0,
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Content area ─────────────────────────────────────────── */}
      <div style={{
        padding: '8px 28px 28px',
        minHeight: 200,
      }}>
        {children}
      </div>

      {/* ── Footer actions ───────────────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 28px',
        borderTop: '1px solid var(--border)',
        background: 'var(--hover-bg)',
      }}>
        <div>
          {currentStep > 0 && (
            <Button variant="secondary" onClick={onBack} size="sm">
              ← Wstecz
            </Button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isLast && onNext && (
            <Button onClick={onNext} disabled={!canNext} size="sm">
              {nextLabel} →
            </Button>
          )}
          {isLast && onSubmit && (
            <Button onClick={onSubmit} loading={isSubmitting} disabled={!canNext} size="sm">
              {submitLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
