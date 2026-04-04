import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
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

  if (group.isSeparator) {
    return (
      <div ref={setNodeRef} style={style} {...attributes}>
        <div style={{ height: 1, background: 'var(--border)', margin: '6px 10px' }} />
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
      {group.color && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: group.color, flexShrink: 0,
        }} />
      )}
      <p style={{
        fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0,
        color: group.isPlatform ? 'rgba(248,113,113,0.5)' : group.color ?? 'var(--td)',
      }}>
        {group.label}
      </p>
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
