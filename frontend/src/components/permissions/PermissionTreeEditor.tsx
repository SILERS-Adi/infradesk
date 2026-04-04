import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Lock, Info } from 'lucide-react';
import { apiClient } from '../../api/client';

interface TreeNode {
  nodeId: string;
  label: string;
  adminOnly?: boolean;
  children?: TreeNode[];
}

interface Override {
  nodeId: string;
  level: string;   // FULL | VIEW | NONE
  canDelete?: boolean;
}

interface Props {
  membershipId?: string;
  overrides: Override[];
  onChange: (overrides: Override[]) => void;
  readOnly?: boolean;
}

const LEVEL_OPTIONS = [
  { value: 'FULL', label: 'Pełny dostęp', color: '#22C55E', desc: 'Odczyt, tworzenie, edycja' },
  { value: 'VIEW', label: 'Tylko podgląd', color: '#3B82F6', desc: 'Tylko odczyt' },
  { value: 'NONE', label: 'Brak dostępu', color: '#6B7280', desc: 'Ukryte' },
] as const;

function getLevelConfig(level: string) {
  return LEVEL_OPTIONS.find(o => o.value === level) ?? LEVEL_OPTIONS[2];
}

export function PermissionTreeEditor({ overrides, onChange, readOnly }: Props) {
  const { data: treeData } = useQuery({
    queryKey: ['permission-tree'],
    queryFn: () => apiClient.get('/permissions/tree').then(r => r.data.tree as TreeNode[]),
    staleTime: 10 * 60_000,
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const overrideMap = new Map(overrides.map(o => [o.nodeId, o]));

  // Auto-expand modules that have overrides
  useEffect(() => {
    if (!treeData) return;
    const toExpand = new Set<string>();
    for (const o of overrides) {
      const dotIdx = o.nodeId.indexOf('.');
      if (dotIdx > 0) toExpand.add(o.nodeId.substring(0, dotIdx));
    }
    if (toExpand.size > 0) setExpanded(toExpand);
  }, [treeData, overrides]);

  const toggleExpand = (nodeId: string) => {
    setExpanded(s => { const n = new Set(s); if (n.has(nodeId)) n.delete(nodeId); else n.add(nodeId); return n; });
  };

  const getEffectiveLevel = (nodeId: string): string => {
    const exact = overrideMap.get(nodeId);
    if (exact) return exact.level;
    // Inherit from parent
    const dotIdx = nodeId.indexOf('.');
    if (dotIdx > 0) {
      const parentId = nodeId.substring(0, dotIdx);
      const parent = overrideMap.get(parentId);
      if (parent) return parent.level;
    }
    return 'NONE'; // default for restricted users
  };

  const isInherited = (nodeId: string): boolean => {
    return !overrideMap.has(nodeId);
  };

  const setLevel = (nodeId: string, level: string) => {
    if (readOnly) return;
    const newOverrides = overrides.filter(o => o.nodeId !== nodeId);
    if (level !== '__inherit__') {
      newOverrides.push({ nodeId, level, canDelete: false });
    }
    onChange(newOverrides);
  };

  const toggleCanDelete = (nodeId: string) => {
    if (readOnly) return;
    const existing = overrideMap.get(nodeId);
    if (!existing) return;
    const newOverrides = overrides.map(o =>
      o.nodeId === nodeId ? { ...o, canDelete: !o.canDelete } : o
    );
    onChange(newOverrides);
  };

  const setAllModules = (level: string) => {
    if (readOnly || !treeData) return;
    const newOverrides: Override[] = [];
    for (const mod of treeData) {
      newOverrides.push({ nodeId: mod.nodeId, level, canDelete: false });
    }
    onChange(newOverrides);
  };

  if (!treeData) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'var(--tm)', fontSize: 12 }}>Ładowanie drzewa uprawnień...</div>;
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Quick actions */}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
          <span style={{ fontSize: 10, color: 'var(--tm)', marginRight: 4, lineHeight: '24px' }}>Szybkie ustawienie:</span>
          {[
            { label: 'Wszystko pełne', level: 'FULL', color: '#22C55E' },
            { label: 'Wszystko podgląd', level: 'VIEW', color: '#3B82F6' },
            { label: 'Wszystko zablokowane', level: 'NONE', color: '#6B7280' },
          ].map(a => (
            <button key={a.level} type="button" onClick={() => setAllModules(a.level)}
              style={{
                padding: '3px 10px', borderRadius: 6, border: `1px solid ${a.color}30`,
                background: `${a.color}10`, color: a.color,
                fontSize: 10, fontWeight: 600, cursor: 'pointer',
              }}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      {/* Header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 140px 80px', gap: 8,
        padding: '8px 12px', borderBottom: '1px solid var(--border)',
        background: 'var(--hover-bg)',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tm)' }}>Moduł / Pozycja</span>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tm)' }}>Poziom dostępu</span>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--tm)' }}>Usuwanie</span>
      </div>

      {/* Tree */}
      {treeData.map((module, idx) => (
        <ModuleNode
          key={module.nodeId}
          node={module}
          depth={0}
          expanded={expanded}
          toggleExpand={toggleExpand}
          getEffectiveLevel={getEffectiveLevel}
          isInherited={isInherited}
          setLevel={setLevel}
          overrideMap={overrideMap}
          toggleCanDelete={toggleCanDelete}
          readOnly={readOnly}
          isLast={idx === treeData.length - 1}
        />
      ))}
    </div>
  );
}

function ModuleNode({
  node, depth, expanded, toggleExpand, getEffectiveLevel, isInherited, setLevel, overrideMap, toggleCanDelete, readOnly, isLast,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  getEffectiveLevel: (id: string) => string;
  isInherited: (id: string) => boolean;
  setLevel: (id: string, level: string) => void;
  overrideMap: Map<string, Override>;
  toggleCanDelete: (id: string) => void;
  readOnly?: boolean;
  isLast?: boolean;
}) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isExpanded = expanded.has(node.nodeId);
  const effectiveLevel = getEffectiveLevel(node.nodeId);
  const inherited = isInherited(node.nodeId);
  const levelConfig = getLevelConfig(effectiveLevel);
  const override = overrideMap.get(node.nodeId);
  const isAdminOnly = !!(node as any).adminOnly;

  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 140px 80px', gap: 8, alignItems: 'center',
        padding: `6px 12px 6px ${12 + depth * 20}px`,
        borderBottom: isLast && !isExpanded ? 'none' : '1px solid var(--border)',
        background: depth === 0 ? 'var(--hover-bg)' : 'transparent',
      }}>
        {/* Label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasChildren ? (
            <button onClick={() => toggleExpand(node.nodeId)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 0, display: 'flex' }}>
              {isExpanded ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
            </button>
          ) : (
            <span style={{ width: 14 }} />
          )}
          <span style={{
            fontSize: depth === 0 ? 12 : 11,
            fontWeight: depth === 0 ? 700 : 500,
            color: isAdminOnly ? 'var(--td)' : effectiveLevel === 'NONE' ? 'var(--td)' : 'var(--t)',
          }}>
            {node.label}
          </span>
          {inherited && depth > 0 && (
            <span style={{ fontSize: 9, color: 'var(--td)', fontStyle: 'italic' }}>dziedziczone</span>
          )}
          {isAdminOnly && (
            <span style={{
              fontSize: 9, fontWeight: 600, color: 'var(--td)', display: 'inline-flex', alignItems: 'center', gap: 3,
              background: 'var(--hover-bg)', padding: '1px 6px', borderRadius: 4,
            }}>
              <Lock style={{ width: 8, height: 8 }} /> Tylko administrator
            </span>
          )}
        </div>

        {/* Level selector */}
        <div>
          {isAdminOnly ? (
            <span style={{ fontSize: 10, color: 'var(--td)' }}>—</span>
          ) : readOnly ? (
            <span style={{ fontSize: 11, color: levelConfig.color, fontWeight: 600 }}>{levelConfig.label}</span>
          ) : (
            <select
              value={inherited ? '__inherit__' : effectiveLevel}
              onChange={e => setLevel(node.nodeId, e.target.value)}
              style={{
                width: '100%', padding: '4px 6px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                background: 'var(--bg)', border: `1px solid ${inherited ? 'var(--border)' : levelConfig.color + '40'}`,
                color: inherited ? 'var(--tm)' : levelConfig.color,
                cursor: 'pointer',
              }}
            >
              {depth > 0 && <option value="__inherit__">↳ Dziedzicz z modułu</option>}
              <option value="FULL">Pełny dostęp</option>
              <option value="VIEW">Tylko podgląd</option>
              <option value="NONE">Brak dostępu</option>
            </select>
          )}
        </div>

        {/* canDelete toggle */}
        <div>
          {isAdminOnly || effectiveLevel === 'NONE' || effectiveLevel === 'VIEW' ? (
            <span style={{ fontSize: 10, color: 'var(--td)' }}>—</span>
          ) : readOnly ? (
            <span style={{ fontSize: 10, color: override?.canDelete ? '#F59E0B' : 'var(--td)' }}>
              {override?.canDelete ? 'Tak' : 'Nie'}
            </span>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!override?.canDelete}
                onChange={() => toggleCanDelete(node.nodeId)}
                disabled={!override}
                style={{ accentColor: '#F59E0B' }}
              />
              <span style={{ fontSize: 10, color: override?.canDelete ? '#F59E0B' : 'var(--td)' }}>
                {override?.canDelete ? 'Tak' : 'Nie'}
              </span>
            </label>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && node.children!.map((child, i) => (
        <ModuleNode
          key={child.nodeId}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          toggleExpand={toggleExpand}
          getEffectiveLevel={getEffectiveLevel}
          isInherited={isInherited}
          setLevel={setLevel}
          overrideMap={overrideMap}
          toggleCanDelete={toggleCanDelete}
          readOnly={readOnly}
          isLast={i === node.children!.length - 1 && isLast}
        />
      ))}
    </div>
  );
}
