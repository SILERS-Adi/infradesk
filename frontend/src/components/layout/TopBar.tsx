import { useAuth } from '../../store/authStore';
import { useWorkspace } from '../../store/workspaceStore';
import { LogOut, Menu, Smartphone, Shield, Eye, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getInitials } from '../../utils/helpers';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import { getAllRouteTitles } from '../../modules/registry';
import type { MemberRole } from '../../types';

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/locations': 'Lokalizacje',
  '/devices': 'Urządzenia',
  '/vault': 'Sejf haseł',
  '/vault/mine': 'Moje wpisy',
  '/vault/shared': 'Współdzielone',
  '/credentials': 'Sejf haseł',
  '/tickets': 'Zgłoszenia',
  '/tasks': 'Zadania',
  '/calendar': 'Kalendarz',
  '/orders': 'Zamówienia',
  '/delegations': 'Delegacje',
  '/agents': 'Agenty',
  '/monitoring': 'Audyt i sieć',
  '/backups': 'Kopie zapasowe',
  '/activity-logs': 'Logi aktywności',
  '/crm': 'CRM',
  '/sessions': 'Sesje pracy',
  '/billing': 'Rozliczenia',
  '/ai': 'Asystent AI',
  '/users': 'Użytkownicy',
  '/settings': 'Ustawienia',
  '/my-company': 'Moja firma',
  '/sharing': 'Udostępnianie',
  '/downloads': 'Pobieranie',
  '/superadmin': 'SuperAdmin',
  '/skp': 'SKP',
  '/skp/inspections': 'Przeglądy',
  '/skp/vehicles': 'Pojazdy',
  // Module route titles (from IDS registry)
  ...getAllRouteTitles(),
};

const WS_ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  TECHNICIAN: 'Technik',
  MEMBER: 'Czlonek',
  VIEWER: 'Podglad',
};

const WS_ROLE_COLORS: Record<MemberRole, string> = {
  OWNER: '#8B5CF6',
  ADMIN: '#6366F1',
  TECHNICIAN: '#3B82F6',
  MEMBER: '#6B7280',
  VIEWER: '#9CA3AF',
};

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { role, isScoped, managedBy, isMspAssigned, isPreview, previewUserName } = useWorkspaceContext();
  const { stopPreview } = useWorkspace();

  if (!user) return null;

  const pathBase = '/' + location.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
  const pathFirst = '/' + (location.pathname.split('/').filter(Boolean)[0] || '');
  const pageTitle = ROUTE_TITLES[pathBase] || ROUTE_TITLES[pathFirst] || 'Panel';

  const roleColor = role ? WS_ROLE_COLORS[role] : undefined;

  return (
    <>
    {/* Preview banner */}
    {isPreview && (
      <div style={{
        background: 'linear-gradient(90deg, #FBBF24, #F59E0B)', color: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '5px 16px', fontSize: 12, fontWeight: 600,
      }}>
        <Eye style={{ width: 14, height: 14 }} />
        Podglad jako: {previewUserName} ({role})
        <button onClick={stopPreview}
          style={{ background: 'rgba(0,0,0,0.15)', border: 'none', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', color: '#000', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
          <X style={{ width: 11, height: 11 }} /> Zakoncz podglad
        </button>
      </div>
    )}
    <div className="topbar">
      {/* Mobile: hamburger */}
      <div className="md:hidden flex items-center gap-2">
        <button onClick={onMenuClick} style={{ color: 'var(--tm)', padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
          <Menu style={{ width: 18, height: 18 }} />
        </button>
        <img src="/logo.png" alt="InfraDesk" style={{ height: 48, objectFit: 'contain' }} />
      </div>

      {/* Workspace switcher */}
      <div className="hidden md:block">
        <WorkspaceSwitcher />
      </div>

      {/* Workspace role + scope badges */}
      {role && (
        <div className="hidden md:flex items-center gap-1.5">
          {/* Role badge */}
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
            background: `${roleColor}18`, color: roleColor, letterSpacing: '0.02em',
          }}>
            {WS_ROLE_LABELS[role]}
          </span>

          {/* Scope badge */}
          {isScoped && (
            <span style={{
              fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
              background: 'rgba(251,191,36,0.1)', color: '#FBBF24',
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}>
              <Eye style={{ width: 9, height: 9 }} />
              Ograniczony
            </span>
          )}

          {/* Managed by MSP */}
          {managedBy && isMspAssigned && (
            <span style={{
              fontSize: 9, fontWeight: 500, padding: '2px 7px', borderRadius: 6,
              background: 'rgba(99,102,241,0.06)', color: 'var(--td)',
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}>
              <Shield style={{ width: 8, height: 8 }} />
              {managedBy}
            </span>
          )}
        </div>
      )}

      {/* Page title */}
      <div className="hidden md:block" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ts)' }}>
        {pageTitle}
      </div>

      <div className="topbar-spacer" />

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate('/m')} title="Wersja mobilna"
          className="theme-toggle" style={{ marginRight: 0 }}>
          <Smartphone style={{ width: 14, height: 14 }} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(135deg, ${roleColor ?? '#4F8CFF'}, #7B5CFF)`, fontSize: 9, fontWeight: 700, color: '#fff',
          }}>
            {getInitials(user.firstName, user.lastName)}
          </div>
          <div className="hidden md:block" style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--ts)' }}>{user.firstName} {user.lastName}</div>
            <div style={{ fontSize: 9, color: 'var(--td)' }}>{role ? WS_ROLE_LABELS[role] : ''}</div>
          </div>
        </div>

        <button onClick={logout} title="Wyloguj"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--td)', padding: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <LogOut style={{ width: 14, height: 14 }} />
          <span className="hidden md:inline" style={{ fontSize: 10 }}>Wyloguj</span>
        </button>
      </div>
    </div>
    </>
  );
}
