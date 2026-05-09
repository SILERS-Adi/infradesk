import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Loader2, AlertTriangle, ShieldCheck, MonitorPlay, KeyRound, HardDrive, Copy, Check,
  ArrowRight, ExternalLink, Eye, EyeOff,
} from 'lucide-react';
import { api } from '@/lib/api';
import { RemoteLaunchLink } from '@/components/ui/RemoteLaunchLink';

interface ShareMeta {
  workspaceName: string;
  partnerName: string | null;
  note: string | null;
  expiresAt: string;
}

interface DevicePayload {
  kind: 'DEVICE';
  share: ShareMeta;
  device: {
    id: string;
    name: string;
    hostname: string | null;
    category: string;
    ipAddress: string | null;
    macAddress: string | null;
    operatingSystem: string | null;
    osVersion: string | null;
    rustdeskId: string | null;
    rdpAddress: string | null;
    anydeskId: string | null;
    teamviewerId: string | null;
    sshAddress: string | null;
    location: { name: string; city: string | null; addressLine1: string | null } | null;
  };
}
interface RustdeskPayload {
  kind: 'RUSTDESK_LAUNCH';
  share: ShareMeta;
  deviceName: string;
  rustdeskId: string;
  launchUrl: string;
}
interface CredentialPayload {
  kind: 'CREDENTIAL';
  share: ShareMeta;
  credential: {
    name: string;
    category: string;
    username: string | null;
    password: string;
    urlOrHost: string | null;
    notes: string | null;
  };
}
type Payload = DevicePayload | RustdeskPayload | CredentialPayload;

function CopyBtn({ value, label = 'Kopiuj' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-[var(--r-xs)] hover:bg-sf-h press"
      style={{ color: copied ? 'var(--ok)' : 'var(--tx3)' }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Skopiowane' : label}
    </button>
  );
}

function Field({ label, value, mono, copyable }: { label: string; value: string | null | undefined; mono?: boolean; copyable?: boolean }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-baseline gap-3 py-2 border-b" style={{ borderColor: 'var(--bd)' }}>
      <span className="text-[11px] uppercase tracking-wider text-tx3 font-semibold w-[110px] shrink-0">{label}</span>
      <span className={`flex-1 text-[13px] text-tx ${mono ? 'font-mono' : ''} break-all`}>{value}</span>
      {copyable && <CopyBtn value={value} />}
    </div>
  );
}

export function PartnerSharePage() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    if (!token) { setError({ code: 'no_token', message: 'Brak tokena' }); setLoading(false); return; }
    let cancelled = false;
    api.get<Payload>(`/public/partner-share/${encodeURIComponent(token)}`)
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const ax = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
        setError({
          code: ax.response?.data?.error ?? 'unknown',
          message: ax.response?.data?.message ?? 'Nie udało się załadować',
        });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <Loader2 className="h-6 w-6 animate-spin text-tx3" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5" style={{ background: 'var(--bg)' }}>
        <div className="max-w-[420px] w-full text-center">
          <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--er-l)', color: 'var(--er)' }}>
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h1 className="text-[20px] font-bold text-tx mb-2">Link nieaktywny</h1>
          <p className="text-[13px] text-tx2 leading-relaxed mb-5">
            {error?.code === 'share_expired' && 'Ten link wygasł. Skontaktuj się z osobą która Ci go udostępniła aby otrzymać nowy.'}
            {error?.code === 'share_revoked' && 'Ten link został odwołany przez właściciela.'}
            {error?.code === 'credential_already_revealed' && 'Hasło zostało już raz odsłonięte. Z bezpieczeństwa link jest jednorazowy.'}
            {!['share_expired','share_revoked','credential_already_revealed'].includes(error?.code ?? '') && (error?.message ?? 'Link jest nieprawidłowy lub został usunięty.')}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-[13px] font-semibold press"
            style={{ color: 'var(--pri)' }}
          >
            Idź na infradesk.pl <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  const meta = data.share;
  const expiresAt = new Date(meta.expiresAt);
  const minutesLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 60_000));
  const expiryLabel = minutesLeft < 60 ? `${minutesLeft} min` : minutesLeft < 60 * 24 ? `${Math.floor(minutesLeft / 60)} h` : `${Math.floor(minutesLeft / 60 / 24)} dni`;

  return (
    <div className="min-h-screen p-5" style={{ background: 'var(--bg)' }}>
      <div className="max-w-[640px] mx-auto pt-10">
        {/* Header */}
        <div className="text-center mb-6">
          <Link to="/" aria-label="InfraDesk" className="inline-block">
            <img src="/logo.png" alt="InfraDesk" className="h-9 mx-auto mb-3" />
          </Link>
          <p className="text-[11px] font-bold uppercase tracking-[.15em] text-tx3 mb-1">
            Udostępnione przez {meta.workspaceName}
          </p>
          {meta.partnerName && (
            <p className="text-[12px] text-tx2">Dla: <strong>{meta.partnerName}</strong></p>
          )}
          {meta.note && (
            <p className="text-[12px] text-tx2 mt-1 italic">„{meta.note}"</p>
          )}
        </div>

        {/* Expiry banner */}
        <div
          className="rounded-[var(--r-s)] border p-3 mb-5 flex items-center gap-2 text-[12px]"
          style={{
            borderColor: minutesLeft < 60 ? 'var(--wn)' : 'var(--bd)',
            background: minutesLeft < 60 ? 'var(--wn-l)' : 'var(--sf-h)',
          }}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: minutesLeft < 60 ? 'var(--wn)' : 'var(--tx3)' }} />
          <span className="text-tx2">
            Link wygasa za <strong>{expiryLabel}</strong>
            {' · '}
            {expiresAt.toLocaleString('pl-PL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Content per kind */}
        {data.kind === 'DEVICE' && (
          <div className="rounded-[var(--r-l)] border p-5" style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-[var(--r-s)] flex items-center justify-center" style={{ background: 'var(--pri-l)', color: 'var(--pri)' }}>
                <HardDrive className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[16px] font-bold">{data.device.name}</h2>
                <p className="text-[11px] text-tx3">{data.device.category}</p>
              </div>
            </div>
            <Field label="Hostname" value={data.device.hostname} mono copyable />
            <Field label="IP" value={data.device.ipAddress} mono copyable />
            <Field label="MAC" value={data.device.macAddress} mono copyable />
            <Field label="OS" value={[data.device.operatingSystem, data.device.osVersion].filter(Boolean).join(' ') || null} />
            <Field label="Lokalizacja" value={data.device.location ? [data.device.location.name, data.device.location.addressLine1, data.device.location.city].filter(Boolean).join(', ') : null} />
            {data.device.rustdeskId && (
              <div className="flex items-center gap-3 py-2 border-b" style={{ borderColor: 'var(--bd)' }}>
                <span className="text-[11px] uppercase tracking-wider text-tx3 font-semibold w-[110px] shrink-0">RustDesk</span>
                <RemoteLaunchLink kind="rustdesk" value={data.device.rustdeskId} showValue />
                <CopyBtn value={data.device.rustdeskId} label="Kopiuj ID" />
              </div>
            )}
            {data.device.rdpAddress && (
              <div className="flex items-center gap-3 py-2 border-b" style={{ borderColor: 'var(--bd)' }}>
                <span className="text-[11px] uppercase tracking-wider text-tx3 font-semibold w-[110px] shrink-0">RDP</span>
                <RemoteLaunchLink kind="rdp" value={data.device.rdpAddress} showValue />
                <CopyBtn value={data.device.rdpAddress} label="Kopiuj" />
              </div>
            )}
            {data.device.anydeskId && (
              <div className="flex items-center gap-3 py-2 border-b" style={{ borderColor: 'var(--bd)' }}>
                <span className="text-[11px] uppercase tracking-wider text-tx3 font-semibold w-[110px] shrink-0">AnyDesk</span>
                <RemoteLaunchLink kind="anydesk" value={data.device.anydeskId} showValue />
                <CopyBtn value={data.device.anydeskId} label="Kopiuj ID" />
              </div>
            )}
            {data.device.teamviewerId && (
              <div className="flex items-center gap-3 py-2 border-b" style={{ borderColor: 'var(--bd)' }}>
                <span className="text-[11px] uppercase tracking-wider text-tx3 font-semibold w-[110px] shrink-0">TeamViewer</span>
                <RemoteLaunchLink kind="teamviewer" value={data.device.teamviewerId} showValue />
                <CopyBtn value={data.device.teamviewerId} label="Kopiuj ID" />
              </div>
            )}
            {data.device.sshAddress && (
              <div className="flex items-center gap-3 py-2 border-b" style={{ borderColor: 'var(--bd)' }}>
                <span className="text-[11px] uppercase tracking-wider text-tx3 font-semibold w-[110px] shrink-0">SSH</span>
                <RemoteLaunchLink kind="ssh" value={data.device.sshAddress} showValue />
                <CopyBtn value={data.device.sshAddress} label="Kopiuj" />
              </div>
            )}
          </div>
        )}

        {data.kind === 'RUSTDESK_LAUNCH' && (
          <div className="rounded-[var(--r-l)] border p-6 text-center" style={{ borderColor: 'var(--pri)', background: 'var(--pri-l)' }}>
            <div className="w-14 h-14 rounded-[var(--r-m)] mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--pri)', color: 'white' }}>
              <MonitorPlay className="h-7 w-7" />
            </div>
            <h2 className="text-[18px] font-bold mb-1">Połączenie zdalne</h2>
            <p className="text-[13px] text-tx2 mb-4">
              <strong>{data.deviceName}</strong>
              {' · ID '}
              <span className="font-mono">{data.rustdeskId}</span>
            </p>
            <a
              href={data.launchUrl}
              className="inline-flex items-center gap-1.5 h-11 px-5 rounded-[var(--r-s)] text-[14px] font-semibold press"
              style={{ background: 'var(--pri)', color: 'white' }}
            >
              <MonitorPlay className="h-4 w-4" />
              Otwórz w RustDesk
            </a>
            <p className="text-[11px] text-tx3 mt-4">
              Nie masz RustDesk-a? <a href="/pobieranie" className="text-pri hover:underline">Pobierz tutaj</a>.
            </p>
          </div>
        )}

        {data.kind === 'CREDENTIAL' && (
          <div className="rounded-[var(--r-l)] border p-5" style={{ borderColor: 'var(--bd)', background: 'var(--sf)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-[var(--r-s)] flex items-center justify-center" style={{ background: 'var(--wn-l)', color: 'var(--wn)' }}>
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[16px] font-bold">{data.credential.name}</h2>
                <p className="text-[11px] text-tx3">{data.credential.category}</p>
              </div>
            </div>
            <div
              className="rounded-[var(--r-s)] border p-3 mb-4 text-[11px]"
              style={{ borderColor: 'var(--er)', background: 'var(--er-l)', color: 'var(--er)' }}
            >
              <strong>⚠ To jest jednorazowe odsłonięcie.</strong> Skopiuj hasło teraz — po odświeżeniu link nie zadziała ponownie.
            </div>
            <Field label="Login" value={data.credential.username} mono copyable />
            <div className="flex items-baseline gap-3 py-2 border-b" style={{ borderColor: 'var(--bd)' }}>
              <span className="text-[11px] uppercase tracking-wider text-tx3 font-semibold w-[110px] shrink-0">Hasło</span>
              <span className="flex-1 text-[13px] font-mono break-all">
                {showPwd ? data.credential.password : '•'.repeat(Math.min(data.credential.password.length, 14))}
              </span>
              <button type="button" onClick={() => setShowPwd((s) => !s)} className="text-tx3 hover:text-tx press" title={showPwd ? 'Ukryj' : 'Pokaż'}>
                {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <CopyBtn value={data.credential.password} />
            </div>
            <Field label="URL / Host" value={data.credential.urlOrHost} mono copyable />
            {data.credential.urlOrHost && data.credential.urlOrHost.startsWith('http') && (
              <a
                href={data.credential.urlOrHost}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-[12px] font-semibold press"
                style={{ color: 'var(--pri)' }}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Otwórz stronę
              </a>
            )}
            {data.credential.notes && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--bd)' }}>
                <p className="text-[11px] uppercase tracking-wider text-tx3 font-semibold mb-1">Notatki</p>
                <p className="text-[12px] text-tx2 whitespace-pre-line">{data.credential.notes}</p>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-[10px] text-tx3 mt-6">
          InfraDesk Partner Share · audytowane · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
