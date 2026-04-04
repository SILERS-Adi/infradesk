import { useMemo } from 'react';
import {
  SYSTEM_GROUPS, SYSTEM_ITEMS, ITEMS_BY_ID, GROUPS_BY_ID,
  buildDefaultLayout,
  type MenuLayout, type MenuGroupConfig, type SystemMenuItem, type SystemMenuGroup,
} from '../config/menuRegistry';
import { useMenuStore } from '../store/menuStore';
import { useWorkspaceContext } from './useWorkspaceContext';
import { useAuth } from '../store/authStore';

export interface EffectiveGroup {
  id: string;
  label: string;
  color: string | null;
  isCustom: boolean;
  isSeparator: boolean;
  isPlatform: boolean;
  isFavorites: boolean;
  isCollapsed: boolean;
  systemGroup: SystemMenuGroup | null;
  items: EffectiveItem[];
}

export interface EffectiveItem {
  id: string;
  to: string;
  label: string;
  icon: SystemMenuItem['icon'];
  end?: boolean;
  badgeKey?: string;
  hidden: boolean;
  isFavorite: boolean;
}

/**
 * Merges system registry + user layout + permissions into the effective menu.
 * New system items not in user's layout are auto-appended to their default group.
 */
export function useEffectiveMenu(): EffectiveGroup[] {
  const { isAdmin, hasModule } = useWorkspaceContext();
  const { user } = useAuth();
  const isSuperAdmin = !!user?.isSuperAdmin;

  const isEditMode = useMenuStore(s => s.isEditMode);
  const editLayout = useMenuStore(s => s.editLayout);
  const savedLayout = useMenuStore(s => s.layout);

  const layout = isEditMode ? editLayout : savedLayout;

  return useMemo(() => {
    const effective = layout ?? buildDefaultLayout();

    // Permission checkers (same logic as original Sidebar.tsx)
    const canSeeGroup = (groupId: string): boolean => {
      const sg = GROUPS_BY_ID.get(groupId);
      if (!sg) return true; // custom group — always visible
      if (sg.module && !hasModule(sg.module)) return false;
      if (!sg.role) return true;
      if (sg.role === 'ADMIN') return isAdmin;
      if (sg.role === 'SUPERADMIN') return isSuperAdmin;
      return false;
    };

    const canSeeItem = (itemId: string): boolean => {
      const si = ITEMS_BY_ID.get(itemId);
      if (!si) return false; // unknown item — skip
      if (si.module && !hasModule(si.module)) return false;
      if (!si.role) return true;
      if (si.role === 'ADMIN') return isAdmin;
      if (si.role === 'SUPERADMIN') return isSuperAdmin;
      return false;
    };

    // Collect all item IDs present in layout (groups + hidden)
    const knownItemIds = new Set<string>();
    for (const group of effective.groups) {
      for (const itemId of group.items) knownItemIds.add(itemId);
    }
    for (const id of effective.hiddenItems) knownItemIds.add(id);

    // Auto-discovery: find system items NOT in layout → append to default group
    const workingGroups: MenuGroupConfig[] = effective.groups.map(g => ({ ...g, items: [...g.items] }));

    for (const sysItem of SYSTEM_ITEMS) {
      if (knownItemIds.has(sysItem.id)) continue;
      // New item — find or create its default group
      let targetGroup = workingGroups.find(g => g.id === sysItem.groupId);
      if (!targetGroup) {
        const sysGroup = GROUPS_BY_ID.get(sysItem.groupId);
        if (sysGroup) {
          // Find insertion point: before admin/platform groups
          const adminIdx = workingGroups.findIndex(g => g.id === 'admin');
          const insertAt = adminIdx >= 0 ? adminIdx : workingGroups.length;
          targetGroup = { id: sysGroup.id, items: [] };
          workingGroups.splice(insertAt, 0, targetGroup);
        }
      }
      if (targetGroup) {
        targetGroup.items.push(sysItem.id);
      }
    }

    const hiddenSet = new Set(effective.hiddenItems);
    const collapsedSet = new Set(effective.collapsedGroups);
    const favoriteSet = new Set(effective.favoriteItems ?? []);

    // Build effective groups
    const result: EffectiveGroup[] = [];

    for (const gc of workingGroups) {
      if (gc.isSeparator) {
        result.push({
          id: gc.id,
          label: '',
          color: null,
          isCustom: false,
          isSeparator: true,
          isPlatform: false,
          isFavorites: false,
          isCollapsed: false,
          systemGroup: null,
          items: [],
        });
        continue;
      }

      // Permission check on group level (skip module/role-gated groups user can't see)
      if (!gc.isCustom && gc.id !== 'favorites' && !canSeeGroup(gc.id)) continue;

      const sysGroup = GROUPS_BY_ID.get(gc.id) ?? null;
      const isFavoritesGroup = gc.id === 'favorites';

      const items: EffectiveItem[] = [];
      for (const itemId of gc.items) {
        if (!canSeeItem(itemId)) continue;
        const si = ITEMS_BY_ID.get(itemId);
        if (!si) continue;
        items.push({
          id: si.id,
          to: si.to,
          label: si.label,
          icon: si.icon,
          end: si.end,
          badgeKey: si.badgeKey,
          hidden: hiddenSet.has(si.id),
          isFavorite: favoriteSet.has(si.id),
        });
      }

      // In normal mode: skip empty favorites, skip groups with no visible items
      if (!isEditMode && isFavoritesGroup && items.filter(i => !i.hidden).length === 0) continue;
      if (!isEditMode && !isFavoritesGroup && items.filter(i => !i.hidden).length === 0) continue;
      // In edit mode: skip groups with no items (unless custom or favorites)
      if (isEditMode && items.length === 0 && !gc.isCustom && !isFavoritesGroup) continue;

      result.push({
        id: gc.id,
        label: gc.label ?? sysGroup?.label ?? '',
        color: gc.color ?? null,
        isCustom: !!gc.isCustom,
        isSeparator: false,
        isPlatform: sysGroup?.role === 'SUPERADMIN',
        isFavorites: isFavoritesGroup,
        isCollapsed: collapsedSet.has(gc.id),
        systemGroup: sysGroup,
        items,
      });
    }

    return result;
  }, [layout, isAdmin, isSuperAdmin, hasModule, isEditMode, editLayout, savedLayout]);
}
