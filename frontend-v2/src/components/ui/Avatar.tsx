// Shared Avatar primitives for Infradesk.
// Deterministic colour per email (hash -> palette slot) so the same user is
// always the same colour across Users / Tickets / Tasks / etc.

const PALETTE = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#06B6D4', '#6366F1',
];

export function avatarColor(email: string | null | undefined): string {
  const seed = (email ?? '?').toLowerCase();
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

export function avatarInitials(
  person: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined,
): string {
  if (!person) return '?';
  const f = (person.firstName ?? '').trim()[0] ?? '';
  const l = (person.lastName ?? '').trim()[0] ?? '';
  const combined = (f + l).toUpperCase();
  if (combined) return combined;
  const e = (person.email ?? '').trim();
  return e ? e[0]!.toUpperCase() : '?';
}

interface AvatarProps {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  size?: number;          // px, defaults 28
  title?: string;
  className?: string;
}

export function Avatar({ email, firstName, lastName, size = 28, title, className }: AvatarProps) {
  const bg = email ? avatarColor(email) : 'var(--sf-h)';
  const initials = avatarInitials({ email, firstName, lastName });
  const hasIdentity = Boolean(email || firstName || lastName);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold text-white select-none ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        background: hasIdentity ? bg : 'var(--sf-h)',
        color: hasIdentity ? '#fff' : 'var(--tx3)',
        fontSize: Math.max(10, Math.round(size * 0.42)),
        lineHeight: 1,
        border: hasIdentity ? 'none' : '1px dashed var(--bd)',
      }}
      title={title}
      aria-label={title}
    >
      {hasIdentity ? initials : '?'}
    </span>
  );
}
