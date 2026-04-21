import { useQuery } from '@tanstack/react-query';
import { Zap, Check, Sparkles, Shield, Briefcase } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonCard } from '@/components/ui/Skeleton';

interface Workspace {
  plan: 'STARTER' | 'PRO' | 'ENTERPRISE';
  planStartedAt: string | null;
  planExpiresAt: string | null;
  trialEndsAt: string | null;
}

const PLANS = [
  {
    key: 'STARTER',
    label: 'Starter',
    price: '0',
    color: 'var(--tx2)',
    features: ['Do 3 użytkowników', 'Do 25 urządzeń', 'Tickety + Sesje', 'Sejf haseł', 'Email support'],
  },
  {
    key: 'PRO',
    label: 'Pro',
    price: '299',
    color: 'var(--pri)',
    features: [
      'Do 15 użytkowników',
      'Nielimitowane urządzenia',
      'Wszystko ze Starter +',
      'Backupy + Monitoring',
      'Desktop Asystent',
      'AI Copilot Iris',
      'Mapa sieci',
      'Priority support',
    ],
    popular: true,
  },
  {
    key: 'ENTERPRISE',
    label: 'Enterprise',
    price: 'Skontaktuj się',
    color: 'var(--wn)',
    features: [
      'Nielimitowani użytkownicy',
      'Wszystko z Pro +',
      'SLA 99.9%',
      'GPS Field Service',
      'Shadow AI Mode',
      'On-premise opcja',
      'Dedykowany CSM',
    ],
  },
] as const;

const MODULES = [
  { key: 'tickets', label: 'Tickety', icon: Briefcase, plan: 'STARTER' },
  { key: 'devices', label: 'Urządzenia', icon: Shield, plan: 'STARTER' },
  { key: 'sessions', label: 'Sesje pracy', icon: Zap, plan: 'STARTER' },
  { key: 'vault', label: 'Sejf haseł', icon: Shield, plan: 'STARTER' },
  { key: 'clients', label: 'Klienci (CRM)', icon: Briefcase, plan: 'STARTER' },
  { key: 'backups', label: 'Backupy', icon: Shield, plan: 'PRO' },
  { key: 'monitoring', label: 'Monitoring + Audit Score', icon: Zap, plan: 'PRO' },
  { key: 'mail', label: 'Mail Butler', icon: Briefcase, plan: 'PRO' },
  { key: 'agents', label: 'Desktop Asystent', icon: Zap, plan: 'PRO' },
  { key: 'ai.copilot', label: 'AI Copilot Iris', icon: Sparkles, plan: 'PRO' },
  { key: 'gps', label: 'GPS Field Service', icon: Zap, plan: 'ENTERPRISE' },
  { key: 'ai.shadow', label: 'Shadow AI Mode', icon: Sparkles, plan: 'ENTERPRISE' },
];

const TIER_ORDER = { STARTER: 0, PRO: 1, ENTERPRISE: 2 } as const;

export function PlanAndModulesPage() {
  const wsQ = useQuery<{ workspace: Workspace }>({
    queryKey: ['workspace', 'current'],
    queryFn: async () => (await api.get<{ workspace: Workspace }>('/workspaces/current')).data,
  });

  if (wsQ.isLoading) return <SkeletonCard />;
  const currentPlan = (wsQ.data?.workspace.plan ?? 'STARTER') as keyof typeof TIER_ORDER;
  const currentTier = TIER_ORDER[currentPlan];

  return (
    <div className="space-y-[var(--sp-5)]">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight">Plan i moduły</h1>
        <p className="text-[13px] text-[var(--tx3)] mt-0.5">
          Aktywny plan: <strong style={{ color: 'var(--pri)' }}>{currentPlan}</strong>
          {wsQ.data?.workspace.planExpiresAt &&
            ` · wygasa ${new Date(wsQ.data.workspace.planExpiresAt).toLocaleDateString('pl-PL')}`}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--sp-3)]">
        {PLANS.map((p) => {
          const isActive = p.key === currentPlan;
          return (
            <Card
              key={p.key}
              className="p-[var(--sp-5)] relative"
              style={isActive ? { borderColor: p.color, borderWidth: 2 } : undefined}
            >
              {(p as any).popular && !isActive && (
                <Badge variant="accent" className="absolute top-3 right-3">Polecany</Badge>
              )}
              {isActive && (
                <Badge variant="success" className="absolute top-3 right-3">Aktywny</Badge>
              )}
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[18px] font-semibold" style={{ color: p.color }}>{p.label}</span>
              </div>
              <div className="flex items-baseline gap-1 mb-[var(--sp-4)]">
                <span className="text-[28px] font-semibold">{p.price}</span>
                {p.price !== 'Skontaktuj się' && p.price !== '0' && (
                  <span className="text-[12px] text-[var(--tx3)]">zł / miesiąc</span>
                )}
                {p.price === '0' && <span className="text-[12px] text-[var(--tx3)]">zawsze darmowe</span>}
              </div>
              <ul className="space-y-2 mb-[var(--sp-4)]">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px]">
                    <Check size={12} className="mt-1 shrink-0" style={{ color: p.color }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {!isActive && (
                <Button variant={(p as any).popular ? 'primary' : 'ghost'} className="w-full" disabled>
                  {TIER_ORDER[p.key] < currentTier ? 'Downgrade' : 'Upgrade'} (Stripe Sprint 6)
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="px-[var(--sp-4)] py-[var(--sp-3)] border-b border-[var(--bd)]">
          <h2 className="text-[14px] font-semibold">Dostępne moduły</h2>
          <p className="text-[11px] text-[var(--tx3)] mt-0.5">
            Moduły odblokowane w Twoim planie są aktywne. Pozostałe wymagają upgrade'u.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-y divide-[var(--bd)]">
          {MODULES.map((m) => {
            const unlocked = TIER_ORDER[m.plan as keyof typeof TIER_ORDER] <= currentTier;
            const Icon = m.icon;
            return (
              <div
                key={m.key}
                className="flex items-center gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)]"
                style={{ opacity: unlocked ? 1 : 0.5 }}
              >
                <div
                  className="w-8 h-8 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
                  style={{
                    background: unlocked ? 'var(--ok-l)' : 'var(--sf-h)',
                    color: unlocked ? 'var(--ok)' : 'var(--tx3)',
                  }}
                >
                  <Icon size={14} />
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-medium">{m.label}</div>
                  <div className="text-[10px] text-[var(--tx3)] mt-0.5">
                    od planu {m.plan} · <code>{m.key}</code>
                  </div>
                </div>
                {unlocked ? (
                  <Badge variant="success">Aktywny</Badge>
                ) : (
                  <Badge variant="neutral">Zablokowany</Badge>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
