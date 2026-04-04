import { create } from 'zustand';
import type { MenuLayout, MenuGroupConfig } from '../config/menuRegistry';
import { buildDefaultLayout } from '../config/menuRegistry';

interface MenuStore {
  /** Saved layout from API (null = use defaults) */
  layout: MenuLayout | null;
  /** Whether layout has been fetched from API */
  loaded: boolean;
  /** Edit mode state */
  isEditMode: boolean;
  /** Snapshot before edit (for cancel) */
  editSnapshot: MenuLayout | null;
  /** Working copy during edit */
  editLayout: MenuLayout | null;
  /** Saving in progress */
  isSaving: boolean;
  /** Last save error */
  saveError: string | null;

  // ── Actions ──
  setLayout: (layout: MenuLayout | null) => void;
  setLoaded: () => void;
  enterEditMode: () => void;
  cancelEditMode: () => void;
  /** Commit editLayout to layout (caller handles API save) */
  commitEdit: () => MenuLayout;
  setSaving: (saving: boolean) => void;
  setSaveError: (error: string | null) => void;
  resetLayout: () => void;

  // ── Edit operations (modify editLayout only) ──
  moveItem: (itemId: string, fromGroupId: string, toGroupId: string, newIndex: number) => void;
  moveGroup: (fromIndex: number, toIndex: number) => void;
  toggleItemVisibility: (itemId: string) => void;
  renameGroup: (groupId: string, label: string) => void;
  setGroupColor: (groupId: string, color: string | null) => void;
  addCustomGroup: (label: string) => void;
  removeCustomGroup: (groupId: string) => void;
  addSeparator: (afterIndex: number) => void;
  removeSeparator: (separatorId: string) => void;
  toggleGroupCollapse: (groupId: string) => void;
  toggleFavorite: (itemId: string) => void;
}

function cloneLayout(layout: MenuLayout): MenuLayout {
  return JSON.parse(JSON.stringify(layout));
}

function getEffective(layout: MenuLayout | null): MenuLayout {
  return layout ?? buildDefaultLayout();
}

export const useMenuStore = create<MenuStore>((set, get) => ({
  layout: null,
  loaded: false,
  isEditMode: false,
  editSnapshot: null,
  editLayout: null,
  isSaving: false,
  saveError: null,

  setLayout: (layout) => set({ layout }),
  setLoaded: () => set({ loaded: true }),

  enterEditMode: () => {
    const effective = getEffective(get().layout);
    set({
      isEditMode: true,
      editSnapshot: cloneLayout(effective),
      editLayout: cloneLayout(effective),
      saveError: null,
    });
  },

  cancelEditMode: () => set({
    isEditMode: false,
    editSnapshot: null,
    editLayout: null,
    saveError: null,
  }),

  commitEdit: () => {
    const editLayout = get().editLayout!;
    set({
      layout: cloneLayout(editLayout),
      isEditMode: false,
      editSnapshot: null,
      editLayout: null,
      saveError: null,
    });
    return editLayout;
  },

  setSaving: (isSaving) => set({ isSaving }),
  setSaveError: (saveError) => set({ saveError }),

  resetLayout: () => set({
    layout: null,
    isEditMode: false,
    editSnapshot: null,
    editLayout: null,
    saveError: null,
  }),

  // ── Edit operations ──

  moveItem: (itemId, fromGroupId, toGroupId, newIndex) => set(s => {
    if (!s.editLayout) return s;
    const layout = cloneLayout(s.editLayout);
    // Remove from source group
    const fromGroup = layout.groups.find(g => g.id === fromGroupId);
    if (fromGroup) {
      fromGroup.items = fromGroup.items.filter(id => id !== itemId);
    }
    // Also remove from hidden if moving
    layout.hiddenItems = layout.hiddenItems.filter(id => id !== itemId);
    // Insert into target group
    const toGroup = layout.groups.find(g => g.id === toGroupId);
    if (toGroup) {
      toGroup.items.splice(newIndex, 0, itemId);
    }
    return { editLayout: layout };
  }),

  moveGroup: (fromIndex, toIndex) => set(s => {
    if (!s.editLayout) return s;
    const layout = cloneLayout(s.editLayout);
    const [moved] = layout.groups.splice(fromIndex, 1);
    layout.groups.splice(toIndex, 0, moved);
    return { editLayout: layout };
  }),

  toggleItemVisibility: (itemId) => set(s => {
    if (!s.editLayout) return s;
    const layout = cloneLayout(s.editLayout);
    const idx = layout.hiddenItems.indexOf(itemId);
    if (idx >= 0) {
      layout.hiddenItems.splice(idx, 1);
    } else {
      layout.hiddenItems.push(itemId);
    }
    return { editLayout: layout };
  }),

  renameGroup: (groupId, label) => set(s => {
    if (!s.editLayout) return s;
    const layout = cloneLayout(s.editLayout);
    const group = layout.groups.find(g => g.id === groupId);
    if (group) group.label = label;
    return { editLayout: layout };
  }),

  setGroupColor: (groupId, color) => set(s => {
    if (!s.editLayout) return s;
    const layout = cloneLayout(s.editLayout);
    const group = layout.groups.find(g => g.id === groupId);
    if (group) group.color = color;
    return { editLayout: layout };
  }),

  addCustomGroup: (label) => set(s => {
    if (!s.editLayout) return s;
    const layout = cloneLayout(s.editLayout);
    const id = 'custom_' + Date.now().toString(36);
    layout.groups.push({ id, label, items: [], isCustom: true });
    return { editLayout: layout };
  }),

  removeCustomGroup: (groupId) => set(s => {
    if (!s.editLayout) return s;
    const layout = cloneLayout(s.editLayout);
    const group = layout.groups.find(g => g.id === groupId);
    if (!group?.isCustom && !group?.isSeparator) return s;
    // Move items back to hidden
    if (group.items.length > 0) {
      layout.hiddenItems.push(...group.items);
    }
    layout.groups = layout.groups.filter(g => g.id !== groupId);
    return { editLayout: layout };
  }),

  addSeparator: (afterIndex) => set(s => {
    if (!s.editLayout) return s;
    const layout = cloneLayout(s.editLayout);
    const id = 'sep_' + Date.now().toString(36);
    layout.groups.splice(afterIndex + 1, 0, {
      id,
      label: null,
      items: [],
      isSeparator: true,
    });
    return { editLayout: layout };
  }),

  removeSeparator: (separatorId) => set(s => {
    if (!s.editLayout) return s;
    const layout = cloneLayout(s.editLayout);
    layout.groups = layout.groups.filter(g => g.id !== separatorId);
    return { editLayout: layout };
  }),

  toggleGroupCollapse: (groupId) => set(s => {
    if (!s.editLayout) return s;
    const layout = cloneLayout(s.editLayout);
    const idx = layout.collapsedGroups.indexOf(groupId);
    if (idx >= 0) layout.collapsedGroups.splice(idx, 1);
    else layout.collapsedGroups.push(groupId);
    return { editLayout: layout };
  }),

  toggleFavorite: (itemId) => set(s => {
    if (!s.editLayout) return s;
    const layout = cloneLayout(s.editLayout);
    if (!layout.favoriteItems) layout.favoriteItems = [];
    const idx = layout.favoriteItems.indexOf(itemId);
    if (idx >= 0) {
      layout.favoriteItems.splice(idx, 1);
      // Remove from favorites group if present
      const favGroup = layout.groups.find(g => g.id === 'favorites');
      if (favGroup) favGroup.items = favGroup.items.filter(id => id !== itemId);
    } else {
      layout.favoriteItems.push(itemId);
      // Add to favorites group
      let favGroup = layout.groups.find(g => g.id === 'favorites');
      if (!favGroup) {
        favGroup = { id: 'favorites', items: [] };
        layout.groups.unshift(favGroup);
      }
      if (!favGroup.items.includes(itemId)) {
        favGroup.items.push(itemId);
      }
    }
    return { editLayout: layout };
  }),
}));

/** Check if editLayout differs from snapshot */
export function useIsDirty(): boolean {
  const snapshot = useMenuStore(s => s.editSnapshot);
  const editLayout = useMenuStore(s => s.editLayout);
  if (!snapshot || !editLayout) return false;
  return JSON.stringify(snapshot) !== JSON.stringify(editLayout);
}
