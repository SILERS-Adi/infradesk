/**
 * PlanAndModulesPage — central workspace configurator ("Plan i moduły").
 *
 * 2-column layout: left = config editing, right = change preview.
 * No auto-save. Changes are previewed → confirmed → applied.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Building2, Shield, Headphones, Monitor, Ticket, FileText, Package, Car, Sparkles,
  Layers, Check, Loader2, AlertTriangle, Info, Plus, Minus, ArrowRight, RefreshCw,
  Eye, EyeOff, UserX, Lock, Play, X, ChevronRight,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import { workspaceConfigApi, type ConfigChanges, type ModuleAction, type PreviewResult } from '../../api/workspaceConfig';
import { useTheme } from '../../store/themeStore';

// ── Constants ─────────────────────────────────────────────────────

const ORG_TYPES = [
  { id: 'MSP' as const, icon: Building2, label: 'Firma IT / MSP', desc: 'Świadczę obsługę IT dla klientów', color: '#F59E0B' },
  { id: 'INTERNAL_IT' as const, icon: Shield, label: 'Wewnętrzne IT', desc: 'Zarządzam IT we własnej firmie', color: '#8B5CF6' },
  { id: 'CLIENT' as const, icon: Headphones, label: 'Klient', desc: 'Korzystam z zewnętrznej obsługi IT', color: '#3B82F6' },
];

const ROUTING_MODES = [
  { id: 'internal_only', label: 'Obsługa wewnętrzna', desc: 'Zgłoszenia trafiają do mojego zespołu' },
  { id: 'send_to_default_provider', label: 'Wyślij do firmy IT', desc: 'Zgłoszenia automatycznie trafiają do firmy IT' },
  { id: 'ask_each_time', label: 'Pytaj przy każdym', desc: 'Użytkownik decyduje przy każdym zgłoszeniu' },
];

const MODULE_DEFS = [
  { key: 'INFRASTRUCTURE', label: 'Infrastruktura IT', desc: 'Urządzenia, agenty, backup, monitoring, logi aktywności', icon: Monitor, color: '#8B5CF6' },
  { key: 'SERVICE_DESK', label: 'Service Desk', desc: 'Zgłoszenia, zadania, CRM, sesje pracy, delegacje', icon: Ticket, color: '#3B82F6' },
  { key: 'INVOICING', label: 'Fakturowanie', desc: 'Dokumenty, kontrahenci, produkty, płatności, raporty', icon: FileText, color: '#10B981' },
  { key: 'PACKAGING', label: 'Pakowanie', desc: 'Fulfillment, Allegro, kompletacja, kurierzy', icon: Package, color: '#F59E0B' },
  { key: 'SKP', label: 'SKP', desc: 'Stacja kontroli pojazdów — pojazdy, przeglądy', icon: Car, color: '#EF4444' },
  { key: 'AI', label: 'Asystent AI', desc: 'Głos, sugestie rozwiązań, auto-tickety', icon: Sparkles, color: '#6366F1' },
];

const STATE_BADGES: Record<string, { label: string; color: 'green' | 'yellow' | 'gray' | 'blue' | 'orange' | 'purple' | 'red' }> = {
  ACTIVE: { label: 'Aktywny', color: 'green' },
  TRIAL: { label: 'Wersja testowa', color: 'yellow' },
  INACTIVE: { label: 'Nieaktywny', color: 'gray' },
  LIMITED: { label: 'Ograniczony', color: 'orange' },
  READONLY: { label: 'Tylko odczyt', color: 'blue' },
  MANAGED_BY_PROVIDER: { label: 'Zarządzany przez IT', color: 'purple' },
  EXPIRED: { label: 'Wygasł', color: 'red' },
};

const BILLING_OPTIONS = [
  { id: 'SELF' as const, label: 'Samodzielnie', desc: 'Płacę za platformę samodzielnie' },
  { id: 'PROVIDER' as const, label: 'Partner IT', desc: 'Abonament opłaca moja firma IT' },
];

const MANAGED_OPTIONS = [
  { id: 'SELF' as const, label: 'Samodzielnie', desc: 'Zarządzam kontem samodzielnie' },
  { id: 'PROVIDER' as const, label: 'Partner IT', desc: 'Konto zarządzane przez firmę IT' },
];

const DETACH_OPTIONS = [
  { id: 'ALLOWED' as const, label: 'Dozwolone', desc: 'Mogę odłączyć się w każdej chwili' },
  { id: 'APPROVAL_REQUIRED' as const, label: 'Za zgodą', desc: 'Wymagana zgoda partnera IT' },
  { id: 'BLOCKED' as const, label: 'Zablokowane', desc: 'Nie mogę odłączyć się samodzielnie' },
];

// ── Module action buttons per current state ──

function getAvailableActions(state: string, orgType: string): { action: ModuleAction; label: string; icon: typeof Plus }[] {
  const actions: { action: ModuleAction; label: string; icon: typeof Plus }[] = [];
  switch (state) {
    case 'ACTIVE':
      actions.push({ action: 'deactivate', label: 'Wyłącz', icon: EyeOff });
      actions.push({ action: 'set_readonly', label: 'Tryb podglądu', icon: Eye });
      if (orgType === 'CLIENT') actions.push({ action: 'delegate_to_provider', label: 'Przekaż providerowi', icon: ArrowRight });
      break;
    case 'INACTIVE':
    case 'EXPIRED':
      actions.push({ action: 'activate', label: 'Aktywuj', icon: Plus });
      actions.push({ action: 'start_trial', label: 'Test 14 dni', icon: Play });
      break;
    case 'TRIAL':
      actions.push({ action: 'activate', label: 'Aktywuj', icon: Plus });
      actions.push({ action: 'deactivate', label: 'Wyłącz', icon: EyeOff });
      break;
    case 'READONLY':
      actions.push({ action: 'activate', label: 'Aktywuj', icon: Plus });
      actions.push({ action: 'deactivate', label: 'Wyłącz', icon: EyeOff });
      break;
    case 'MANAGED_BY_PROVIDER':
      actions.push({ action: 'activate', label: 'Przejmij zarządzanie', icon: RefreshCw });
      break;
    case 'LIMITED':
      actions.push({ action: 'activate', label: 'Pełna aktywacja', icon: Plus });
      actions.push({ action: 'deactivate', label: 'Wyłącz', icon: EyeOff });
      break;
    default:
      actions.push({ action: 'activate', label: 'Aktywuj', icon: Plus });
  }
  return actions;
}

// ── Page Component ────────────────────────────────────────────────

export default function PlanAndModulesPage() {
  const queryClient = useQueryClient();
  const { resolved } = useTheme();
  const isLight = resolved === 'light';
  const { orgType: currentOrgType, workspace } = useWorkspaceContext();

  // Load current config
  const { data: config, isLoading } = useQuery({
    queryKey: ['workspace-config'],
    queryFn: workspaceConfigApi.getConfig,
  });

  // Local form state (draft, not saved)
  const [draft, setDraft] = useState<ConfigChanges>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset draft when config loads
  useEffect(() => {
    if (config) setDraft({});
  }, [config]);

  // Derived "effective" values
  const effectiveOrgType = draft.orgType ?? config?.orgType ?? 'INTERNAL_IT';
  const effectiveRouting = draft.ticketRoutingMode ?? config?.ticketRoutingMode ?? 'internal_only';
  const effectiveBilling = draft.platformBillingMode ?? config?.platformBillingMode ?? 'SELF';
  const effectiveManaged = draft.accountManagedBy ?? config?.accountManagedBy ?? 'SELF';
  const effectiveDetach = draft.detachPolicy ?? config?.detachPolicy ?? 'ALLOWED';

  // Module states (merged draft actions with current)
  const getEffectiveModuleState = (moduleKey: string): string => {
    const draftAction = draft.modules?.find(m => m.moduleKey === moduleKey);
    if (draftAction) {
      const map: Record<string, string> = {
        activate: 'ACTIVE', deactivate: 'INACTIVE', start_trial: 'TRIAL',
        delegate_to_provider: 'MANAGED_BY_PROVIDER', set_readonly: 'READONLY', set_limited: 'LIMITED',
      };
      return map[draftAction.action] ?? 'INACTIVE';
    }
    return config?.modules?.find((m: any) => m.moduleKey === moduleKey)?.state ?? 'INACTIVE';
  };

  const hasChanges = Object.keys(draft).length > 0;

  // Debounced preview
  const fetchPreview = useCallback(async (changes: ConfigChanges) => {
    if (Object.keys(changes).length === 0) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await workspaceConfigApi.preview(changes);
      setPreview(result);
    } catch {
      // Ignore preview errors silently
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPreview(draft), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [draft, fetchPreview]);

  // Apply mutation
  const applyMutation = useMutation({
    mutationFn: (changes: ConfigChanges) => workspaceConfigApi.apply(changes),
    onSuccess: () => {
      toast.success('Konfiguracja została zaktualizowana');
      queryClient.invalidateQueries({ queryKey: ['workspace-config'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setDraft({});
      setPreview(null);
      setShowConfirm(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? 'Błąd zapisu konfiguracji');
    },
  });

  // Update draft helper
  const updateDraft = (patch: Partial<ConfigChanges>) => {
    setDraft(prev => ({ ...prev, ...patch }));
  };

  const addModuleAction = (moduleKey: string, action: ModuleAction) => {
    setDraft(prev => {
      const existing = prev.modules?.filter(m => m.moduleKey !== moduleKey) ?? [];
      return { ...prev, modules: [...existing, { moduleKey, action }] };
    });
  };

  if (isLoading) {
    return (
      <div style={{ padding: 32 }}>
        <PageHeader title="Plan i moduły" />
        <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </div>
    );
  }

  const cardBg = isLight ? '#fff' : 'var(--bg-card)';
  const borderColor = 'var(--border)';

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400 }}>
      <PageHeader title="Plan i moduły" />

      {/* ── Karta aktualnej konfiguracji ── */}
      <div style={{
        background: isLight ? 'linear-gradient(135deg, #F8FAFC, #EEF2FF)' : 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.04))',
        border: `1px solid ${borderColor}`,
        borderRadius: 16, padding: '24px 28px', marginBottom: 32,
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 16 }}>Aktualna konfiguracja</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <InfoItem label="Typ organizacji" value={ORG_TYPES.find(o => o.id === config?.orgType)?.label ?? config?.orgType} />
          <InfoItem label="Routing zgłoszeń" value={ROUTING_MODES.find(r => r.id === config?.ticketRoutingMode)?.label ?? config?.ticketRoutingMode} />
          <InfoItem label="Kto płaci" value={config?.platformBillingMode === 'PROVIDER' ? 'Partner IT' : 'Samodzielnie'} />
          <InfoItem label="Zarządzanie kontem" value={config?.accountManagedBy === 'PROVIDER' ? 'Partner IT' : 'Samodzielnie'} />
          <InfoItem label="Plan" value={config?.plan ?? 'FREE'} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--tm)', marginBottom: 4 }}>Aktywne moduły</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {config?.modules?.filter((m: any) => ['ACTIVE', 'TRIAL'].includes(m.state)).map((m: any) => (
                <Badge key={m.moduleKey} color="green">{MODULE_DEFS.find(d => d.key === m.moduleKey)?.label ?? m.moduleKey}</Badge>
              ))}
              {(!config?.modules || config.modules.length === 0) && (
                <span style={{ fontSize: 12, color: 'var(--tm)' }}>Brak danych — uruchom migrację</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 2-kolumnowy layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 32, alignItems: 'start' }}>

        {/* ── LEWA KOLUMNA — Edycja ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* Sekcja A: Typ organizacji */}
          <Section title="Typ organizacji">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {ORG_TYPES.map(o => {
                const active = effectiveOrgType === o.id;
                return (
                  <SelectCard key={o.id} active={active} color={o.color} isLight={isLight}
                    onClick={() => updateDraft({ orgType: o.id })}>
                    <o.icon size={28} style={{ color: active ? o.color : 'var(--tm)', marginBottom: 8 }} />
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t)' }}>{o.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 4 }}>{o.desc}</div>
                  </SelectCard>
                );
              })}
            </div>
          </Section>

          {/* Sekcja B: Routing zgłoszeń */}
          {effectiveOrgType !== 'MSP' && (
            <Section title="Routing zgłoszeń">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {ROUTING_MODES.map(r => {
                  const active = effectiveRouting === r.id;
                  const disabled = effectiveOrgType === 'CLIENT' && r.id !== 'send_to_default_provider';
                  return (
                    <SelectCard key={r.id} active={active} color="#6366F1" isLight={isLight}
                      onClick={() => !disabled && updateDraft({ ticketRoutingMode: r.id })}
                      style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t)' }}>{r.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 4 }}>{r.desc}</div>
                      {disabled && <div style={{ fontSize: 10, color: '#F59E0B', marginTop: 6 }}>Wymagane dla typu Klient</div>}
                    </SelectCard>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Sekcja C: Provider IT */}
          {(effectiveOrgType === 'CLIENT' || (effectiveOrgType === 'INTERNAL_IT' && effectiveRouting === 'send_to_default_provider')) && (
            <Section title="Partner IT">
              {config?.providerRelations?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {config.providerRelations.map((r: any) => (
                    <div key={r.id} style={{
                      padding: '12px 16px', borderRadius: 10,
                      background: r.isDefaultHelpdeskProvider ? (isLight ? 'rgba(79,70,229,0.06)' : 'rgba(99,102,241,0.08)') : cardBg,
                      border: `1px solid ${r.isDefaultHelpdeskProvider ? 'rgba(99,102,241,0.3)' : borderColor}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t)' }}>{r.providerWorkspace.name}</div>
                        {r.isDefaultHelpdeskProvider && <Badge color="indigo">Domyślny provider</Badge>}
                      </div>
                      {r.canReceiveTickets && <Badge color="green">Przyjmuje zgłoszenia</Badge>}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '16px 20px', borderRadius: 10,
                  background: isLight ? '#FEF3C7' : 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <AlertTriangle size={18} style={{ color: '#F59E0B' }} />
                  <span style={{ fontSize: 13, color: 'var(--t)' }}>Brak powiązanej firmy IT. Typ CLIENT wymaga aktywnej relacji.</span>
                </div>
              )}
            </Section>
          )}

          {/* Sekcja D: Billing i zarządzanie */}
          {effectiveOrgType === 'CLIENT' && (
            <>
              <Section title="Kto płaci abonament">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {BILLING_OPTIONS.map(b => (
                    <SelectCard key={b.id} active={effectiveBilling === b.id} color="#10B981" isLight={isLight}
                      onClick={() => updateDraft({ platformBillingMode: b.id })}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{b.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 4 }}>{b.desc}</div>
                    </SelectCard>
                  ))}
                </div>
              </Section>

              <Section title="Zarządzanie kontem">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {MANAGED_OPTIONS.map(m => (
                    <SelectCard key={m.id} active={effectiveManaged === m.id} color="#8B5CF6" isLight={isLight}
                      onClick={() => updateDraft({ accountManagedBy: m.id })}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 4 }}>{m.desc}</div>
                    </SelectCard>
                  ))}
                </div>
              </Section>

              <Section title="Polityka odłączenia">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {DETACH_OPTIONS.map(d => (
                    <SelectCard key={d.id} active={effectiveDetach === d.id} color="#EF4444" isLight={isLight}
                      onClick={() => updateDraft({ detachPolicy: d.id })}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{d.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 4 }}>{d.desc}</div>
                    </SelectCard>
                  ))}
                </div>
              </Section>
            </>
          )}

          {/* Sekcja E: Moduły */}
          <Section title="Moduły">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              {MODULE_DEFS.map(mod => {
                const state = getEffectiveModuleState(mod.key);
                const badge = STATE_BADGES[state] ?? STATE_BADGES.INACTIVE;
                const actions = getAvailableActions(state, effectiveOrgType);
                return (
                  <div key={mod.key} style={{
                    padding: '20px 22px', borderRadius: 14,
                    background: cardBg,
                    border: `1px solid ${state === 'ACTIVE' || state === 'TRIAL' ? `${mod.color}33` : borderColor}`,
                    display: 'flex', flexDirection: 'column', gap: 10,
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10,
                          background: `${mod.color}18`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <mod.icon size={18} style={{ color: mod.color }} />
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t)' }}>{mod.label}</div>
                      </div>
                      <Badge color={badge.color}>{badge.label}</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--tm)', lineHeight: 1.5 }}>{mod.desc}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {actions.map(a => (
                        <button key={a.action} onClick={() => addModuleAction(mod.key, a.action)}
                          style={{
                            padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                            border: `1px solid ${borderColor}`, background: 'transparent', color: 'var(--t)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = isLight ? '#F1F5F9' : 'rgba(255,255,255,0.05)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <a.icon size={12} />
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Sekcja F: Plan */}
          <Section title="Aktualny plan">
            <div style={{
              padding: '16px 20px', borderRadius: 12, background: cardBg,
              border: `1px solid ${borderColor}`,
            }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--t)' }}>{config?.plan ?? 'FREE'}</div>
              <div style={{ fontSize: 12, color: 'var(--tm)', marginTop: 4 }}>
                Zmiana planu dostępna w konfiguratorze cenowym
              </div>
            </div>
          </Section>
        </div>

        {/* ── PRAWA KOLUMNA — Preview zmian ── */}
        <div style={{ position: 'sticky', top: 24 }}>
          <div style={{
            borderRadius: 16, padding: '24px 22px',
            background: cardBg,
            border: `1px solid ${borderColor}`,
            minHeight: 200,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Eye size={18} />
              Podgląd zmian
            </h3>

            {!hasChanges && (
              <div style={{ fontSize: 13, color: 'var(--tm)', textAlign: 'center', padding: '32px 0' }}>
                Zmień konfigurację po lewej stronie, aby zobaczyć podgląd skutków
              </div>
            )}

            {previewLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--tm)' }} />
              </div>
            )}

            {preview && !previewLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Biznesowe opisy */}
                {preview.summary.map((s, i) => (
                  <SummaryItem key={i} icon={s.icon} text={s.text} isLight={isLight} />
                ))}

                {/* Blockers */}
                {preview.blockers.map((b, i) => (
                  <div key={`b-${i}`} style={{
                    padding: '10px 14px', borderRadius: 8, fontSize: 12,
                    background: isLight ? '#FEE2E2' : 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#EF4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <X size={14} /> {b}
                  </div>
                ))}

                {/* Warnings */}
                {preview.warnings.map((w, i) => (
                  <div key={`w-${i}`} style={{
                    padding: '10px 14px', borderRadius: 8, fontSize: 12,
                    background: isLight ? '#FEF3C7' : 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <AlertTriangle size={14} /> {w}
                  </div>
                ))}

                {/* Affected users */}
                {preview.affectedUsers > 0 && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 8, fontSize: 12,
                    background: isLight ? '#FFF7ED' : 'rgba(249,115,22,0.08)',
                    border: '1px solid rgba(249,115,22,0.2)',
                    display: 'flex', alignItems: 'center', gap: 8, color: 'var(--t)',
                  }}>
                    <UserX size={14} style={{ color: '#F97316' }} />
                    {preview.affectedUsers} użytkowników zostanie dotkniętych zmianami
                  </div>
                )}
              </div>
            )}

            {/* Buttons */}
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Button
                variant="primary"
                disabled={!hasChanges || applyMutation.isPending || (preview?.blockers?.length ?? 0) > 0}
                loading={applyMutation.isPending}
                onClick={() => setShowConfirm(true)}
                style={{ width: '100%' }}
              >
                Zastosuj zmiany
              </Button>
              {hasChanges && (
                <Button variant="ghost" onClick={() => { setDraft({}); setPreview(null); }} style={{ width: '100%' }}>
                  Anuluj
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Confirm Dialog ── */}
      {showConfirm && preview && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowConfirm(false)}>
          <div style={{
            background: cardBg, borderRadius: 20, padding: '32px 36px',
            maxWidth: 520, width: '100%', maxHeight: '80vh', overflow: 'auto',
            border: `1px solid ${borderColor}`,
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--t)', marginBottom: 20 }}>
              Potwierdzenie zmian
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {preview.summary.map((s, i) => (
                <SummaryItem key={i} icon={s.icon} text={s.text} isLight={isLight} />
              ))}
            </div>

            {preview.affectedUsers > 0 && (
              <div style={{
                padding: '12px 16px', borderRadius: 10, marginBottom: 20,
                background: isLight ? '#FEF3C7' : 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.3)',
                fontSize: 13, color: 'var(--t)', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <AlertTriangle size={16} style={{ color: '#F59E0B' }} />
                {preview.affectedUsers} użytkowników zostanie dotkniętych zmianami
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setShowConfirm(false)}>Anuluj</Button>
              <Button variant="primary" loading={applyMutation.isPending}
                onClick={() => applyMutation.mutate(draft)}>
                Potwierdzam zmiany
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 12 }}>{title}</h3>
      {children}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--tm)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{value ?? '—'}</div>
    </div>
  );
}

function SelectCard({ active, color, isLight, onClick, children, style }: {
  active: boolean; color: string; isLight: boolean;
  onClick: () => void; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div onClick={onClick} style={{
      padding: '16px 18px', borderRadius: 12, cursor: 'pointer',
      background: active
        ? (isLight ? `${color}0A` : `${color}14`)
        : (isLight ? '#fff' : 'var(--bg-card)'),
      border: `2px solid ${active ? color : 'var(--border)'}`,
      transition: 'all 0.2s',
      ...style,
    }}>
      {active && <Check size={16} style={{ color, position: 'absolute', top: 10, right: 10 }} />}
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

function SummaryItem({ icon, text, isLight }: { icon: string; text: string; isLight: boolean }) {
  const colors: Record<string, { bg: string; border: string; icon: React.ReactNode }> = {
    '+': { bg: isLight ? '#F0FDF4' : 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.2)', icon: <Plus size={14} style={{ color: '#22C55E' }} /> },
    '-': { bg: isLight ? '#FEF2F2' : 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)', icon: <Minus size={14} style={{ color: '#EF4444' }} /> },
    '~': { bg: isLight ? '#FFFBEB' : 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)', icon: <RefreshCw size={14} style={{ color: '#F59E0B' }} /> },
    'info': { bg: isLight ? '#EFF6FF' : 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.2)', icon: <Info size={14} style={{ color: '#3B82F6' }} /> },
  };
  const c = colors[icon] ?? colors['info'];
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8, fontSize: 12, color: 'var(--t)',
      background: c.bg, border: `1px solid ${c.border}`,
      display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.5,
    }}>
      {c.icon}
      {text}
    </div>
  );
}
