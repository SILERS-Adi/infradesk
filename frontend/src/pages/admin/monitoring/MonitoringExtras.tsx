import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle, Shield, Lock, Clock, HardDrive, RefreshCw,
} from 'lucide-react';
import { apiClient } from '../../../api/client';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Alert {
  id: string;
  severity: 'critical' | 'high' | 'medium';
  agentHostname: string;
  message: string;
}

export interface AuditCheck {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'error';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  detail: string;
}

interface SslCert {
  name: string;
  expiryDate: string;
  daysRemaining: number;
}

interface StoragePool {
  name: string;
  healthStatus: string;
  operationalStatus: string;
}

/* ── Style helpers ──────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 20,
};

const badge = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  background: bg,
  color,
});

const severityStyles: Record<string, { bg: string; color: string }> = {
  critical: { bg: 'rgba(239,68,68,0.15)', color: '#F87171' },
  high:     { bg: 'rgba(251,146,60,0.15)', color: '#FB923C' },
  medium:   { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
};

/* ── Recommendations map ───────────────────────────────────────────────── */

const RECOMMENDATIONS: Record<string, string> = {
  firewall: 'Włącz Zaporę systemu Windows: Panel sterowania → System i zabezpieczenia → Zapora Windows Defender → Włącz',
  antivirus: 'Włącz ochronę w czasie rzeczywistym: Ustawienia → Prywatność i zabezpieczenia → Zabezpieczenia Windows → Ochrona przed wirusami',
  antivirus_definitions: 'Zaktualizuj definicje antywirusowe: Zabezpieczenia Windows → Ochrona przed wirusami → Sprawdź aktualizacje',
  windows_updates: 'Zainstaluj oczekujące aktualizacje: Ustawienia → Windows Update → Sprawdź aktualizacje',
  smbv1: 'Wyłącz SMBv1: PowerShell (admin) → Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol',
  guest_account: 'Wyłącz konto Gość: lusrmgr.msc → Użytkownicy → Gość → Właściwości → Konto jest wyłączone',
  rdp_nla: 'Włącz NLA dla RDP: Właściwości systemu → Zdalny → Zezwalaj tylko z uwierzytelnianiem NLA',
  bitlocker: 'Włącz szyfrowanie BitLocker: Panel sterowania → Szyfrowanie dysków BitLocker → Włącz',
  password_policy: 'Ustaw politykę haseł: secpol.msc → Zasady kont → Zasady haseł → Min. długość: 8 znaków',
  lockout_policy: 'Ustaw blokadę konta: secpol.msc → Zasady kont → Zasady blokady konta → Próg: 5 prób',
  admin_count: 'Ogranicz liczbę administratorów: lusrmgr.msc → Grupy → Administratorzy → usuń zbędne konta',
  auto_login: 'Wyłącz automatyczne logowanie: regedit → HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon → usuń DefaultPassword',
  screen_saver: 'Włącz wygaszacz z hasłem: Ustawienia → Personalizacja → Ekran blokady → Ustawienia wygaszacza → Przy wznawianiu wymagaj hasła',
  uac: 'Włącz UAC: Panel sterowania → Konta użytkowników → Zmień ustawienia kontroli konta → ustaw na domyślne',
  remote_desktop: 'Wyłącz Pulpit zdalny jeśli niepotrzebny: Właściwości systemu → Zdalny → Nie zezwalaj na połączenia zdalne',
};

/* ═══════════════════════════════════════════════════════════════════════════
   1. AlertsPanel
   ═══════════════════════════════════════════════════════════════════════════ */

export function AlertsPanel() {
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ['monitoring', 'alerts'],
    queryFn: async () => {
      const { data } = await apiClient.get('/monitoring/alerts');
      return data;
    },
    refetchInterval: 30_000,
  });

  const resolve = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/monitoring/alerts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitoring', 'alerts'] }),
  });

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <AlertTriangle size={18} style={{ color: 'var(--tm)' }} />
        <h3 style={{ margin: 0, color: 'var(--t)', fontSize: 16, fontWeight: 600 }}>
          Aktywne alerty
        </h3>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ts)' }}>
          <RefreshCw size={14} className="spin" />
          <span>Ładowanie...</span>
        </div>
      )}

      {!isLoading && alerts.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '24px 0',
          color: 'var(--ts)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}>
          <CheckCircle size={28} style={{ color: '#4ADE80' }} />
          <span>Brak aktywnych alertów</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {alerts.map((alert) => {
          const sev = severityStyles[alert.severity] ?? severityStyles.medium;
          return (
            <div
              key={alert.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: sev.bg,
              }}
            >
              <span style={badge(sev.bg, sev.color)}>
                {alert.severity}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--t)', fontSize: 13 }}>
                  {alert.agentHostname}
                </div>
                <div style={{ color: 'var(--ts)', fontSize: 12, marginTop: 2 }}>
                  {alert.message}
                </div>
              </div>

              <button
                onClick={() => resolve.mutate(alert.id)}
                disabled={resolve.isPending}
                style={{
                  padding: '5px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--t)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                Rozwiąż
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. AuditRecommendations
   ═══════════════════════════════════════════════════════════════════════════ */

export function AuditRecommendations({ checks }: { checks: AuditCheck[] }) {
  const failed = checks.filter((c) => c.status === 'fail' && RECOMMENDATIONS[c.name]);

  if (failed.length === 0) return null;

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Shield size={18} style={{ color: '#FBBF24' }} />
        <h3 style={{ margin: 0, color: 'var(--t)', fontSize: 16, fontWeight: 600 }}>
          Zalecenia naprawcze
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {failed.map((check) => {
          const sev = severityStyles[check.severity] ?? severityStyles.medium;
          return (
            <div
              key={check.id}
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Lock size={14} style={{ color: sev.color }} />
                <span style={{ ...badge(sev.bg, sev.color) }}>
                  {check.severity}
                </span>
                <span style={{ fontWeight: 600, color: 'var(--t)', fontSize: 13 }}>
                  {check.name}
                </span>
              </div>
              <div style={{ color: 'var(--ts)', fontSize: 13, lineHeight: 1.5, paddingLeft: 22 }}>
                {RECOMMENDATIONS[check.name]}
              </div>
              {check.detail && (
                <div style={{ color: 'var(--td)', fontSize: 12, marginTop: 4, paddingLeft: 22 }}>
                  {check.detail}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. ExtraHealthSections
   ═══════════════════════════════════════════════════════════════════════════ */

function formatUptime(lastBootTime: string): string {
  const boot = new Date(lastBootTime).getTime();
  const now = Date.now();
  let diff = Math.max(0, Math.floor((now - boot) / 1000));

  const days = Math.floor(diff / 86400);
  diff %= 86400;
  const hours = Math.floor(diff / 3600);
  diff %= 3600;
  const minutes = Math.floor(diff / 60);

  return `System działa od ${days} dni ${hours} godzin ${minutes} minut`;
}

function certUrgencyColor(daysRemaining: number): string {
  if (daysRemaining <= 7) return '#F87171';
  if (daysRemaining <= 30) return '#FB923C';
  if (daysRemaining <= 60) return '#FBBF24';
  return '#4ADE80';
}

function poolHealthColor(health: string): string {
  const h = health.toLowerCase();
  if (h === 'healthy') return '#4ADE80';
  if (h === 'warning' || h === 'degraded') return '#FBBF24';
  return '#F87171';
}

export function ExtraHealthSections({ agent }: { agent: any }) {
  const metrics = agent?.serverMetrics;
  const sslCerts: SslCert[] | undefined = metrics?.sslCerts;
  const storagePools: StoragePool[] | undefined = metrics?.storagePools;
  const lastBootTime: string | undefined = agent?.lastBootTime;

  const hasContent = sslCerts?.length || storagePools?.length || lastBootTime;
  if (!hasContent) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* SSL Certificates */}
      {sslCerts && sslCerts.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Shield size={18} style={{ color: '#60A5FA' }} />
            <h3 style={{ margin: 0, color: 'var(--t)', fontSize: 16, fontWeight: 600 }}>
              Certyfikaty SSL
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sslCerts.map((cert, i) => {
              const color = certUrgencyColor(cert.daysRemaining);
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--t)', fontSize: 13 }}>
                      {cert.name}
                    </div>
                    <div style={{ color: 'var(--ts)', fontSize: 12, marginTop: 2 }}>
                      Wygasa: {new Date(cert.expiryDate).toLocaleDateString('pl-PL')}
                    </div>
                  </div>
                  <span style={badge(`${color}22`, color)}>
                    {cert.daysRemaining} dni
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* RAID / Storage Pools */}
      {storagePools && storagePools.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <HardDrive size={18} style={{ color: '#A78BFA' }} />
            <h3 style={{ margin: 0, color: 'var(--t)', fontSize: 16, fontWeight: 600 }}>
              RAID / Pule magazynowe
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {storagePools.map((pool, i) => {
              const healthColor = poolHealthColor(pool.healthStatus);
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontWeight: 600, color: 'var(--t)', fontSize: 13 }}>
                    {pool.name}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={badge(`${healthColor}22`, healthColor)}>
                      {pool.healthStatus}
                    </span>
                    <span style={{ color: 'var(--ts)', fontSize: 12 }}>
                      {pool.operationalStatus}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Uptime */}
      {lastBootTime && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={18} style={{ color: '#34D399' }} />
            <h3 style={{ margin: 0, color: 'var(--t)', fontSize: 16, fontWeight: 600 }}>
              Czas pracy
            </h3>
          </div>
          <div style={{ marginTop: 10, color: 'var(--ts)', fontSize: 14 }}>
            {formatUptime(lastBootTime)}
          </div>
        </div>
      )}
    </div>
  );
}
