import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Mail, Send, History } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { settingsApi, downloadsApi } from '../../api/downloads';
import { formatDate } from '../../utils/helpers';

interface PinRequest {
  id: string;
  email: string;
  pin: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

function SmtpSettingsCard() {
  const qc = useQueryClient();

  const { data: smtpData, isLoading } = useQuery({
    queryKey: ['settings-smtp'],
    queryFn: settingsApi.getSmtp,
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [testEmail, setTestEmail] = useState('');

  const currentValues = (key: string): string => {
    if (key in form) return form[key];
    return smtpData?.[key] ?? '';
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      settingsApi.saveSmtp({
        smtp_host: currentValues('smtp_host'),
        smtp_port: currentValues('smtp_port'),
        smtp_user: currentValues('smtp_user'),
        smtp_pass: currentValues('smtp_pass'),
        smtp_from: currentValues('smtp_from'),
      }),
    onSuccess: () => {
      toast.success('Ustawienia SMTP zapisane');
      setForm({});
      qc.invalidateQueries({ queryKey: ['settings-smtp'] });
    },
    onError: () => toast.error('Nie udało się zapisać ustawień'),
  });

  const testMutation = useMutation({
    mutationFn: () => settingsApi.testSmtp(testEmail),
    onSuccess: () => toast.success('Wiadomość testowa wysłana'),
    onError: (err: unknown) => {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null;
      toast.error(msg ?? 'Błąd wysyłania wiadomości testowej');
    },
  });

  const handleChange = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const fields: { key: string; label: string; placeholder: string; type?: string }[] = [
    { key: 'smtp_host', label: 'Serwer SMTP (host)', placeholder: 'smtp.gmail.com' },
    { key: 'smtp_port', label: 'Port', placeholder: '587' },
    { key: 'smtp_user', label: 'Nazwa użytkownika', placeholder: 'noreply@firma.pl' },
    { key: 'smtp_pass', label: 'Hasło', placeholder: '••••••••', type: 'password' },
    { key: 'smtp_from', label: 'Adres nadawcy (From)', placeholder: '"InfraDesk" <noreply@firma.pl>' },
  ];

  return (
    <Card title="Ustawienia e-mail (SMTP)">
      <div className="space-y-4">
        {isLoading ? (
          <p className="text-sm" style={{ color: 'var(--tm)' }}>Ładowanie...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ts)' }}>{f.label}</label>
                <input
                  type={f.type ?? 'text'}
                  placeholder={f.placeholder}
                  value={currentValues(f.key)}
                  onChange={e => handleChange(f.key, e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
          >
            Zapisz ustawienia
          </Button>
        </div>

        <div className="pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--ts)' }}>Testuj konfigurację</p>
          <div className="flex gap-3">
            <input
              type="email"
              placeholder="adres@test.pl"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              className="flex-1 px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
            />
            <Button
              variant="secondary"
              icon={<Send className="h-4 w-4" />}
              onClick={() => testMutation.mutate()}
              loading={testMutation.isPending}
              disabled={!testEmail}
            >
              Wyślij test
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function PinRequestsCard() {
  const { data: requests = [], isLoading } = useQuery<PinRequest[]>({
    queryKey: ['download-pin-requests'],
    queryFn: downloadsApi.listPinRequests,
    staleTime: 30_000,
  });

  return (
    <Card title="Historia próśb o PIN" noPadding>
      <div className="overflow-x-auto">
        {isLoading ? (
          <p className="text-sm p-5" style={{ color: 'var(--tm)' }}>Ładowanie...</p>
        ) : requests.length === 0 ? (
          <p className="text-sm p-5 text-center" style={{ color: 'var(--tm)' }}>Brak próśb o PIN</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>E-mail</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Data prośby</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Wygasa</th>
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--tm)' }}>Użyty</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id}
                  className="transition-colors duration-150"
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  <td className="px-5 py-3 text-[13px] font-medium" style={{ color: 'var(--t)' }}>{r.email}</td>
                  <td className="px-5 py-3 text-[13px]" style={{ color: 'var(--ts)' }}>{formatDate(r.createdAt)}</td>
                  <td className="px-5 py-3 text-[13px]" style={{ color: 'var(--ts)' }}>{formatDate(r.expiresAt)}</td>
                  <td className="px-5 py-3">
                    {r.usedAt ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: 'rgba(34,197,94,0.1)', color: '#4ADE80' }}>
                        {formatDate(r.usedAt)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: 'var(--hover-bg)', color: 'var(--tm)' }}>
                        nie użyty
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Ustawienia"
        subtitle="Konfiguracja systemu InfraDesk"
      />
      <SmtpSettingsCard />
      <PinRequestsCard />
    </div>
  );
}
