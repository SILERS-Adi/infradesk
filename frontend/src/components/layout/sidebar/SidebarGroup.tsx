import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, Star, Trash2 } from 'lucide-react';
import { useMenuStore } from '../../../store/menuStore';
import type { EffectiveGroup } from '../../../hooks/useEffectiveMenu';
import { SortableNavItem } from './SidebarNavItem';
import { SidebarNavItem } from './SidebarNavItem';

interface Props {
  group: EffectiveGroup;
  collapsed: boolean;
  mobile?: boolean;
  onMobileClose?: () => void;
  isEditMode: boolean;
  badges: Record<string, number>;
}

export function SidebarGroup({ group, collapsed, mobile, onMobileClose, isEditMode, badges }: Props) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({
    id: group.id,
    data: { type: 'group', groupId: group.id },
    disabled: !isEditMode,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const removeSeparator = useMenuStore(s => s.removeSeparator);
  const removeCustomGroup = useMenuStore(s => s.removeCustomGroup);

  if (group.isSeparator) {
    return (
      <div ref={setNodeRef} style={style} {...attributes}>
        <div style={{ display: 'flex', alignItems: 'center', margin: '4px 10px', gap: 4 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          {isEditMode && (
            <button
              onClick={() => removeSeparator(group.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--td)', display: 'flex', padding: 1, transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--td)'}
              title="Usuń separator"
            >
              <X style={{ width: 10, height: 10 }} />
            </button>
          )}
        </div>
      </div>
    );
  }

  const visibleItems = isEditMode ? group.items : group.items.filter(i => !i.hidden);
  if (visibleItems.length === 0 && !isEditMode) return null;

  const itemIds = group.items.map(i => i.id);

  const groupLabel = !collapsed && group.label ? (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '8px 10px 2px',
      ...(group.isPlatform ? { borderTop: '1px solid rgba(248,113,113,0.1)', marginTop: 4, paddingTop: 10 } : {}),
    }}>
      {isEditMode && (
        <span {...listeners} style={{ cursor: 'grab', display: 'flex', color: 'var(--td)', flexShrink: 0 }}>
          <GripVertical style={{ width: 12, height: 12 }} />
        </span>
      )}
      {group.isFavorites && (
        <Star style={{ width: 9, height: 9, color: '#F59E0B', fill: '#F59E0B', flexShrink: 0 }} />
      )}
      {group.color && !group.isFavorites && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: group.color, flexShrink: 0,
        }} />
      )}
      <p style={{
        fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, flex: 1,
        color: group.isFavorites ? '#F59E0B' : group.isPlatform ? 'rgba(248,113,113,0.5)' : group.color ?? 'var(--td)',
      }}>
        {group.label}
      </p>
      {isEditMode && group.isCustom && (
        <button
          onClick={() => removeCustomGroup(group.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--td)', display: 'flex', padding: 1, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--td)'}
          title="Usuń sekcję"
        >
          <Trash2 style={{ width: 10, height: 10 }} />
        </button>
      )}
    </div>
  ) : null;

  if (!isEditMode) {
    return (
      <div>
        {groupLabel}
        {visibleItems.map(item => (
          <SidebarNavItem
            key={item.id}
            item={item}
            collapsed={collapsed}
            isPlatform={group.isPlatform}
            mobile={mobile}
            onMobileClose={onMobileClose}
            badge={item.badgeKey ? badges[item.badgeKey] : undefined}
            isEditMode={false}
          />
        ))}
      </div>
    );
  }

  // Edit mode with DnD
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {groupLabel}
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {group.items.map(item => (
          <SortableNavItem
            key={item.id}
            item={item}
            groupId={group.id}
            collapsed={collapsed}
            isPlatform={group.isPlatform}
            badges={badges}
          />
        ))}
      </SortableContext>
    </div>
  );
}
