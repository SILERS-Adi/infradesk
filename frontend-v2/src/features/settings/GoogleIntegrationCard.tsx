import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Mail, CheckCircle2, XCircle, ExternalLink, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  scope: string | null;
  expiresAt: string | null;
}

/**
 * Settings card for per-user Google OAuth (Gmail + Calendar readonly).
 * Shown inside SettingsPage. Opens the /start endpoint in a new tab so the
 * user's current SPA state survives the round-trip to Google.
 */
export function GoogleIntegrationCard() {
  const qc = useQueryClient();

  const statusQ = useQuery<GoogleStatus>({
    queryKey: ['auth', 'google', 'status'],
    queryFn: async () => (await api.get('/auth/google/status')).data,
    staleTime: 30_000,
  });

  const disconnectMut = useMutation({
    mutationFn: async () => (await api.post('/auth/google/disconnect')).data,
    onSuccess: () => {
      toast.success('Rozłączono Google');
      qc.invalidateQueries({ queryKey: ['auth', 'google', 'status'] });
      qc.invalidateQueries({ queryKey: ['users', 'me'] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd';
      toast.error(msg);
    },
  });

  const status = statusQ.data;
  const loading = statusQ.isLoading;

  function connect() {
    if (!status?.configured) {
      toast.error('Integracja Google nie jest skonfigurowana (brak GOOGLE_CLIENT_ID na serwerze).');
      return;
    }
    // New tab so the SPA and its auth state survive the redirect back.
    // The backend /start endpoint honours the `redirect` param after callback.
    const url = '/api/v2/auth/google/start?redirect=/settings';
    window.open(url, '_blank', 'noopener,noreferrer');

    // Poll for status change for ~60s so the card refreshes as soon as user finishes.
    let tries = 0;
    const handle = window.setInterval(async () => {
      tries++;
      await qc.invalidateQueries({ queryKey: ['auth', 'google', 'status'] });
      if (tries > 30) window.clearInterval(handle);
    }, 2000);
  }

  return (
    <Card className="p-[var(--sp-4)]">
      <div className="flex items-start gap-[var(--sp-3)]">
        <div
          className="w-9 h-9 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
          style={{ background: 'var(--pri-l)', color: 'var(--pri)' }}
        >
          <Mail size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-semibold leading-tight">Google / Gmail</h2>
          <p className="text-[12px] text-[var(--tx3)] mt-0.5">
            Połącz swoje konto Google żeby synchronizować Gmail i Kalendarz bez konieczności
            wprowadzania hasła IMAP.
          </p>

          <div className="mt-[var(--sp-3)]">
            {loading && <div className="text-[12px] text-[var(--tx3)]">Sprawdzam status…</div>}

            {!loading && status && !status.configured && (
              <div className="text-[12px] flex items-start gap-1.5" style={{ color: 'var(--wn)' }}>
                <XCircle size={14} className="mt-0.5 shrink-0" />
                <span>
                  Administrator nie skonfigurował jeszcze danych dostępowych Google OAuth.
                  Skontaktuj się z administratorem.
                </span>
              </div>
            )}

            {!loading && status?.configured && status.connected && (
              <div className="space-y-[var(--sp-2)]">
                <div
                  className="text-[13px] flex items-center gap-1.5"
                  style={{ color: 'var(--ok)' }}
                >
                  <CheckCircle2 size={14} />
                  <span>
                    Połączony: <span className="font-mono">{status.email ?? '—'}</span>
                  </span>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => disconnectMut.mutate()}
                  disabled={disconnectMut.isPending}
                  className="text-[var(--er)]"
                >
                  {disconnectMut.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : null}
                  Rozłącz Google
                </Button>
              </div>
            )}

            {!loading && status?.configured && !status.connected && (
              <Button onClick={connect} className="gap-1.5">
                <ExternalLink size={14} /> Połącz Google / Gmail
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
