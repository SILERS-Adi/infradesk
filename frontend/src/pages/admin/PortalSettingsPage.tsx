import { useState, useEffect } from 'react';
import { Settings, FileText, ListChecks, Route, Clock, Share2, Eye, Bell } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext';
import type { WorkspaceType } from '../../config/menuRegistry';

// Lazy imports for existing sub-pages
import HelpdeskSettingsContent from './HelpdeskSettingsContent';
import SlaContent from './SlaContent';
import SharingContent from './SharingContent';

interface Tab {
  id: string;
  label: string;
  icon: typeof Settings;
  wsTypes?: WorkspaceType[];
}

const TABS: Tab[] = [
  { id: 'general',        label: 'Ogólne',                 icon: Settings },
  { id: 'forms',          label: 'Formularze zgłoszeń',    icon: FileText },
  { id: 'categories',     label: 'Kategorie i priorytety', icon: ListChecks },
  { id: 'rules',          label: 'Reguły obsługi',         icon: Route,     wsTypes: ['internal_it', 'msp'] },
  { id: 'sla',            label: 'SLA',                    icon: Clock,     wsTypes: ['internal_it', 'msp'] },
  { id: 'sharing',        label: 'Udostępnianie',          icon: Share2 },
  { id: 'visibility',     label: 'Widoczność dla klienta', icon: Eye,       wsTypes: ['msp'] },
  { id: 'notifications',  label: 'Powiadomienia',          icon: Bell },
];

export default function PortalSettingsPage() {
  const { wsType } = useWorkspaceContext();
  const [activeTab, setActiveTab] = useState('general');

  const visibleTabs = TABS.filter(t => !t.wsTypes || t.wsTypes.includes(wsType));

  // If active tab was hidden, fallback to first
  useEffect(() => {
    if (!visibleTabs.find(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id ?? 'general');
    }
  }, [wsType]);

  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Portal i obsługa" helpKey="portalSettings" subtitle="Konfiguracja zgłoszeń, formularzy, SLA i udostępniania" />

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 24, overflowX: 'auto', paddingBottom: 2,
        borderBottom: '1px solid var(--border)',
      }}>
        {visibleTabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 16px', fontSize: 12, fontWeight: active ? 700 : 500,
                color: active ? 'var(--accent)' : 'var(--tm)',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1, whiteSpace: 'nowrap',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'general' && <HelpdeskSettingsContent />}
        {activeTab === 'forms' && <PlaceholderTab title="Formularze zgłoszeń" desc="Konfiguracja pól formularzy, szablonów i publicznych formularzy zgłoszeń" />}
        {activeTab === 'categories' && <PlaceholderTab title="Kategorie i priorytety" desc="Zarządzanie kategoriami zgłoszeń, typami, priorytetami i ich kolorami" />}
        {activeTab === 'rules' && <PlaceholderTab title="Reguły obsługi" desc="Automatyczne przypisywanie, eskalacje i reguły routingu zgłoszeń" />}
        {activeTab === 'sla' && <SlaContent />}
        {activeTab === 'sharing' && <SharingContent />}
        {activeTab === 'visibility' && <PlaceholderTab title="Widoczność dla klienta" desc="Konfiguracja tego, co klient widzi w swoim panelu — urządzenia, historia, komentarze" />}
        {activeTab === 'notifications' && <PlaceholderTab title="Powiadomienia" desc="Konfiguracja powiadomień email, push i wewnętrznych dla zgłoszeń" />}
      </div>
    </div>
  );
}

function PlaceholderTab({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="page-card" style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>{title}</div>
      <p style={{ fontSize: 13, color: 'var(--tm)', maxWidth: 400, margin: '0 auto' }}>{desc}</p>
      <p style={{ fontSize: 11, color: 'var(--td)', marginTop: 16 }}>Ta sekcja będzie dostępna wkrótce</p>
    </div>
  );
}
