import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Building2, User, Server, Shield, Pencil, Search } from 'lucide-react';
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
  const { workspaces, current, switchWorkspace, setWorkspaces, markResolved, isLoading } = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Fetch workspaces
  const { data, isError, isFetched } = useQuery({
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
    } else if (data && data.length === 0) {
      // User has no workspaces — mark resolved so guards can show fallback
      markResolved();
    }
  }, [data, setWorkspaces, markResolved]);

  // If query failed, also mark resolved so guards don't hang
  useEffect(() => {
    if (isError && isLoading) {
      markResolved();
    }
  }, [isError, isLoading, markResolved]);

  // Close on outside click (check both trigger ref and portal dropdown ref)
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (dropRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

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

      {/* Dropdown — rendered via Portal to escape .main overflow:hidden */}
      {open && createPortal(
        <div ref={dropRef} style={{
          position: 'fixed', top: dropPos.top, left: dropPos.left,
          width: 360, maxHeight: 500, overflowY: 'auto',
          background: '#0F1628', border: '1px solid var(--border-l)',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          zIndex: 99999,
        }} className="workspace-switcher-dropdown">
          {/* Search */}
          {workspaces.length > 5 && (
            <div style={{ padding: 10, borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: '#0F1628', zIndex: 2 }}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--td)' }} />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Szukaj firmy lub NIP..." autoFocus
                  style={{
                    width: '100%', padding: '8px 12px 8px 30px', fontSize: 12, borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)', outline: 'none',
                  }} />
              </div>
            </div>
          )}

          <div style={{ padding: 4 }}>
          {workspaces
            .filter(ws => {
              if (!search) return true;
              const q = search.toLowerCase();
              return ws.name.toLowerCase().includes(q) || ((ws as any).taxId || '').toLowerCase().includes(q);
            })
            .map(ws => {
            const Icon = TYPE_ICONS[ws.type] ?? Building2;
            const isActive = ws.workspaceId === current.workspaceId;
            return (
              <div
                key={ws.workspaceId}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '10px 10px', borderRadius: 8,
                  background: isActive ? 'var(--accent-g)' : 'transparent',
                  transition: 'background 0.12s', cursor: 'pointer',
                }}
                onMouseEnter={e => !isActive && ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={e => !isActive && ((e.currentTarget as HTMLElement).style.background = 'transparent')}
              >
                <div
                  onClick={() => { switchWorkspace(ws.workspaceId); setOpen(false); window.location.reload(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  {(ws as any).logoUrl ? (
                    <img src={(ws as any).logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: isActive ? 'var(--accent-g)' : 'var(--hover-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon style={{ width: 14, height: 14, color: isActive ? 'var(--accent)' : 'var(--tm)' }} />
                    </div>
                  )}
                  <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 500, color: isActive ? 'var(--accent-s, var(--accent))' : 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ws.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--td)', display: 'flex', gap: 8, alignItems: 'center', marginTop: 1 }}>
                      {(ws as any).taxId && (
                        <span style={{ fontFamily: 'monospace', color: 'var(--tm)' }}>NIP: {(ws as any).taxId}</span>
                      )}
                      <span>{TYPE_LABELS[ws.type]}</span>
                      {(ws as any).city && <span>· {(ws as any).city}</span>}
                    </div>
                    {ws.managedBy && (
                      <div style={{ fontSize: 9, color: 'var(--td)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                        <Shield style={{ width: 9, height: 9 }} />
                        {ws.managedBy}
                      </div>
                    )}
                  </div>
                </div>
                {/* Edit button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setOpen(false); if (!isActive) { switchWorkspace(ws.workspaceId); setTimeout(() => navigate('/company'), 100); } else { navigate('/company'); } }}
                  title="Edytuj firmę"
                  style={{
                    padding: 6, borderRadius: 6, border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--td)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    transition: 'all .15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--td)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}>
                  <Pencil size={12} />
                </button>
              </div>
            );
          })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
