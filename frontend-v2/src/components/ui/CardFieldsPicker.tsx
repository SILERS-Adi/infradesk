import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LayoutGrid, Pin, RotateCcw, X, Check } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Reusable "field picker + presets" hook for visual (card) views.
//
// Mirrors the API of useColumns (ColumnPicker) but is tailored to card
// layouts: no drag-reorder, since cards have a designed layout — only
// visibility toggles and presets.
//
// Consumers: Tickets (now), Tasks / Orders / CRM can adopt later.
// ---------------------------------------------------------------------------

export interface CardField {
  /** Unique stable id — used as storage key and in visibleFields Set. */
  id: string;
  /** Human label shown in picker. */
  label: string;
  /** If true, always visible — can't be toggled off. */
  pinned?: boolean;
}

export interface CardPreset {
  /** Machine id, e.g. 'compact' | 'standard' | 'detailed'. */
  id: string;
  /** Human label shown on preset button. */
  label: string;
  /** Optional short hint shown under label. */
  hint?: string;
  /** Full list of field ids included in this preset. Pinned fields are
   *  auto-added if missing. */
  fields: string[];
}

interface StoredState {
  version: number;
  fields: string[];
  preset: string; // preset id OR 'custom'
}

interface UseCardFieldsOptions {
  tableKey: string;
  fields: CardField[];
  presets: CardPreset[];
  /** Which preset to use on first visit. Defaults to first preset. */
  defaultPreset?: string;
}

interface UseCardFieldsReturn {
  /** Set of field ids currently visible. */
  visibleFields: Set<string>;
  /** Currently selected preset id, or 'custom'. */
  activePreset: string;
  /** Button + popover to drop into a toolbar. */
  pickerButton: ReactNode;
  /** Programmatically reset to default preset. */
  reset: () => void;
}

const STORAGE_PREFIX = 'idesk-cardfields-';
const STORAGE_VERSION = 1;

function storageKey(tableKey: string): string {
  return `${STORAGE_PREFIX}${tableKey}`;
}

function readStored(tableKey: string, fields: CardField[]): StoredState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(tableKey));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const s = parsed as Partial<StoredState>;
    if (s.version !== STORAGE_VERSION) return null;
    if (!Array.isArray(s.fields) || typeof s.preset !== 'string') return null;
    const known = new Set(fields.map((f) => f.id));
    const clean = s.fields.filter((id) => known.has(id));
    return { version: STORAGE_VERSION, fields: clean, preset: s.preset };
  } catch {
    return null;
  }
}

function writeStored(tableKey: string, state: StoredState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(tableKey), JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function clearStored(tableKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(tableKey));
  } catch {
    // ignore
  }
}

/** Ensure pinned fields are always included; de-dupe. */
function enforceInvariants(fieldIds: string[], fields: CardField[]): string[] {
  const pinned = fields.filter((f) => f.pinned).map((f) => f.id);
  const set = new Set<string>(pinned);
  for (const id of fieldIds) set.add(id);
  // Preserve declared order
  return fields.filter((f) => set.has(f.id)).map((f) => f.id);
}

function buildPresetState(
  preset: CardPreset,
  fields: CardField[],
): StoredState {
  return {
    version: STORAGE_VERSION,
    fields: enforceInvariants(preset.fields, fields),
    preset: preset.id,
  };
}

// ---------------------------------------------------------------------------
// Popover
// ---------------------------------------------------------------------------

interface DropdownProps {
  fields: CardField[];
  presets: CardPreset[];
  state: StoredState;
  onChange: (next: StoredState) => void;
  onReset: () => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

function Dropdown({
  fields,
  presets,
  state,
  onChange,
  onReset,
  onClose,
  anchorRect,
}: DropdownProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const visibleSet = useMemo(() => new Set(state.fields), [state.fields]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onClick(e: MouseEvent) {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => window.addEventListener('mousedown', onClick), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      window.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  function toggle(id: string) {
    const field = fields.find((f) => f.id === id);
    if (!field || field.pinned) return;
    const next = new Set(state.fields);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const nextFields = enforceInvariants(Array.from(next), fields);
    onChange({ version: STORAGE_VERSION, fields: nextFields, preset: 'custom' });
  }

  function applyPreset(p: CardPreset) {
    onChange(buildPresetState(p, fields));
  }

  // Position: below anchor, right-aligned, clamped to viewport.
  const width = 320;
  const margin = 8;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  let left = anchorRect.right - width;
  if (left < margin) left = margin;
  if (left + width > vw - margin) left = vw - width - margin;
  const top = anchorRect.bottom + 6;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Konfiguracja pól karty"
      className="fixed z-[1000] rounded-[var(--r-m)] border shadow-2"
      style={{
        top,
        left,
        width,
        maxHeight: 520,
        background: 'var(--sf)',
        borderColor: 'var(--bd)',
        color: 'var(--tx)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'var(--bd)' }}
      >
        <div className="flex items-center gap-2 text-[12px] font-semibold">
          <LayoutGrid className="h-3.5 w-3.5" />
          Konfiguruj karty
        </div>
        <button
          type="button"
          aria-label="Zamknij"
          className="text-tx3 hover:text-tx"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Preset buttons */}
      <div
        className="px-3 py-2 border-b grid grid-cols-3 gap-1.5"
        style={{ borderColor: 'var(--bd)' }}
      >
        {presets.map((p) => {
          const active = state.preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              className={cn(
                'flex flex-col items-start gap-0.5 px-2 py-1.5 rounded-[6px] border text-left transition-colors',
                active
                  ? 'border-[color:var(--pri)] text-tx'
                  : 'border-bd text-tx2 hover:bg-sf-h hover:text-tx',
              )}
              style={active ? { background: 'color-mix(in srgb, var(--pri) 12%, transparent)' } : undefined}
            >
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold">
                {active && <Check className="h-3 w-3" />}
                {p.label}
              </span>
              {p.hint && <span className="text-[10px] text-tx3 leading-tight">{p.hint}</span>}
            </button>
          );
        })}
        {state.preset === 'custom' && (
          <div className="col-span-3 text-[10px] text-tx3 italic">
            Własny zestaw — zmiany zapisane lokalnie
          </div>
        )}
      </div>

      {/* Field list */}
      <div className="px-2 py-2 overflow-y-auto" style={{ maxHeight: 300 }}>
        {fields.map((f) => {
          const visible = visibleSet.has(f.id);
          return (
            <div
              key={f.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-[6px] hover:bg-sf-h"
            >
              {f.pinned ? (
                <span
                  className="h-4 w-4 inline-flex items-center justify-center text-tx3"
                  aria-hidden
                  title="Pole przypięte — zawsze widoczne"
                >
                  <Pin className="h-3 w-3" />
                </span>
              ) : (
                <span className="h-4 w-4" />
              )}
              <label
                className={cn(
                  'flex-1 flex items-center gap-2 text-[12px] min-w-0',
                  f.pinned ? 'text-tx3' : 'text-tx cursor-pointer',
                )}
              >
                <input
                  type="checkbox"
                  checked={visible}
                  disabled={f.pinned}
                  onChange={() => toggle(f.id)}
                  className="accent-[color:var(--pri)]"
                />
                <span className="truncate">{f.label}</span>
              </label>
              {f.pinned && (
                <span
                  className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-bd text-tx3"
                  style={{ background: 'var(--sf-h)' }}
                >
                  Zawsze
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div
        className="flex items-center justify-between gap-2 px-3 py-2 border-t"
        style={{ borderColor: 'var(--bd)' }}
      >
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          Zamknij
        </Button>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCardFields({
  tableKey,
  fields,
  presets,
  defaultPreset,
}: UseCardFieldsOptions): UseCardFieldsReturn {
  const defaultPresetId = defaultPreset ?? presets[0]?.id ?? 'standard';

  function buildDefault(): StoredState {
    const p = presets.find((x) => x.id === defaultPresetId) ?? presets[0];
    if (!p) {
      return {
        version: STORAGE_VERSION,
        fields: enforceInvariants([], fields),
        preset: 'custom',
      };
    }
    return buildPresetState(p, fields);
  }

  const [state, setState] = useState<StoredState>(() => {
    const stored = readStored(tableKey, fields);
    if (!stored) return buildDefault();
    return {
      version: STORAGE_VERSION,
      fields: enforceInvariants(stored.fields, fields),
      preset: stored.preset,
    };
  });

  // Persist on change.
  useEffect(() => {
    writeStored(tableKey, state);
  }, [tableKey, state]);

  const reset = useCallback(() => {
    clearStored(tableKey);
    setState(buildDefault());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey]);

  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const openPicker = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect() ?? null;
    setAnchorRect(rect);
    setOpen(true);
  }, []);

  const visibleFields = useMemo(() => new Set(state.fields), [state.fields]);

  const pickerButton = (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--r-s)] text-[12px] font-medium text-tx2 hover:bg-sf-h hover:text-tx press transition-colors border border-bd bg-sf2"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Konfiguruj karty
      </button>
      {open && anchorRect && (
        <Dropdown
          fields={fields}
          presets={presets}
          state={state}
          onChange={(next) => setState(next)}
          onReset={() => reset()}
          onClose={() => setOpen(false)}
          anchorRect={anchorRect}
        />
      )}
    </>
  );

  return { visibleFields, activePreset: state.preset, pickerButton, reset };
}
