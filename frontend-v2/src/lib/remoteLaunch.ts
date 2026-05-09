// Centralna logika generowania deeplink URL-i do klientów zdalnego dostępu.
// Używane wszędzie gdzie pokazujemy RustDesk/AnyDesk/TeamViewer/RDP/SSH ID
// żeby zamieniać statyczne ID na klikalne launch przyciski.

export type RemoteKind = 'rustdesk' | 'anydesk' | 'teamviewer' | 'rdp' | 'ssh' | 'custom';

export interface RemoteLaunch {
  kind: RemoteKind;
  label: string;       // np. "RustDesk", "AnyDesk", "RDP"
  url: string;         // deeplink do otwarcia
  external?: boolean;  // true = otwieraj w nowej karcie (custom links)
}

/**
 * Zwraca deeplink dla danego klienta zdalnego dostępu.
 * Zwraca null gdy value pusty.
 */
export function getRemoteLaunch(kind: RemoteKind, value: string | null | undefined): RemoteLaunch | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;

  switch (kind) {
    case 'rustdesk':
      return { kind, label: 'RustDesk',   url: `rustdesk://connection/new/${encodeURIComponent(v)}` };
    case 'anydesk':
      return { kind, label: 'AnyDesk',    url: `anydesk:${encodeURIComponent(v)}` };
    case 'teamviewer':
      return { kind, label: 'TeamViewer', url: `teamviewer8://control?device=${encodeURIComponent(v)}` };
    case 'rdp':
      return { kind, label: 'Pulpit zdalny',  url: `rdp://${v.replace(/^rdp:\/\//, '')}` };
    case 'ssh':
      return { kind, label: 'SSH',        url: `ssh://${v.replace(/^ssh:\/\//, '')}` };
    case 'custom':
      return { kind, label: 'Link',       url: v, external: true };
  }
}

/**
 * Generuje treść pliku .rdp gotową do pobrania jako fallback gdy `rdp://`
 * deeplink nie zadziała na danej wersji Windows.
 *
 * Format: standardowy plik konfiguracyjny mstsc.exe.
 */
export function buildRdpFile(host: string, opts: { username?: string; fullScreen?: boolean } = {}): string {
  const cleanHost = host.replace(/^rdp:\/\//, '');
  const lines = [
    `full address:s:${cleanHost}`,
    'screen mode id:i:' + (opts.fullScreen ? 2 : 1),
    'use multimon:i:0',
    'desktopwidth:i:1920',
    'desktopheight:i:1080',
    'session bpp:i:32',
    'compression:i:1',
    'keyboardhook:i:2',
    'audiocapturemode:i:0',
    'videoplaybackmode:i:1',
    'connection type:i:7',
    'networkautodetect:i:1',
    'bandwidthautodetect:i:1',
    'displayconnectionbar:i:1',
    'enableworkspacereconnect:i:0',
    'disable wallpaper:i:0',
    'allow font smoothing:i:0',
    'allow desktop composition:i:0',
    'disable full window drag:i:1',
    'disable menu anims:i:1',
    'disable themes:i:0',
    'disable cursor setting:i:0',
    'bitmapcachepersistenable:i:1',
    'authentication level:i:2',
    'prompt for credentials:i:1',
    'negotiate security layer:i:1',
    'remoteapplicationmode:i:0',
    'alternate shell:s:',
    'shell working directory:s:',
    'gatewayhostname:s:',
    'gatewayusagemethod:i:4',
    'gatewaycredentialssource:i:4',
    'gatewayprofileusagemethod:i:0',
    'promptcredentialonce:i:0',
    'gatewaybrokeringtype:i:0',
    'use redirection server name:i:0',
    'rdgiskdcproxy:i:0',
    'kdcproxyname:s:',
    opts.username ? `username:s:${opts.username}` : null,
  ].filter(Boolean);
  return lines.join('\r\n') + '\r\n';
}

export function downloadRdpFile(host: string, filename?: string): void {
  const content = buildRdpFile(host);
  const blob = new Blob([content], { type: 'application/x-rdp' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `${host.replace(/[^a-z0-9.-]/gi, '_').slice(0, 40)}.rdp`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
