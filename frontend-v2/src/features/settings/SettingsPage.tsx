import { useState } from 'react';
import { useThemeStore } from '@/store/theme';
import { useAuthStore } from '@/store/auth';
import { Settings, Sun, Moon, Monitor, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';

const THEME_OPTIONS = [
  { key: 'light', label: 'Jasny', icon: Sun },
  { key: 'dark', label: 'Ciemny', icon: Moon },
  { key: 'auto', label: 'Auto (system)', icon: Monitor },
] as const;

export function SettingsPage() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [saving, setSaving] = useState(false);

  async function changePassword() {
    if (!currentPwd || !newPwd) return;
    if (newPwd.length < 10) {
      toast.error('Nowe hasło musi mieć co najmniej 10 znaków');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword: currentPwd, newPassword: newPwd });
      toast.success('Hasło zmienione. Zaloguj się ponownie.');
      setCurrentPwd('');
      setNewPwd('');
      logout();
      window.location.href = '/login';
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd zmiany hasła';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function doLogout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    logout();
    window.location.href = '/login';
  }

  return (
    <div className="space-y-[var(--sp-4)] max-w-[640px]">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight flex items-center gap-2">
          <Settings size={18} className="text-[var(--pri)]" /> Ustawienia
        </h1>
        <p className="text-[13px] text-[var(--tx3)] mt-0.5">
          Twoje preferencje i bezpieczeństwo konta.
        </p>
      </div>

      <Card className="p-[var(--sp-4)]">
        <h2 className="text-[14px] font-semibold mb-[var(--sp-3)]">Twoje konto</h2>
        <div className="space-y-1.5 text-[13px]">
          <div className="flex justify-between">
            <span className="text-[var(--tx3)]">Imię i nazwisko</span>
            <span>{user?.firstName} {user?.lastName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--tx3)]">Email</span>
            <span className="font-mono">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--tx3)]">2FA</span>
            <span>{user?.twoFactorEnabled ? 'Włączone' : 'Wyłączone'}</span>
          </div>
        </div>
      </Card>

      <Card className="p-[var(--sp-4)]">
        <h2 className="text-[14px] font-semibold mb-[var(--sp-3)]">Motyw kolorystyczny</h2>
        <div className="grid grid-cols-3 gap-[var(--sp-3)]">
          {THEME_OPTIONS.map(({ key, label, icon: Icon }) => {
            const active = theme === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTheme(key)}
                className="p-[var(--sp-3)] rounded-[var(--r-s)] border transition-colors text-center"
                style={{
                  borderColor: active ? 'var(--pri)' : 'var(--bd)',
                  background: active ? 'var(--pri-l)' : 'transparent',
                  color: active ? 'var(--pri)' : 'var(--tx2)',
                }}
              >
                <Icon size={18} className="mx-auto mb-1" />
                <div className="text-[12px]">{label}</div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-[var(--sp-4)]">
        <h2 className="text-[14px] font-semibold mb-[var(--sp-3)]">Zmień hasło</h2>
        <div className="space-y-[var(--sp-3)]">
          <div>
            <label className="text-[11px] text-[var(--tx3)] uppercase tracking-wider block mb-1">Obecne hasło</label>
            <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] text-[var(--tx3)] uppercase tracking-wider block mb-1">Nowe hasło</label>
            <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Min. 10 znaków" />
          </div>
          <Button onClick={changePassword} disabled={saving || !currentPwd || !newPwd}>
            {saving ? 'Zapisywanie…' : 'Zmień hasło'}
          </Button>
        </div>
      </Card>

      <Card className="p-[var(--sp-4)] border-[var(--er-b)]">
        <h2 className="text-[14px] font-semibold mb-1 text-[var(--er)]">Wyloguj ze wszystkich sesji</h2>
        <p className="text-[12px] text-[var(--tx3)] mb-[var(--sp-3)]">
          Zakończy sesję na tym urządzeniu i unieważni wszystkie odświeżające tokeny.
        </p>
        <Button variant="ghost" onClick={doLogout} className="gap-1.5 text-[var(--er)]">
          <LogOut size={14} /> Wyloguj
        </Button>
      </Card>
    </div>
  );
}
