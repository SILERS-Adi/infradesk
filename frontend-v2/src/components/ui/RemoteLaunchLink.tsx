import { MonitorPlay, Terminal, ExternalLink, Download as DownloadIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { getRemoteLaunch, downloadRdpFile, type RemoteKind } from '@/lib/remoteLaunch';

const KIND_ICON: Record<RemoteKind, typeof MonitorPlay> = {
  rustdesk:   MonitorPlay,
  anydesk:    MonitorPlay,
  teamviewer: MonitorPlay,
  rdp:        Terminal,
  ssh:        Terminal,
  custom:     ExternalLink,
};

interface Props {
  kind: RemoteKind;
  value: string | null | undefined;
  /** Gdy true (default) — pokazuje wartość po etykiecie, np. "RustDesk: 123456789" */
  showValue?: boolean;
  /** Mały rozmiar (chip-style) zamiast standardowego przycisku */
  size?: 'sm' | 'md';
  /** Custom className */
  className?: string;
}

/**
 * Klikalny launch button dla zdalnego dostępu — generuje deeplink i otwiera klienta.
 * Dla RDP dorzuca dodatkową opcję pobrania .rdp file (fallback gdy rdp:// nie działa).
 *
 * Użycie:
 *   <RemoteLaunchLink kind="rustdesk" value={device.rustdeskId} />
 *   <RemoteLaunchLink kind="rdp" value="server.local:3389" size="sm" />
 */
export function RemoteLaunchLink({ kind, value, showValue = true, size = 'md', className = '' }: Props) {
  const launch = getRemoteLaunch(kind, value);
  if (!launch) return null;

  const Icon = KIND_ICON[kind];
  const isSm = size === 'sm';
  const sizeCls = isSm
    ? 'h-7 px-2.5 text-[11px] gap-1'
    : 'h-9 px-3 text-[13px] gap-1.5';

  return (
    <span className={`inline-flex items-center ${className}`}>
      <a
        href={launch.url}
        target={launch.external ? '_blank' : undefined}
        rel={launch.external ? 'noopener noreferrer' : undefined}
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center font-semibold rounded-[var(--r-s)] press transition-colors ${sizeCls}`}
        style={{ background: 'var(--pri)', color: 'white' }}
        title={`Otwórz ${launch.label}: ${value}`}
      >
        <Icon className={isSm ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        {launch.label}
        {showValue && (
          <span className={`font-mono ${isSm ? 'text-[10px]' : 'text-[11px]'} opacity-90 truncate max-w-[120px]`}>
            {value}
          </span>
        )}
      </a>
      {kind === 'rdp' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            try {
              downloadRdpFile(value ?? '');
              toast.success('Pobieranie pliku .rdp');
            } catch {
              toast.error('Nie udało się wygenerować .rdp');
            }
          }}
          className={`inline-flex items-center justify-center rounded-[var(--r-s)] border ml-1 press ${isSm ? 'h-7 w-7' : 'h-9 w-9'}`}
          style={{ borderColor: 'var(--bd)', background: 'var(--sf)', color: 'var(--tx2)' }}
          title="Pobierz plik .rdp (gdy deeplink nie zadziała)"
        >
          <DownloadIcon className={isSm ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </button>
      )}
    </span>
  );
}
