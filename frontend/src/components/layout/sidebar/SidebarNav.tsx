import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, DragOverlay,
  type DragEndEvent, type DragStartEvent, type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useState } from 'react';
import { ticketsApi } from '../../../api/tickets';
import { tasksApi } from '../../../api/tasks';
import { useEffectiveMenu } from '../../../hooks/useEffectiveMenu';
import { useMenuPreference } from '../../../hooks/useMenuPreference';
import { useMenuStore } from '../../../store/menuStore';
import { ITEMS_BY_ID } from '../../../config/menuRegistry';
import { SidebarGroup } from './SidebarGroup';
import { SidebarEditToggle } from './SidebarEditToggle';
import { SidebarEditToolbar } from './SidebarEditToolbar';
import { SidebarAddMenu } from './SidebarAddMenu';

interface Props {
  collapsed: boolean;
  mobile?: boolean;
  onMobileClose?: () => void;
}

export function SidebarNav({ collapsed, mobile, onMobileClose }: Props) {
  useMenuPreference();

  const isEditMode = useMenuStore(s => s.isEditMode);
  const moveItem = useMenuStore(s => s.moveItem);
  const moveGroup = useMenuStore(s => s.moveGroup);
  const groups = useEffectiveMenu();

  const [activeId, setActiveId] = useState<string | null>(null);

  // Badge data
  const { data: queueTickets = [] } = useQuery({
    queryKey: ['tickets-queue'],
    queryFn: () => ticketsApi.getAll({ status: 'PENDING' }),
    refetchInterval: 30_000, staleTime: 15_000,
  });
  const { data: myTasks = [] } = useQuery({
    queryKey: ['tasks', { all: false }],
    queryFn: () => tasksApi.getAll({ all: false }),
    refetchInterval: 30_000, staleTime: 15_000,
  });

  const badges: Record<string, number> = {
    ticketQueue: queueTickets.length,
    activeTasks: myTasks.filter((t: any) => t.status !== 'DONE').length,
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current as any;
    const overData = over.data.current as any;

    // Group reorder
    if (activeData?.type === 'group' && overData?.type === 'group') {
      const fromIdx = groups.findIndex(g => g.id === active.id);
      const toIdx = groups.findIndex(g => g.id === over.id);
      if (fromIdx >= 0 && toIdx >= 0) {
        moveGroup(fromIdx, toIdx);
      }
      return;
    }

    // Item reorder / cross-group move
    if (activeData?.type === 'item') {
      const fromGroupId = activeData.groupId as string;
      const itemId = String(active.id);

      let toGroupId = fromGroupId;
      let newIndex = 0;

      if (overData?.type === 'item') {
        toGroupId = overData.groupId as string;
        const targetGroup = groups.find(g => g.id === toGroupId);
        if (targetGroup) {
          newIndex = targetGroup.items.findIndex(i => i.id === String(over.id));
          if (newIndex < 0) newIndex = targetGroup.items.length;
        }
      } else if (overData?.type === 'group') {
        toGroupId = String(over.id);
        const targetGroup = groups.find(g => g.id === toGroupId);
        newIndex = targetGroup ? targetGroup.items.length : 0;
      }

      moveItem(itemId, fromGroupId, toGroupId, newIndex);
    }
  }, [groups, moveItem, moveGroup]);

  // Find active item for drag overlay
  const activeItem = activeId ? (() => {
    const si = ITEMS_BY_ID.get(activeId);
    if (si) {
      const Icon = si.icon;
      return (
        <div className="nav-item" style={{
          background: 'var(--accent-g, rgba(99,102,241,0.12))',
          border: '1px solid var(--accent)',
          borderRadius: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          opacity: 0.9,
        }}>
          <Icon className="nav-icon" />
          <span style={{ flex: 1 }}>{si.label}</span>
        </div>
      );
    }
    // Group drag overlay
    const group = groups.find(g => g.id === activeId);
    if (group) {
      return (
        <div style={{
          padding: '6px 10px', fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--accent)',
          background: 'var(--accent-g, rgba(99,102,241,0.12))',
          border: '1px solid var(--accent)', borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {group.label || 'Sekcja'}
        </div>
      );
    }
    return null;
  })() : null;

  if (!isEditMode) {
    // Normal mode — no DnD
    return (
      <nav className="sidebar-nav">
        {!collapsed && !mobile && <SidebarEditToggle />}
        {groups.map(group => (
          <SidebarGroup
            key={group.id}
            group={group}
            collapsed={collapsed}
            mobile={mobile}
            onMobileClose={onMobileClose}
            isEditMode={false}
            badges={badges}
          />
        ))}
      </nav>
    );
  }

  // Edit mode — with DnD
  const groupIds = groups.map(g => g.id);

  return (
    <nav className="sidebar-nav" style={{ borderLeft: '2px solid var(--accent)', borderRadius: 0 }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
          {groups.map((group, idx) => (
            <div key={group.id}>
              <SidebarGroup
                group={group}
                collapsed={collapsed}
                mobile={mobile}
                onMobileClose={onMobileClose}
                isEditMode={true}
                badges={badges}
              />
              <SidebarAddMenu afterIndex={idx} />
            </div>
          ))}
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeItem}
        </DragOverlay>
      </DndContext>

      <SidebarEditToolbar />
    </nav>
  );
}
