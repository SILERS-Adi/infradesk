import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { api } from '@/lib/api';

interface TreeNode {
  nodeId: string;
  label: string;
  adminOnly?: boolean;
  children?: TreeNode[];
}

export interface Override {
  nodeId: string;
  level: 'FULL' | 'VIEW' | 'NONE';
  canDelete?: boolean;
}

interface Props {
  overrides: Override[];
  onChange: (overrides: Override[]) => void;
  readOnly?: boolean;
}

const LEVELS = [
  { value: 'FULL', label: 'Pełny', color: 'var(--ok)', desc: 'Odczyt, tworzenie, edycja' },
  { value: 'VIEW', label: 'Podgląd', color: 'var(--in)', desc: 'Tylko odczyt' },
  { value: 'NONE', label: 'Brak', color: 'var(--tx3)', desc: 'Ukryte' },
] as const;

export function PermissionTreeEditor({ overrides, onChange, readOnly }: Props) {
  const { data } = useQuery<{ tree: TreeNode[] }>({
    queryKey: ['permission-tree'],
    queryFn: async () => (await api.get('/permissions/tree')).data,
    staleTime: 10 * 60_000,
  });
  const tree = data?.tree ?? [];

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const map = new Map(overrides.map((o) => [o.nodeId, o]));

  useEffect(() => {
    const toExpand = new Set<string>();
    for (const o of overrides) {
      const dot = o.nodeId.indexOf('.');
      if (dot > 0) toExpand.add(o.nodeId.substring(0, dot));
    }
    if (toExpand.size > 0) setExpanded(toExpand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.length]);

  function getLevel(nodeId: string): 'FULL' | 'VIEW' | 'NONE' {
    const exact = map.get(nodeId);
    if (exact) return exact.level;
    const dot = nodeId.indexOf('.');
    if (dot > 0) {
      const parent = map.get(nodeId.substring(0, dot));
      if (parent) return parent.level;
    }
    return 'NONE';
  }
  function isInherited(nodeId: string): boolean {
    return !map.has(nodeId);
  }
  function setLevel(nodeId: string, level: 'FULL' | 'VIEW' | 'NONE') {
    if (readOnly) return;
    const next = overrides.filter((o) => o.nodeId !== nodeId);
    next.push({ nodeId, level });
    onChange(next);
  }

  function toggleExpand(nodeId: string) {
    setExpanded((s) => { const n = new Set(s); if (n.has(nodeId)) n.delete(nodeId); else n.add(nodeId); return n; });
  }

  return (
    <div className="border border-bd rounded-[var(--r-s)] overflow-hidden">
      {tree.map((group) => {
        const isOpen = expanded.has(group.nodeId);
        const groupLvl = getLevel(group.nodeId);
        const groupInh = isInherited(group.nodeId);
        return (
          <div key={group.nodeId} className="border-b border-bd last:border-0">
            <div className="flex items-center gap-2 p-2.5 bg-sf-h">
              <button type="button" onClick={() => toggleExpand(group.nodeId)}
                className="p-0.5 rounded hover:bg-sf2">
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              <span className="text-[13px] font-semibold text-tx flex-1 flex items-center gap-1.5">
                {group.label}
                {group.adminOnly && <Lock className="h-2.5 w-2.5 text-tx3" />}
              </span>
              <LevelBadge level={groupLvl} inherited={groupInh} onChange={(l) => setLevel(group.nodeId, l)} readOnly={readOnly} />
            </div>
            {isOpen && group.children?.map((child) => {
              const lvl = getLevel(child.nodeId);
              const inh = isInherited(child.nodeId);
              return (
                <div key={child.nodeId} className="flex items-center gap-2 px-8 py-2 border-t border-bd/40 hover:bg-sf-h">
                  <span className="text-[12px] text-tx2 flex-1 flex items-center gap-1.5">
                    {child.label}
                    {child.adminOnly && <Lock className="h-2.5 w-2.5 text-tx3" />}
                  </span>
                  <LevelBadge level={lvl} inherited={inh} onChange={(l) => setLevel(child.nodeId, l)} readOnly={readOnly} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function LevelBadge({
  level, inherited, onChange, readOnly,
}: {
  level: 'FULL' | 'VIEW' | 'NONE';
  inherited: boolean;
  onChange: (l: 'FULL' | 'VIEW' | 'NONE') => void;
  readOnly?: boolean;
}) {
  const cfg = LEVELS.find((o) => o.value === level)!;
  if (readOnly) {
    return <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `color-mix(in srgb, ${cfg.color} 14%, transparent)`, color: cfg.color }}>{cfg.label}</span>;
  }
  return (
    <div className="flex items-center gap-0.5">
      {LEVELS.map((l) => {
        const active = l.value === level;
        return (
          <button key={l.value} type="button"
            onClick={() => onChange(l.value)}
            className="px-2 py-0.5 rounded text-[10px] font-semibold transition-colors"
            style={{
              background: active ? `color-mix(in srgb, ${l.color} 18%, transparent)` : 'transparent',
              color: active ? l.color : 'var(--tx3)',
              border: `1px solid ${active ? l.color : 'var(--bd)'}`,
              opacity: inherited && !active ? 0.4 : 1,
            }}
            title={l.desc}
          >
            {l.label}
          </button>
        );
      })}
      {inherited && (
        <span className="text-[9px] text-tx3 ml-1" title="Dziedziczone z nadrzędnego modułu">dz.</span>
      )}
    </div>
  );
}
