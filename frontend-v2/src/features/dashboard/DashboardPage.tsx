/**
 * /dashboard route entry — dispatcher między legacy a DS wariantem.
 *
 * Aktywacja DS: feature flag `?ui=new` (patrz @/lib/uiFlag).
 * Rollback: `?ui=legacy` lub usunięcie localStorage["sd-ui"].
 *
 * Legacy implementacja: DashboardPageLegacy.tsx (zachowana 1:1 z Fazy 2C).
 * DS implementacja:     DashboardPageNew.tsx (Faza 2D Batch 1).
 *
 * Po stabilizacji DS (Batch 2+) DashboardPageLegacy zostanie usunięty.
 */
import { useUiFlag } from '@/lib/uiFlag';
import { DashboardPageLegacy } from './DashboardPageLegacy';
import { DashboardPageNew } from './DashboardPageNew';

export function DashboardPage() {
  const variant = useUiFlag();
  return variant === 'new' ? <DashboardPageNew /> : <DashboardPageLegacy />;
}
