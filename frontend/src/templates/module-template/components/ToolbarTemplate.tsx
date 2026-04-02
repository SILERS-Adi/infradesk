/**
 * IDS 1.0 — Toolbar Template
 *
 * USE WHEN: Any list page needs search + filters above a table.
 * NOT a reusable component — it's a PATTERN to copy and customize.
 *
 * Standard layout:
 * [SearchInput] [Filter Select] [Filter Select] ... [Right-aligned: count + CTA]
 */

import type { ReactNode } from 'react';
import { SearchInput } from '../../../components/ui/SearchInput';

interface ToolbarTemplateProps {
  /** Current search value */
  search: string;
  /** Search change handler */
  onSearchChange: (value: string) => void;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Filter elements (Selects, date pickers) */
  filters?: ReactNode;
  /** Right-aligned content (count label, CTA button) */
  right?: ReactNode;
}

/**
 * Reference toolbar layout. You can either:
 * 1. Use this component directly
 * 2. Copy the JSX pattern into your page (more flexible)
 */
export function ToolbarTemplate({ search, onSearchChange, searchPlaceholder, filters, right }: ToolbarTemplateProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20,
      flexWrap: 'wrap',
    }}>
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder={searchPlaceholder || 'Szukaj...'}
      />
      {filters}
      {right && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>{right}</div>}
    </div>
  );
}
