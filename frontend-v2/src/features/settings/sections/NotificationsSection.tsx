import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Save, Bell, BellOff } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { SectionCard } from '../SectionCard';

interface Prefs {
  emailTicketUpdates: boolean;
  emailTicketAssigned: boolean;
  emailDailyDigest: boolean;
  emailAlerts: boolean;
  webPush: boolean;
}

const DEFAULTS: Prefs = {
  emailTicketUpdates: true,
  emailTicketAssigned: true,
  emailDailyDigest: false,
  emailAlerts: true,
  webPush: false,
};

const SETTING_KEY = 'user.notification-preferences';

interface SettingResponse {
  value: Prefs | null;
}

export function NotificationsSection() {
  const qc = useQueryClient();

  // Stored as a workspace-scoped setting keyed per user (acceptable fallback
  // until a proper NotificationSettings table is added). The backend only
  // exposes GET/PUT /settings/:key so we piggy-back on that here.
  const prefsQ = useQuery<SettingResponse>({
    queryKey: ['settings', SETTING_KEY],
    queryFn: async () =>
      (await api.get<SettingResponse>(`/settings/${encodeURIComponent(SETTING_KEY)}`)).data,
    retry: false,
  });

  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (prefsQ.data) {
      setPrefs({ ...DEFAULTS, ...(prefsQ.data.value ?? {}) });
      setDirty(false);
    }
  }, [prefsQ.data]);

  function toggle<K extends keyof Prefs>(key: K) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setDirty(true);
  }

  const saveMut = useMutation({
    mutationFn: async () =>
      (
        await api.put(`/settings/${encodeURIComponent(SETTING_KEY)}`, {
          value: prefs,
        })
      ).data,
    onSuccess: () => {
      toast.success('Zapisano preferencje powiadomień');
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['settings', SETTING_KEY] });
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Nie udało się zapisać';
      toast.error(msg);
    },
  });

  async function requestWebPush() {
    if (!('Notification' in window)) {
      toast.error('Twoja przeglądarka nie obsługuje powiadomień');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setPrefs((p) => ({ ...p, webPush: true }));
      setDirty(true);
      toast.success('Powiadomienia web push włączone');
    } else {
      toast.error('Powiadomienia zostały zablokowane w przeglądarce');
    }
  }

  return (
    <SectionCard
      title="Powiadomienia"
      description="Kiedy chcesz dostawać wiadomości e-mail i powiadomienia w przeglądarce."
      footer={
        <Button
          onClick={() => saveMut.mutate()}
          disabled={!dirty || saveMut.isPending || prefsQ.isLoading}
          className="gap-1.5"
        >
          <Save size={14} />
          {saveMut.isPending ? 'Zapisywanie…' : 'Zapisz preferencje'}
        </Button>
      }
    >
      <div className="space-y-[var(--sp-3)]">
        <h3 className="text-[13px] font-semibold text-[var(--tx2)]">Email</h3>
        <ToggleRow
          label="Aktualizacje w moich ticketach"
          description="Nowe komentarze, zmiana statusu, przypisania."
          checked={prefs.emailTicketUpdates}
          onChange={() => toggle('emailTicketUpdates')}
        />
        <ToggleRow
          label="Przypisany nowy ticket"
          description="Ktoś przydzielił mi nowe zgłoszenie."
          checked={prefs.emailTicketAssigned}
          onChange={() => toggle('emailTicketAssigned')}
        />
        <ToggleRow
          label="Alerty monitoringu"
          description="Przerwy, wysoki CPU, dyski, offline."
          checked={prefs.emailAlerts}
          onChange={() => toggle('emailAlerts')}
        />
        <ToggleRow
          label="Dzienne podsumowanie"
          description="Raz dziennie (07:00) podsumowanie zgłoszeń."
          checked={prefs.emailDailyDigest}
          onChange={() => toggle('emailDailyDigest')}
        />

        <div className="pt-[var(--sp-3)] mt-[var(--sp-2)] border-t border-[var(--bd)]">
          <h3 className="text-[13px] font-semibold text-[var(--tx2)] mb-[var(--sp-3)]">
            Web push
          </h3>
          {prefs.webPush ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px]">
                <Bell size={14} style={{ color: 'var(--ok)' }} />
                <span>Powiadomienia w przeglądarce włączone</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPrefs((p) => ({ ...p, webPush: false }));
                  setDirty(true);
                }}
                className="gap-1.5"
              >
                <BellOff size={12} /> Wyłącz
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={requestWebPush} className="gap-1.5">
              <Bell size={12} /> Włącz powiadomienia web push
            </Button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-start justify-between gap-[var(--sp-3)] cursor-pointer">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{label}</div>
        <div className="text-[12px] text-[var(--tx3)]">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className="relative inline-flex h-[22px] w-[38px] shrink-0 rounded-full transition-colors"
        style={{
          background: checked ? 'var(--pri)' : 'var(--sf-h)',
          border: '1px solid var(--bd)',
        }}
      >
        <span
          className="absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white transition-all"
          style={{ left: checked ? '18px' : '2px' }}
        />
      </button>
    </label>
  );
}
