import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Building2, User, Server, Shield } from 'lucide-react';
import { useWorkspace } from '../../store/workspaceStore';
import { workspacesApi } from '../../api/workspaces';
import { useAuth } from '../../store/authStore';
import type { WorkspaceType, MemberRole } from '../../types';

const TYPE_ICONS: Record<WorkspaceType, typeof Building2> = {
  MSP: Server,
  COMPANY: Building2,
  PERSONAL: User,
};

const TYPE_LABELS: Record<WorkspaceType, string> = {
  MSP: 'MSP',
  COMPANY: 'Firma',
  PERSONAL: 'Osobisty',
};

const ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: 'Wlasciciel',
  ADMIN: 'Admin',
  TECHNICIAN: 'Technik',
  MEMBER: 'Czlonek',
  VIEWER: 'Obserwator',
};

export function WorkspaceSwitcher() {
  const { isAuthenticated } = useAuth();
  const { workspaces, current, switchWorkspace, setWorkspaces, isLoading } = useWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Fetch workspaces
  const { data } = useQuery({
    queryKey: ['workspaces', 'my'],
    queryFn: workspacesApi.getMyWorkspaces,
    enabled: isAuthenticated,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Sync to store
  useEffect(() => {
    if (data && data.length > 0) {
      setWorkspaces(data);
    }
  }, [data, setWorkspaces]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!isAuthenticated || isLoading || !current) return null;

  const TypeIcon = TYPE_ICONS[current.type] ?? Building2;
  const hasMultiple = workspaces.length > 1;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        ref={btnRef}
        onClick={() => {
          if (!hasMultiple) return;
          if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setDropPos({ top: rect.bottom + 6, left: rect.left });
          }
          setOpen(!open);
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 8,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          cursor: hasMultiple ? 'pointer' : 'default',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => hasMultiple && ((e.target as HTMLElement).style.borderColor = 'var(--border-l)')}
        onMouseLeave={e => ((e.target as HTMLElement).style.borderColor = 'var(--border)')}
      >
        <TypeIcon style={{ width: 13, height: 13, color: 'var(--accent)' }} />
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t)', lineHeight: 1.2, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {current.name}
          </div>
          <div style={{ fontSize: 8, color: 'var(--td)', lineHeight: 1 }}>
            {TYPE_LABELS[current.type]} · {ROLE_LABELS[current.role]}
          </div>
        </div>
        {hasMultiple && (
          <ChevronDown style={{ width: 11, height: 11, color: 'var(--td)', transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'fixed', top: dropPos.top, left: dropPos.left,
          minWidth: 280, maxHeight: 400, overflowY: 'auto',
          background: 'var(--bg2)', border: '1px solid var(--border-l)',
          borderRadius: 12, padding: 4,
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(12px)',
          zIndex: 9999,
        }}>
          {workspaces.map(ws => {
            const Icon = TYPE_ICONS[ws.type] ?? Building2;
            const isActive = ws.workspaceId === current.workspaceId;
            return (
              <button
                key={ws.workspaceId}
                onClick={() => { switchWorkspace(ws.workspaceId); setOpen(false); window.location.reload(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  background: isActive ? 'var(--accent-g)' : 'transparent',
                  border: 'none', cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => !isActive && ((e.target as HTMLElement).style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={e => !isActive && ((e.target as HTMLElement).style.background = 'transparent')}
              >
                <Icon style={{ width: 14, height: 14, color: isActive ? 'var(--accent)' : 'var(--tm)', flexShrink: 0 }} />
                <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--accent)' : 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ws.name}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--td)', display: 'flex', gap: 6 }}>
                    <span>{TYPE_LABELS[ws.type]}</span>
                    <span>{ROLE_LABELS[ws.role]}</span>
                    {ws.scopeType === 'SCOPED' && <span style={{ color: 'var(--accent)' }}>Ograniczony</span>}
                  </div>
                  {ws.managedBy && (
                    <div style={{ fontSize: 8, color: 'var(--td)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                      <Shield style={{ width: 8, height: 8 }} />
                      {ws.managedBy}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
