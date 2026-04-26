import { useState } from 'react';
import { Mail, Activity, Users as UsersIcon, BellRing } from 'lucide-react';
import { MyEmailTab } from './MyEmailTab';
import { ActivitiesTab } from './ActivitiesTab';
import { FollowUpsTab } from './FollowUpsTab';
import { ContactsListTab } from './ContactsListTab';

type Tab = 'mail' | 'activities' | 'contacts' | 'followups';

const TABS: { key: Tab; label: string; icon: typeof Mail }[] = [
  { key: 'mail', label: 'Moja poczta', icon: Mail },
  { key: 'activities', label: 'Aktywności', icon: Activity },
  { key: 'contacts', label: 'Kontakty', icon: UsersIcon },
  { key: 'followups', label: 'Follow-upy', icon: BellRing },
];

export function CrmHubPage() {
  const [tab, setTab] = useState<Tab>('mail');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-tx">CRM</h1>
        <p className="text-sm text-tx3">Twoja poczta, aktywności sprzedażowe i kontakty klientów.</p>
      </div>

      <div className="flex items-center gap-1 border-b border-bd overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="px-4 py-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap inline-flex items-center gap-2"
            style={{
              borderColor: tab === key ? 'var(--pri)' : 'transparent',
              color: tab === key ? 'var(--pri)' : 'var(--tx2)',
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'mail' && <MyEmailTab />}
      {tab === 'activities' && <ActivitiesTab />}
      {tab === 'contacts' && <ContactsListTab />}
      {tab === 'followups' && <FollowUpsTab />}
    </div>
  );
}
