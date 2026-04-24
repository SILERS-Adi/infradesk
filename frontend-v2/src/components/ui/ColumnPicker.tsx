import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Columns3, GripVertical, Pin, RotateCcw, X } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from './Button';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Column<T> {
  /** Unique column key. Must be stable across renders and deploys. */
  id: string;
  /** Human label shown in the picker and in the table header. */
  label: string;
  /** If true, the column can't be hidden or reordered. It stays leftmost. */
  pinned?: boolean;
  /** If false, column is hidden by default. Defaults to true. */
  defaultVisible?: boolean;
  /** Optional CSS width (e.g. "120px" or "8rem"). */
  width?: string;
  /** Optional cell renderer. If omitted, the table is expected to render. */
  render?: (row: T) => ReactNode;
}

interface StoredState {
  version: number;
  order: string[];
  hidden: string[];
}

interface UseColumnsOptions<T> {
  tableKey: string;
  columns: Column<T>[];
}

interface UseColumnsReturn<T> {
  visibleColumns: Column<T>[];
  pickerButton: ReactNode;
  resetColumns: () => void;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'idesk-columns-';
const STORAGE_VERSION = 1;

function storageKey(tableKey: string): string {
  return `${STORAGE_PREFIX}${tableKey}`;
}

function columnSetSignature<T>(columns: Column<T>[]): string {
  return columns
    .map((c) => c.id)
    .slice()
    .sort()
    .join('|');
}

function readStored<T>(tableKey: string, columns: Column<T>[]): StoredState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(tableKey));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const s = parsed as Partial<StoredState>;
    if (s.version !== STORAGE_VERSION) return null;
    if (!Array.isArray(s.order) || !Array.isArray(s.hidden)) return null;
    // If the column set changed (new/removed ids), invalidate gracefully.
    const known = new Set(columns.map((c) => c.id));
    const storedIds = new Set(s.order);
    // Every stored order id must correspond to a real column.
    for (const id of s.order) {
      if (!known.has(id)) return null;
    }
    // Every current column must appear in stored order (so new columns
    // don't silently slip to the end without user noticing).
    for (const c of columns) {
      if (!storedIds.has(c.id)) return null;
    }
    return { version: STORAGE_VERSION, order: s.order, hidden: s.hidden.filter((id) => known.has(id)) };
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

// ---------------------------------------------------------------------------
// Default state builder — pinned columns first, then declared order.
// ---------------------------------------------------------------------------

function buildDefaultState<T>(columns: Column<T>[]): StoredState {
  const pinned = columns.filter((c) => c.pinned).map((c) => c.id);
  const rest = columns.filter((c) => !c.pinned).map((c) => c.id);
  const hidden = columns
    .filter((c) => !c.pinned && c.defaultVisible === false)
    .map((c) => c.id);
  return {
    version: STORAGE_VERSION,
    order: [...pinned, ...rest],
    hidden,
  };
}

// Enforce invariants: pinned columns always visible, always first (in
// declared pinned order).
function enforceInvariants<T>(state: StoredState, columns: Column<T>[]): StoredState {
  const byId = new Map(columns.map((c) => [c.id, c]));
  const pinnedIds = columns.filter((c) => c.pinned).map((c) => c.id);
  const pinnedSet = new Set(pinnedIds);
  // Remove pinned from stored order (they will be prepended).
  const nonPinnedOrder = state.order.filter((id) => byId.has(id) && !pinnedSet.has(id));
  const order = [...pinnedIds, ...nonPinnedOrder];
  const hidden = state.hidden.filter((id) => byId.has(id) && !pinnedSet.has(id));
  return { version: STORAGE_VERSION, order, hidden };
}

// ---------------------------------------------------------------------------
// Sortable row (drag handle + checkbox + label)
// ---------------------------------------------------------------------------

interface RowProps {
  id: string;
  label: string;
  visible: boolean;
  pinned: boolean;
  onToggle: (id: string) => void;
}

function PickerRow({ id, label, visible, pinned, onToggle }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: pinned,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  } as const;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-[6px] select-none',
        isDragging ? 'bg-sf-h' : 'hover:bg-sf-h',
      )}
    >
      {pinned ? (
        <span
          className="h-4 w-4 inline-flex items-center justify-center text-tx3"
          aria-hidden
          title="Kolumna przypięta"
        >
          <Pin className="h-3 w-3" />
        </span>
      ) : (
        <button
          type="button"
          aria-label={`Przeciągnij aby zmienić kolejność: ${label}`}
          className="h-4 w-4 inline-flex items-center justify-center text-tx3 hover:text-tx cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      <label
        className={cn(
          'flex-1 flex items-center gap-2 text-[12px] min-w-0',
          pinned ? 'text-tx3' : 'text-tx cursor-pointer',
        )}
      >
        <input
          type="checkbox"
          checked={visible}
          disabled={pinned}
          onChange={() => onToggle(id)}
          className="accent-[color:var(--pri)]"
        />
        <span className="truncate">{label}</span>
      </label>
      {pinned && (
        <span
          className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-bd text-tx3"
          style={{ background: 'var(--sf-h)' }}
        >
          Przypięta
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dropdown popover
// ---------------------------------------------------------------------------

interface DropdownProps<T> {
  columns: Column<T>[];
  state: StoredState;
  onChange: (next: StoredState) => void;
  onReset: () => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

function Dropdown<T>({ columns, state, onChange, onReset, onClose, anchorRect }: DropdownProps<T>) {
  const byId = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const hiddenSet = useMemo(() => new Set(state.hidden), [state.hidden]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Close on Escape / click outside
  const popoverRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onClick(e: MouseEvent) {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener('keydown', onKey);
    // Defer to avoid catching the opening click.
    const t = window.setTimeout(() => window.addEventListener('mousedown', onClick), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      window.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  function toggle(id: string) {
    const col = byId.get(id);
    if (!col || col.pinned) return;
    const nextHidden = new Set(state.hidden);
    if (nextHidden.has(id)) nextHidden.delete(id);
    else nextHidden.add(id);
    onChange({ ...state, hidden: Array.from(nextHidden) });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeCol = byId.get(String(active.id));
    const overCol = byId.get(String(over.id));
    if (!activeCol || !overCol) return;
    if (activeCol.pinned || overCol.pinned) return; // pinned can't move and can't be displaced into the pinned block
    const oldIdx = state.order.indexOf(String(active.id));
    const newIdx = state.order.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const nextOrder = arrayMove(state.order, oldIdx, newIdx);
    // Re-enforce: pinned first.
    const pinnedIds = columns.filter((c) => c.pinned).map((c) => c.id);
    const pinnedSet = new Set(pinnedIds);
    const nonPinned = nextOrder.filter((cid) => !pinnedSet.has(cid));
    onChange({ ...state, order: [...pinnedIds, ...nonPinned] });
  }

  // Position: below the anchor, right-aligned, clamped to viewport.
  const width = 288;
  const margin = 8;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  let left = anchorRect.right - width;
  if (left < margin) left = margin;
  if (left + width > vw - margin) left = vw - width - margin;
  const top = anchorRect.bottom + 6;

  const rows = state.order
    .map((id) => byId.get(id))
    .filter((c): c is Column<T> => Boolean(c));

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Wybór kolumn"
      className="fixed z-[1000] rounded-[var(--r-m)] border shadow-2"
      style={{
        top,
        left,
        width,
        maxHeight: 400,
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
          <Columns3 className="h-3.5 w-3.5" />
          Kolumny
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
      <div className="px-2 py-2 overflow-y-auto" style={{ maxHeight: 300 }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            {rows.map((c) => (
              <PickerRow
                key={c.id}
                id={c.id}
                label={c.label}
                visible={!hiddenSet.has(c.id)}
                pinned={!!c.pinned}
                onToggle={toggle}
              />
            ))}
          </SortableContext>
        </DndContext>
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

export function useColumns<T>({ tableKey, columns }: UseColumnsOptions<T>): UseColumnsReturn<T> {
  // Signature so we can hard-reset if dev changes the column set.
  const signature = useMemo(() => columnSetSignature(columns), [columns]);
  const signatureRef = useRef(signature);

  const [state, setState] = useState<StoredState>(() => {
    const stored = readStored(tableKey, columns);
    return enforceInvariants(stored ?? buildDefaultState(columns), columns);
  });

  // If column set changes at runtime (hot-reload / feature flag), re-seed.
  useEffect(() => {
    if (signatureRef.current !== signature) {
      signatureRef.current = signature;
      const stored = readStored(tableKey, columns);
      setState(enforceInvariants(stored ?? buildDefaultState(columns), columns));
    }
  }, [signature, tableKey, columns]);

  // Persist on change.
  useEffect(() => {
    writeStored(tableKey, state);
  }, [tableKey, state]);

  const resetColumns = useCallback(() => {
    clearStored(tableKey);
    setState(buildDefaultState(columns));
  }, [tableKey, columns]);

  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const openPicker = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect() ?? null;
    setAnchorRect(rect);
    setOpen(true);
  }, []);

  const visibleColumns = useMemo<Column<T>[]>(() => {
    const byId = new Map(columns.map((c) => [c.id, c]));
    const hiddenSet = new Set(state.hidden);
    return state.order
      .map((id) => byId.get(id))
      .filter((c): c is Column<T> => Boolean(c))
      .filter((c) => c.pinned || !hiddenSet.has(c.id));
  }, [columns, state]);

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
        <Columns3 className="h-3.5 w-3.5" />
        Kolumny
      </button>
      {open && anchorRect && (
        <Dropdown
          columns={columns}
          state={state}
          onChange={(next) => setState(enforceInvariants(next, columns))}
          onReset={() => {
            resetColumns();
          }}
          onClose={() => setOpen(false)}
          anchorRect={anchorRect}
        />
      )}
    </>
  );

  return { visibleColumns, pickerButton, resetColumns };
}

// ---------------------------------------------------------------------------
// Render-prop component wrapper (optional alternative API)
// ---------------------------------------------------------------------------

interface ColumnPickerProps<T> {
  tableKey: string;
  columns: Column<T>[];
  children: (visibleColumns: Column<T>[], pickerButton: ReactNode) => ReactNode;
}

export function ColumnPicker<T>({ tableKey, columns, children }: ColumnPickerProps<T>) {
  const { visibleColumns, pickerButton } = useColumns<T>({ tableKey, columns });
  return <>{children(visibleColumns, pickerButton)}</>;
}
