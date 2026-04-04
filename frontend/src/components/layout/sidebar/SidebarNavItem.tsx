import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, Star } from 'lucide-react';
import type { EffectiveItem } from '../../../hooks/useEffectiveMenu';
import { useMenuStore } from '../../../store/menuStore';

interface Props {
  item: EffectiveItem;
  collapsed: boolean;
  isPlatform: boolean;
  mobile?: boolean;
  onMobileClose?: () => void;
  badge?: number;
  isEditMode: boolean;
  dragHandleProps?: Record<string, any>;
  style?: React.CSSProperties;
}

export function SidebarNavItem({
  item, collapsed, isPlatform, mobile, onMobileClose, badge, isEditMode,
  dragHandleProps, style,
}: Props) {
  const toggleVisibility = useMenuStore(s => s.toggleItemVisibility);
  const toggleFavorite = useMenuStore(s => s.toggleFavorite);
  const Icon = item.icon;

  if (isEditMode) {
    return (
      <div
        className="nav-item"
        style={{
          ...style,
          cursor: 'default',
          ...(item.hidden ? { opacity: 0.35 } : {}),
        }}
      >
        {dragHandleProps && (
          <span {...dragHandleProps} style={{ cursor: 'grab', display: 'flex', alignItems: 'center', color: 'var(--td)', flexShrink: 0 }}>
            <GripVertical style={{ width: 14, height: 14 }} />
          </span>
        )}
        <Icon className="nav-icon" />
        {!collapsed && (
          <span style={{ flex: 1, ...(item.hidden ? { textDecoration: 'line-through' } : {}) }}>
            {item.label}
          </span>
        )}
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                display: 'flex', color: item.isFavorite ? '#F59E0B' : 'var(--td)',
                transition: 'color 0.15s',
              }}
              title={item.isFavorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
            >
              <Star style={{ width: 12, height: 12, fill: item.isFavorite ? '#F59E0B' : 'none' }} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); toggleVisibility(item.id); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                display: 'flex', color: item.hidden ? 'var(--td)' : 'var(--tm)',
                transition: 'color 0.15s',
              }}
              title={item.hidden ? 'Pokaż' : 'Ukryj'}
            >
              {item.hidden ? <EyeOff style={{ width: 12, height: 12 }} /> : <Eye style={{ width: 12, height: 12 }} />}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (item.hidden) return null;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={mobile ? onMobileClose : undefined}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => clsx('nav-item', isActive && 'active')}
      style={({ isActive }) => ({
        ...style,
        ...(collapsed ? { justifyContent: 'center', padding: '9px' } : {}),
        ...(isPlatform && isActive ? { color: '#F87171' } : {}),
        ...(isPlatform && !isActive ? { color: 'rgba(248,113,113,0.4)' } : {}),
      })}
    >
      <Icon className="nav-icon" />
      {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
      {!collapsed && badge != null && badge > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
          background: 'rgba(239,68,68,0.15)', color: '#F87171',
        }}>
          {badge}
        </span>
      )}
    </NavLink>
  );
}

/** Sortable wrapper for edit mode */
export function SortableNavItem({
  item, groupId, collapsed, isPlatform, badges,
}: {
  item: EffectiveItem;
  groupId: string;
  collapsed: boolean;
  isPlatform: boolean;
  badges: Record<string, number>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: 'item', groupId },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div ref={setNodeRef} {...attributes}>
      <SidebarNavItem
        item={item}
        collapsed={collapsed}
        isPlatform={isPlatform}
        badge={item.badgeKey ? badges[item.badgeKey] : undefined}
        isEditMode={true}
        dragHandleProps={listeners}
        style={style}
      />
    </div>
  );
}
