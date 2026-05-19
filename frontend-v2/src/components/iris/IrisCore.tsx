/**
 * IrisCore — InfraDesk shim wokół Silers DS visuals/IrisCore.
 *
 * Faza 2D Batch 1: poprzednia canvas implementacja (V1-port) została zastąpiona
 * kanoniczną SVG implementacją z DS. Stare API (state/status/size/score/alerts)
 * zachowane dla wstecznej kompatybilności — wszystkie callsites działają bez zmian.
 *
 * Mapowanie InfraDesk → DS:
 *   - state="error" lub status="critical"               → DS status="danger"
 *   - status="warning"                                   → DS status="warning"
 *   - status="offline"                                   → DS status="idle" (DS nie ma offline; idle = stan neutralny)
 *   - state="thinking" lub state="listening"             → DS status="processing"
 *   - state="speaking"/"active" lub aiActive=true        → DS status="active"
 *   - inne                                               → DS status="idle"
 *
 * Co znika z tej wersji:
 *   - score number w środku (canvas only — brak w DS)
 *   - alerts badge (▲ N ALERTS)
 *   - showOrbits / metrics — to było data-display, nie design tokens
 *
 * Te elementy są data-driven i należą do warstwy features — kompozycja DS IrisCore
 * + osobny <Gauge> + osobny <Badge> w warstwie konsumenta.
 *
 * Pełen canvas (~520 linii) zachowany w git history (commit Faza 2D Batch 1).
 */
import {
  IrisCore as DsIrisCore,
  IrisCoreButton as DsIrisCoreButton,
  type IrisSize as DsIrisSize,
  type IrisStatus as DsIrisStatus,
} from '@silers/design-system/visuals';

export type IrisStatus = 'ok' | 'warning' | 'critical' | 'offline';
export type IrisState =
  | 'idle'
  | 'thinking'
  | 'active'
  | 'speaking'
  | 'listening'
  | 'error';
export type IrisSize = 'sm' | 'md' | 'lg' | 'hero';

interface Props {
  size?: IrisSize;
  /** Legacy — score w canvas. W DS shim ignorowany (use <Gauge> separately). */
  score?: number;
  status?: IrisStatus;
  aiActive?: boolean;
  /** Legacy — alerts badge. W DS shim ignorowany (use <Badge> separately). */
  alerts?: number;
  state?: IrisState;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
  /** Legacy — V1 plasma asset, nieobsługiwany w SVG (pełna parametryzacja przez tokeny). */
  plasmaAsset?: string;
}

const SIZE_MAP: Record<IrisSize, DsIrisSize> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  hero: 'xl',
};

function mapToDsStatus(state: IrisState, status: IrisStatus, aiActive: boolean): DsIrisStatus {
  if (state === 'error') return 'danger';
  if (status === 'critical') return 'danger';
  if (status === 'warning') return 'warning';
  if (status === 'offline') return 'idle';
  if (state === 'thinking' || state === 'listening') return 'processing';
  if (state === 'speaking' || state === 'active' || aiActive) return 'active';
  return 'idle';
}

export function IrisCore({
  size = 'md',
  status = 'ok',
  aiActive = false,
  state = 'idle',
  onClick,
  ariaLabel,
  className,
  // Legacy props — explicit destructure, NIE propagujemy do DS.
  score: _score,
  alerts: _alerts,
  plasmaAsset: _plasmaAsset,
}: Props) {
  void _score; void _alerts; void _plasmaAsset;
  const dsStatus = mapToDsStatus(state, status, aiActive);
  const dsSize = SIZE_MAP[size];

  if (onClick) {
    return (
      <DsIrisCoreButton
        status={dsStatus}
        size={dsSize}
        aria-label={ariaLabel ?? 'Rdzeń AI Iris'}
        className={className}
        onClick={onClick}
      />
    );
  }
  return (
    <DsIrisCore
      status={dsStatus}
      size={dsSize}
      aria-label={ariaLabel ?? 'Rdzeń AI Iris'}
      className={className}
    />
  );
}

export default IrisCore;
