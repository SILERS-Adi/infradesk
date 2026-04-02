/**
 * IDS 1.0 — InfraDesk Module Registry
 *
 * Central registry of all platform modules. Used by:
 * - Sidebar (to render module nav groups)
 * - TopBar (to resolve page titles from routes)
 * - App.tsx (to mount module routes — future)
 *
 * Each module declares its navigation items and route titles.
 * The platform shell reads this registry and renders dynamically.
 *
 * IMPORTANT: This file is the single source of truth for module
 * metadata. When adding a new module, add it here — not scattered
 * across Sidebar.tsx, TopBar.tsx, and App.tsx.
 */

import type { ReactNode } from 'react';

// ── Types ──

export interface ModuleNavItem {
  /** Route path (e.g. '/invoicing/documents') */
  to: string;
  /** Display label */
  label: string;
  /** Lucide icon ReactNode — must use className="nav-icon" */
  icon: ReactNode;
  /** Badge count (e.g. pending items) */
  badge?: number;
  /** Feature flag — item hidden if workspace doesn't have this feature */
  feature?: string;
  /** Minimum role required to see this item */
  role?: 'ADMIN' | 'SUPERADMIN';
}

export interface ModuleDefinition {
  /** Unique module identifier (e.g. 'invoicing', 'service') */
  id: string;
  /** Human-readable module label (e.g. 'Faktury') */
  label: string;
  /** URL base path (e.g. '/invoicing') */
  basePath: string;
  /** Feature flag to enable/disable entire module per workspace */
  featureFlag?: string;
  /** Sidebar section label (uppercase, e.g. 'FAKTURY') */
  sidebarLabel: string;
  /** Navigation items for sidebar */
  navItems: ModuleNavItem[];
  /** Route path → page title mapping for TopBar */
  routeTitles: Record<string, string>;
  /** Minimum role to see the entire module (optional) */
  role?: 'ADMIN' | 'SUPERADMIN';
}

// ── Module Definitions ──

// NOTE: Icons are NOT imported here to avoid circular dependencies.
// The Sidebar component maps module IDs to icons locally.
// navItems[].icon will be populated when Sidebar reads the registry.

/**
 * Helpdesk module — already built into InfraDesk.
 * Defined here for reference. The actual navGroups in Sidebar.tsx
 * remain the source of truth until full migration to registry.
 */
export const helpdeskModule: ModuleDefinition = {
  id: 'helpdesk',
  label: 'Helpdesk',
  basePath: '/tickets',
  sidebarLabel: 'SERWIS',
  navItems: [], // Populated by Sidebar.tsx (existing navGroups)
  routeTitles: {
    '/ids-preview': 'IDS 1.0 — Preview',
    '/tickets': 'Zgłoszenia',
    '/tasks': 'Zadania',
    '/calendar': 'Kalendarz',
    '/orders': 'Zamówienia',
    '/delegations': 'Delegacje',
  },
};

/**
 * Invoicing module — under development.
 * Will be fully integrated after Faktury frontend is complete.
 */
export const invoicingModule: ModuleDefinition = {
  id: 'invoicing',
  label: 'Faktury',
  basePath: '/invoicing',
  featureFlag: 'invoicing',
  sidebarLabel: 'FAKTURY',
  navItems: [
    // Icons will be injected by Sidebar — stored as null placeholders
    { to: '/invoicing', label: 'Dashboard', icon: null },
    { to: '/invoicing/documents', label: 'Dokumenty', icon: null },
    { to: '/invoicing/contractors', label: 'Kontrahenci', icon: null },
    { to: '/invoicing/products', label: 'Produkty', icon: null },
    { to: '/invoicing/warehouses', label: 'Magazyn', icon: null },
    { to: '/invoicing/payments', label: 'Płatności', icon: null },
    { to: '/invoicing/reports', label: 'Raporty', icon: null },
    { to: '/invoicing/import', label: 'Import', icon: null },
  ],
  routeTitles: {
    '/invoicing': 'Faktury',
    '/invoicing/documents': 'Faktury — Dokumenty',
    '/invoicing/documents/new': 'Faktury — Nowy dokument',
    '/invoicing/documents/:id/edit': 'Faktury — Edycja dokumentu',
    '/invoicing/contractors': 'Faktury — Kontrahenci',
    '/invoicing/contractors/new': 'Faktury — Nowy kontrahent',
    '/invoicing/contractors/:id/edit': 'Faktury — Edycja kontrahenta',
    '/invoicing/products': 'Faktury — Produkty',
    '/invoicing/warehouses': 'Faktury — Magazyn',
    '/invoicing/payments': 'Faktury — Płatności',
    '/invoicing/reports': 'Faktury — Raporty',
    '/invoicing/import': 'Faktury — Import danych',
  },
};

/**
 * Service module — future.
 * Placeholder for SKP/vehicle inspection module.
 */
export const serviceModule: ModuleDefinition = {
  id: 'service',
  label: 'Serwis',
  basePath: '/service',
  featureFlag: 'service',
  sidebarLabel: 'SERWIS SKP',
  navItems: [],
  routeTitles: {
    '/service': 'Serwis',
  },
};

/**
 * Packaging module — future.
 * Placeholder for Allegro/logistics packaging module.
 */
export const packagingModule: ModuleDefinition = {
  id: 'packaging',
  label: 'Pakowanie',
  basePath: '/packaging',
  featureFlag: 'packaging',
  sidebarLabel: 'PAKOWANIE',
  navItems: [
    { to: '/packaging', label: 'Dashboard', icon: null },
    { to: '/packaging/shipments', label: 'Przesyłki', icon: null },
  ],
  routeTitles: {
    '/packaging': 'Pakowanie',
    '/packaging/shipments': 'Pakowanie — Przesyłki',
    '/packaging/shipments/new': 'Pakowanie — Nowa przesyłka',
  },
};

// ── Registry ──

/**
 * All registered modules. Order determines sidebar display order.
 * Only modules with navItems.length > 0 will show in sidebar.
 */
export const moduleRegistry: ModuleDefinition[] = [
  helpdeskModule,
  invoicingModule,
  serviceModule,
  packagingModule,
];

// ── Helpers ──

/**
 * Get merged route titles from all modules.
 * Used by TopBar to auto-resolve page titles.
 */
export function getAllRouteTitles(): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const mod of moduleRegistry) {
    Object.assign(titles, mod.routeTitles);
  }
  return titles;
}

/**
 * Find which module owns a given path.
 * Returns undefined if path doesn't belong to any module.
 */
export function getModuleForPath(path: string): ModuleDefinition | undefined {
  return moduleRegistry.find((m) => path.startsWith(m.basePath));
}

/**
 * Get active modules (ones that have navItems defined).
 * Excludes placeholder/empty modules.
 */
export function getActiveModules(): ModuleDefinition[] {
  return moduleRegistry.filter((m) => m.navItems.length > 0);
}
