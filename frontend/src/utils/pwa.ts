// PWA helpers: service worker registration, update handling, install prompt capture.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(available: boolean) => void>();

function notify(available: boolean) {
  installListeners.forEach(fn => { try { fn(available); } catch { /* ignore */ } });
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.hostname === 'localhost' && !import.meta.env.PROD) return;

  const url = `/sw.js?v=${__BUILD_HASH__}`;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url, { scope: '/' })
      .then(reg => {
        // Check for updates every 30 min while the tab is open
        setInterval(() => { reg.update().catch(() => {}); }, 30 * 60 * 1000);

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // A new SW is waiting — activate it immediately
              newWorker.postMessage('SKIP_WAITING');
            }
          });
        });
      })
      .catch(() => { /* ignore registration errors */ });

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify(true);
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify(false);
  });
}

export function canInstall(): boolean {
  return deferredPrompt !== null;
}

export async function triggerInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  try {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    notify(false);
    return choice.outcome;
  } catch {
    return 'dismissed';
  }
}

export function onInstallAvailabilityChange(fn: (available: boolean) => void): () => void {
  installListeners.add(fn);
  return () => { installListeners.delete(fn); };
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
         // @ts-expect-error — iOS Safari
         window.navigator.standalone === true;
}
