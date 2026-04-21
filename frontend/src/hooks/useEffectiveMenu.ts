import { useMemo } from 'react';
import {
  SYSTEM_GROUPS, SYSTEM_ITEMS, ITEMS_BY_ID, GROUPS_BY_ID,
  buildDefaultLayout, getFeatureFlags,
  type MenuLayout, type MenuGroupConfig, type SystemMenuItem, type SystemMenuGroup,
  type FeatureFlags,
} from '../config/menuRegistry';
import { useMenuStore } from '../store/menuStore';
import { useWorkspaceContext } from './useWorkspaceContext';
import { useAuth } from '../store/authStore';
import { useMyPermissions, canSeeModule } from './useMyPermissions';

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
  locked?: boolean;
}

/**
 * Merges system registry + user layout + permissions + feature flags into effective menu.
 */
export function useEffectiveMenu(): EffectiveGroup[] {
  const { isAdmin, hasModule, wsType, wsPlan, features } = useWorkspaceContext();
  const { data: myPerms } = useMyPermissions();
  const { user } = useAuth();
  const isSuperAdmin = !!user?.isSuperAdmin;

  const isEditMode = useMenuStore(s => s.isEditMode);
  const editLayout = useMenuStore(s => s.editLayout);
  const savedLayout = useMenuStore(s => s.layout);

  const layout = isEditMode ? editLayout : savedLayout;

  return useMemo(() => {
    const effective = layout ?? buildDefaultLayout();

    // Debug
    if (typeof window !== 'undefined' && (window as any).__INFRADESK_DEBUG) {
      console.log('[Menu]', { wsType, wsPlan, features });
    }

    const canSeeGroup = (groupId: string): boolean => {
      const sg = GROUPS_BY_ID.get(groupId);
      if (!sg) return true; // custom group
      if (sg.superadminOnly) return isSuperAdmin;
      if (sg.wsTypes && !sg.wsTypes.includes(wsType)) return false;
      if (sg.permanent) return true;
      if (sg.module && !hasModule(sg.module)) return false;
      if (sg.adminOnly) return isAdmin;
      return true;
    };

    const canSeeItem = (itemId: string): boolean => {
      const si = ITEMS_BY_ID.get(itemId);
      if (!si) return false;
      if (si.wsTypes && !si.wsTypes.includes(wsType)) return false;
      if (si.feature && !(features as unknown as Record<string, boolean>)[si.feature]) return false;
      if (si.module && !hasModule(si.module)) return false;
      if (si.adminOnly) return isAdmin;
      // User-level permission override
      if (si.module && !canSeeModule(myPerms, si.module)) return false;
      // Hierarchical permission: <groupId>.<itemId> also acts as an override key
      // Lets admin block specific items under allowed group (e.g. infrastructure.activity-logs)
      if (si.groupId && !canSeeModule(myPerms, `${si.groupId}.${itemId}`)) return false;
      return true;
    };

    // Collect known items
    const knownItemIds = new Set<string>();
    for (const group of effective.groups) {
      for (const itemId of group.items) knownItemIds.add(itemId);
    }
    for (const id of effective.hiddenItems) knownItemIds.add(id);

    // Auto-discovery: new system items not in layout
    const workingGroups: MenuGroupConfig[] = effective.groups.map(g => ({ ...g, items: [...g.items] }));

    for (const sysItem of SYSTEM_ITEMS) {
      if (knownItemIds.has(sysItem.id)) continue;
      let targetGroup = workingGroups.find(g => g.id === sysItem.groupId);
      if (!targetGroup) {
        const sysGroup = GROUPS_BY_ID.get(sysItem.groupId);
        if (sysGroup) {
          const insertAt = workingGroups.length;
          targetGroup = { id: sysGroup.id, items: [] };
          workingGroups.splice(insertAt, 0, targetGroup);
        }
      }
      if (targetGroup) targetGroup.items.push(sysItem.id);
    }

    const hiddenSet = new Set(effective.hiddenItems);
    const collapsedSet = new Set(effective.collapsedGroups);
    const favoriteSet = new Set(effective.favoriteItems ?? []);

    const result: EffectiveGroup[] = [];

    for (const gc of workingGroups) {
      if (gc.isSeparator) {
        result.push({
          id: gc.id, label: '', color: null, isCustom: false, isSeparator: true,
          isPlatform: false, isFavorites: false, isCollapsed: false, systemGroup: null, items: [],
        });
        continue;
      }

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
          locked: si.locked,
        });
      }

      if (!isEditMode && isFavoritesGroup && items.filter(i => !i.hidden).length === 0) continue;
      if (!isEditMode && !isFavoritesGroup && items.filter(i => !i.hidden).length === 0) continue;
      if (isEditMode && items.length === 0 && !gc.isCustom && !isFavoritesGroup) continue;

      result.push({
        id: gc.id,
        label: gc.label ?? sysGroup?.label ?? '',
        color: gc.color ?? null,
        isCustom: !!gc.isCustom,
        isSeparator: false,
        isPlatform: sysGroup?.superadminOnly === true,
        isFavorites: isFavoritesGroup,
        isCollapsed: collapsedSet.has(gc.id),
        systemGroup: sysGroup,
        items,
      });
    }

    return result;
  }, [layout, isAdmin, isSuperAdmin, hasModule, wsType, wsPlan, features, isEditMode, editLayout, savedLayout]);
}
