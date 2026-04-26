// Inline quick-actions shown on every ticket card (visual view) and row
// (tabular view). Two small buttons side-by-side:
//   1. AssigneeButton  — reassign the ticket without leaving the list.
//   2. ServiceModeButton — switch REMOTE / ONSITE (only when hasService).
//
// Both buttons open a small popover anchored to the button. Selection fires
// the mutation prop passed in from TicketsPage (which owns the optimistic
// update + toast). The component is intentionally presentational so the
// same pattern can be dropped into tasks / orders lists later.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Monitor, MapPin, UserPlus, Search, X, Check } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';

export interface QuickActionAssignee {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email?: string;
}

export interface QuickActionMember {
  id: string;             // membership id (unused here, kept for future)
  user: QuickActionAssignee;
}

export interface QuickActionTicket {
  id: string;
  assignedTo: QuickActionAssignee | null;
  serviceMode?: 'REMOTE' | 'ONSITE' | null;
  hasService?: boolean;
}

interface Props {
  ticket: QuickActionTicket;
  members: QuickActionMember[];
  onAssign: (ticketId: string, userId: string | null) => void;
  onServiceMode: (ticketId: string, mode: 'REMOTE' | 'ONSITE') => void;
  compact?: boolean;       // smaller (for tabular rows)
}

export function TicketQuickActions({ ticket, members, onAssign, onServiceMode, compact }: Props) {
  return (
    <div className="flex items-center gap-1.5" onClick={stop}>
      <AssigneeButton
        ticket={ticket}
        members={members}
        compact={compact}
        onAssign={onAssign}
      />
      {ticket.hasService && (
        <ServiceModeButton
          ticket={ticket}
          compact={compact}
          onServiceMode={onServiceMode}
        />
      )}
    </div>
  );
}

// Prevent card <Link> navigation when user clicks the quick-action widgets.
function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
  e.preventDefault();
}

// ---------------------------------------------------------------------------
// Popover primitive — no Radix dependency (project has @radix-ui/react-dialog
// but not react-popover). Handles click-outside and Escape.
// ---------------------------------------------------------------------------

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
  children: ReactNode;
  align?: 'start' | 'end';
}

function Popover({ open, onClose, anchorRef, children, align = 'end' }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  // compute fixed position from anchor, flip upward if not enough space below
  const rect = anchorRef.current?.getBoundingClientRect();
  const MAX_POPOVER_H = 420;
  const spaceBelow = rect ? window.innerHeight - rect.bottom - 8 : 0;
  const spaceAbove = rect ? rect.top - 8 : 0;
  const openUp = spaceBelow < Math.min(MAX_POPOVER_H, 300) && spaceAbove > spaceBelow;
  const top = rect ? (openUp ? undefined : rect.bottom + 4) : 0;
  const bottom = rect && openUp ? (window.innerHeight - rect.top + 4) : undefined;
  const left = rect && align !== 'end' ? rect.left : undefined;
  const right = rect && align === 'end' ? window.innerWidth - rect.right : undefined;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      className="fixed z-[100] rounded-[10px] border border-bd bg-sf shadow-lg overflow-auto"
      style={{
        top,
        bottom,
        left,
        right,
        minWidth: 240,
        maxHeight: 'min(420px, ' + (openUp ? spaceAbove : spaceBelow) + 'px)',
      }}
      onClick={stop}
    >
      {children}
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Assignee button + popover
// ---------------------------------------------------------------------------

function AssigneeButton({ ticket, members, compact, onAssign }: {
  ticket: QuickActionTicket;
  members: QuickActionMember[];
  compact?: boolean;
  onAssign: (ticketId: string, userId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      const t = setTimeout(() => searchRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const size = compact ? 22 : 26;
  const assignee = ticket.assignedTo;

  const filtered = members.filter((m) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(' ').toLowerCase();
    return name.includes(needle) || (m.user.email ?? '').toLowerCase().includes(needle);
  });

  function pick(userId: string | null) {
    onAssign(ticket.id, userId);
    setOpen(false);
  }

  return (
    <div className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { stop(e); setOpen((v) => !v); }}
        className="inline-flex items-center gap-1 rounded-full border border-bd bg-sf hover:bg-sf-h transition-colors px-1 py-0.5"
        title={assignee
          ? `Przypisany: ${[assignee.firstName, assignee.lastName].filter(Boolean).join(' ') || assignee.email || 'technik'}`
          : 'Przypisz technika'}
        aria-label="Przypisz technika"
      >
        {assignee ? (
          <Avatar
            email={assignee.email}
            firstName={assignee.firstName}
            lastName={assignee.lastName}
            size={size}
          />
        ) : (
          <span
            className="inline-flex items-center justify-center rounded-full border border-dashed border-bd text-tx3"
            style={{ width: size, height: size, fontSize: 11 }}
          >
            <UserPlus size={compact ? 11 : 12} />
          </span>
        )}
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btnRef}>
        <div className="p-2 border-b border-bd">
          <div className="relative">
            <Search className="absolute left-2 top-[2vh] h-3.5 w-3.5 text-tx3 pointer-events-none" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Szukaj technika"
              className="w-full h-8 pl-7 pr-2 rounded-[8px] border border-bd bg-sf2 text-[12px] text-tx placeholder:text-tx3 focus:outline-none focus:border-pri"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered[0]) { e.preventDefault(); pick(filtered[0].user.id); }
              }}
            />
          </div>
        </div>
        <div className="max-h-[260px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-tx3">Brak wyników</div>
          ) : (
            filtered.map((m) => {
              const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(' ') || m.user.email;
              const selected = assignee?.id === m.user.id;
              return (
                <button
                  key={m.user.id}
                  type="button"
                  onClick={() => pick(m.user.id)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-sf-h transition-colors"
                >
                  <Avatar
                    email={m.user.email}
                    firstName={m.user.firstName}
                    lastName={m.user.lastName}
                    size={24}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-tx truncate">{name}</div>
                    <div className="text-[10px] text-tx3 truncate">{m.user.email}</div>
                  </div>
                  {selected && <Check className="h-3.5 w-3.5 text-pri shrink-0" />}
                </button>
              );
            })
          )}
        </div>
        <div className="p-1 border-t border-bd">
          <button
            type="button"
            onClick={() => pick(null)}
            disabled={!assignee}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-tx3 hover:bg-sf-h disabled:opacity-40 disabled:pointer-events-none transition-colors rounded-[6px]"
          >
            <X className="h-3.5 w-3.5" />
            Odepnij
          </button>
        </div>
      </Popover>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Service mode button + popover
// ---------------------------------------------------------------------------

function ServiceModeButton({ ticket, compact, onServiceMode }: {
  ticket: QuickActionTicket;
  compact?: boolean;
  onServiceMode: (ticketId: string, mode: 'REMOTE' | 'ONSITE') => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const mode = ticket.serviceMode ?? null;
  const label = mode === 'REMOTE' ? 'Zdalnie' : mode === 'ONSITE' ? 'U klienta' : '—';
  const Icon = mode === 'ONSITE' ? MapPin : Monitor;

  function pick(next: 'REMOTE' | 'ONSITE') {
    onServiceMode(ticket.id, next);
    setOpen(false);
  }

  return (
    <div className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { stop(e); setOpen((v) => !v); }}
        className={`inline-flex items-center gap-1 rounded-full border border-bd bg-sf hover:bg-sf-h transition-colors ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'} text-tx2`}
        title={`Tryb serwisu: ${label}`}
        aria-label="Zmień tryb serwisu"
      >
        <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        <span className="font-medium">{label}</span>
      </button>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btnRef}>
        <div className="p-1 min-w-[180px]">
          <ModeRow
            active={mode === 'REMOTE'}
            label="Zdalnie"
            icon={<Monitor className="h-3.5 w-3.5" />}
            onClick={() => pick('REMOTE')}
          />
          <ModeRow
            active={mode === 'ONSITE'}
            label="Lokalnie u klienta"
            icon={<MapPin className="h-3.5 w-3.5" />}
            onClick={() => pick('ONSITE')}
          />
        </div>
      </Popover>
    </div>
  );
}

function ModeRow({ active, label, icon, onClick }: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[6px] text-left text-[12px] transition-colors ${active ? 'bg-sf-h text-tx' : 'text-tx2 hover:bg-sf-h'}`}
    >
      <span className={active ? 'text-pri' : 'text-tx3'}>{icon}</span>
      <span className="flex-1">{label}</span>
      {active && <Check className="h-3.5 w-3.5 text-pri" />}
    </button>
  );
}
