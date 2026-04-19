/**
 * ID PANEL — UI primitives.
 *
 * Every screen consumes these components. Zero inline styling per view.
 * Classes come from ../styles/panel/system.css (source of truth).
 */

import React from 'react';

type AnyDiv = React.HTMLAttributes<HTMLDivElement>;
type AnyButton = React.ButtonHTMLAttributes<HTMLButtonElement>;

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/* ═ Card ────────────────────────────────────────────────────────── */

interface CardProps extends AnyDiv {
  /** md = 20px padding, sm = 16px, default = 24px */
  size?: 'sm' | 'md' | 'lg';
  /** Enables cursor + hover lift + active press */
  interactive?: boolean;
  /** Ambient spotlight behind (for hero sections like ID CORE) */
  hero?: boolean;
  /** Glass blur for overlay-style placement */
  glass?: boolean;
}
export function Card({ size = 'lg', interactive, hero, glass, className, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        'ui-card',
        size === 'md' && 'ui-card--md',
        size === 'sm' && 'ui-card--sm',
        interactive && 'ui-card--interactive',
        hero && 'ui-card--hero',
        glass && 'ui-card--glass',
        className,
      )}
      {...rest}
    />
  );
}

/* ═ CardHeader / Footer ────────────────────────────────────────── */

export function CardHeader({ title, subtitle, action, className }: { title?: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cx('ui-card__head', className)}>
      <div>
        {title && <div className="ui-card__title">{title}</div>}
        {subtitle && <div className="ui-card__subtitle">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx('ui-card__footer', className)}>{children}</div>;
}

/* ═ StatCard ───────────────────────────────────────────────────── */

interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  sub?: React.ReactNode;
  valueTone?: 'default' | 'ok' | 'warn' | 'bad';
  className?: string;
}
export function StatCard({ label, value, unit, sub, valueTone = 'default', className }: StatCardProps) {
  const toneColor =
    valueTone === 'ok'   ? 'var(--ip-ok)' :
    valueTone === 'warn' ? 'var(--ip-warn)' :
    valueTone === 'bad'  ? 'var(--ip-bad)' : undefined;
  return (
    <div className={cx('ui-stat', className)}>
      <div className="ui-stat__label">{label}</div>
      <div className="ui-stat__value" style={toneColor ? { color: toneColor } : undefined}>
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {sub && <div className="ui-stat__sub">{sub}</div>}
    </div>
  );
}

/* ═ ListRow ────────────────────────────────────────────────────── */

export function ListRow({ className, children, ...rest }: AnyDiv) {
  return <div className={cx('ui-row', className)} {...rest}>{children}</div>;
}

/* ═ IconContainer ──────────────────────────────────────────────── */

interface IconContainerProps {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'brand' | 'ok' | 'warn' | 'bad' | 'violet';
  children: React.ReactNode;
  className?: string;
}
export function IconContainer({ size = 'md', tone = 'brand', children, className }: IconContainerProps) {
  return (
    <div className={cx(
      'ui-icon',
      size === 'sm' && 'ui-icon--sm',
      size === 'lg' && 'ui-icon--lg',
      tone !== 'brand' && `ui-icon--${tone}`,
      className,
    )}>
      {children}
    </div>
  );
}

/* ═ Badge / StatusBadge ────────────────────────────────────────── */

interface BadgeProps {
  tone: 'ok' | 'warn' | 'bad' | 'blue' | 'gray';
  live?: boolean;
  children: React.ReactNode;
  className?: string;
}
export function Badge({ tone, live, children, className }: BadgeProps) {
  return (
    <span className={cx('ui-badge', `ui-badge--${tone}`, live && 'ui-badge--live', className)}>
      {live && <span className="ui-badge__dot" />}
      {children}
    </span>
  );
}

/* ═ Button ─────────────────────────────────────────────────────── */

interface ButtonProps extends AnyButton {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  as?: 'button' | 'a';
  href?: string;
  to?: string;
}
export function Button({ variant = 'primary', size = 'md', className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        'ui-btn',
        `ui-btn--${variant}`,
        size === 'sm' && 'ui-btn--sm',
        size === 'lg' && 'ui-btn--lg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ═ SearchInput ────────────────────────────────────────────────── */

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  kbd?: string;
  icon?: React.ReactNode;
}
export function SearchInput({ kbd, icon, className, ...rest }: SearchInputProps) {
  return (
    <label className={cx('ui-search', className)}>
      {icon}
      <input {...rest} />
      {kbd && <span className="ui-search__kbd">{kbd}</span>}
    </label>
  );
}

/* ═ SectionHeader ──────────────────────────────────────────────── */

export function SectionHeader({ title, sub, action, className }: { title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cx('ui-section', className)}>
      <div>
        <div className="ui-section__title">{title}</div>
        {sub && <div className="ui-section__sub">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

/* ═ EmptyState ─────────────────────────────────────────────────── */

export function EmptyState({ icon, title, sub }: { icon?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="ui-empty">
      <div className="ui-empty__icon">{icon}</div>
      <div className="ui-empty__title">{title}</div>
      {sub && <div className="ui-empty__sub">{sub}</div>}
    </div>
  );
}

/* ═ IdoAvatar (3-layer premium orb) ───────────────────────────── */

interface IdoAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}
export function IdoAvatar({ size = 'lg', className }: IdoAvatarProps) {
  const sizeCls =
    size === 'sm' ? 'ui-ido--sm' :
    size === 'md' ? 'ui-ido--md' :
    size === 'lg' ? '' :
    'ui-ido--lg';
  return (
    <div className={cx('ui-ido', sizeCls, className)}>
      <div className="ui-ido__outer-glow" />
      <div className="ui-ido__core" />
      <div className="ui-ido__inner-light" />
      <div className="ui-ido__grain" />
    </div>
  );
}

/* ═ AIBubble (chat message bubble) ─────────────────────────────── */

interface AIBubbleProps {
  role: 'user' | 'ai';
  children: React.ReactNode;
  className?: string;
}
export function AIBubble({ role, children, className }: AIBubbleProps) {
  return (
    <div className={cx('ui-bubble', `ui-bubble--${role}`, className)}>
      {children}
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="ui-bubble ui-bubble--ai" style={{ display: 'inline-flex', alignItems: 'center', padding: 0 }}>
      <div className="ui-typing"><span /><span /><span /></div>
    </div>
  );
}
