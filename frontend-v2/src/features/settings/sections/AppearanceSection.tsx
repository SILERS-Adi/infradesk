import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Sun, Moon, Monitor, Save } from 'lucide-react';
import { useThemeStore, type Theme } from '@/store/theme';
import { api } from '@/lib/api';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SectionCard, Field } from '../SectionCard';

const THEME_OPTIONS: { key: Theme; label: string; icon: typeof Sun }[] = [
  { key: 'light', label: 'Jasny', icon: Sun },
  { key: 'dark', label: 'Ciemny', icon: Moon },
  { key: 'auto', label: 'Auto (system)', icon: Monitor },
];

interface MeResponse {
  user: { locale: string; timezone: string };
}

interface PrefValue {
  primaryColor?: string;
}

const ACCENT_KEY = 'user.accent-color';

export function AppearanceSection() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const qc = useQueryClient();
  const meQ = useQuery<MeResponse>({
    queryKey: ['users', 'me'],
    queryFn: async () => (await api.get<MeResponse>('/users/me')).data,
  });
  const accentQ = useQuery<{ value: PrefValue | null }>({
    queryKey: ['settings', ACCENT_KEY],
    queryFn: async () =>
      (await api.get<{ value: PrefValue | null }>(`/settings/${encodeURIComponent(ACCENT_KEY)}`))
        .data,
    retry: false,
  });

  const [locale, setLocale] = useState('pl-PL');
  const [timezone, setTimezone] = useState('Europe/Warsaw');
  const [accent, setAccent] = useState<string>('#6366F1');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (meQ.data?.user) {
      setLocale(meQ.data.user.locale);
      setTimezone(meQ.data.user.timezone);
    }
  }, [meQ.data]);
  useEffect(() => {
    const c = accentQ.data?.value?.primaryColor;
    if (c) setAccent(c);
  }, [accentQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      await api.patch('/users/me', { locale, timezone });
      try {
        await api.put(`/settings/${encodeURIComponent(ACCENT_KEY)}`, {
          value: { primaryColor: accent },
        });
      } catch {
        // accent save is best-effort (needs WORKSPACE_SETTINGS edit)
      }
    },
    onSuccess: () => {
      toast.success('Zapisano wygląd');
      qc.invalidateQueries({ queryKey: ['users', 'me'] });
      qc.invalidateQueries({ queryKey: ['settings', ACCENT_KEY] });
      setDirty(false);
    },
    onError: (e: unknown) =>
      toast.error(
        (e as { response?: { data?: { message?: string } } }).response?.data?.message ??
          'Błąd zapisu',
      ),
  });

  return (
    <SectionCard
      title="Wygląd"
      description="Motyw kolorystyczny, język i kolor akcentu."
      footer={
        <Button
          onClick={() => saveMut.mutate()}
          disabled={!dirty || saveMut.isPending}
          className="gap-1.5"
        >
          <Save size={14} />
          {saveMut.isPending ? 'Zapisywanie…' : 'Zapisz'}
        </Button>
      }
    >
      <div className="mb-[var(--sp-4)]">
        <div className="text-[11px] text-[var(--tx3)] uppercase tracking-wider mb-2">
          Motyw
        </div>
        <div className="grid grid-cols-3 gap-[var(--sp-3)]">
          {THEME_OPTIONS.map(({ key, label, icon: Icon }) => {
            const active = theme === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTheme(key)}
                className="p-[var(--sp-3)] rounded-[var(--r-s)] border transition-colors text-center press"
                style={{
                  borderColor: active ? 'var(--pri)' : 'var(--bd)',
                  background: active ? 'var(--pri-l)' : 'transparent',
                  color: active ? 'var(--pri)' : 'var(--tx2)',
                }}
              >
                <Icon size={20} className="mx-auto mb-1.5" />
                <div className="text-[12px] font-medium">{label}</div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--tx3)] mt-2">
          Zmiana motywu jest natychmiastowa i zapisywana lokalnie w tej przeglądarce.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--sp-3)]">
        <Field label="Język">
          <Select
            value={locale}
            onChange={(e) => {
              setLocale(e.target.value);
              setDirty(true);
            }}
          >
            <option value="pl-PL">Polski</option>
            <option value="en-US" disabled>
              English (wkrótce)
            </option>
          </Select>
        </Field>
        <Field label="Strefa czasowa">
          <Select
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
              setDirty(true);
            }}
          >
            <option value="Europe/Warsaw">Europe/Warsaw</option>
            <option value="Europe/Berlin">Europe/Berlin</option>
            <option value="Europe/London">Europe/London</option>
            <option value="UTC">UTC</option>
          </Select>
        </Field>
        <Field
          label="Kolor akcentu"
          hint="Dotyczy tylko Twojego widoku. Domyślnie kolor workspace."
        >
          <div className="flex items-center gap-2">
            <Input
              type="color"
              value={accent}
              onChange={(e) => {
                setAccent(e.target.value);
                setDirty(true);
              }}
              className="h-10 w-16 cursor-pointer p-1"
            />
            <Input
              value={accent}
              onChange={(e) => {
                setAccent(e.target.value);
                setDirty(true);
              }}
              className="font-mono"
              maxLength={7}
            />
          </div>
        </Field>
      </div>
    </SectionCard>
  );
}
