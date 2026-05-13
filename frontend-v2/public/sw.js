// Kill switch — wyrejestruj samego siebie i wyczyść cache.
// Klienci którzy mają zarejestrowanego starego SW z v1 (przed cutoverem) dostaną
// ten plik przy najbliższym update check (Chrome >=68 ZAWSZE pyta serwer no-cache
// o source SW). Nowy SW: install -> skipWaiting -> activate -> sprzątanie -> reload.
// Po reloadzie SW jest już wyrejestrowany, więc strona ładuje się normalnie.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_e) { /* ignore */ }
    try { await self.registration.unregister(); } catch (_e) { /* ignore */ }
    try {
      const clientList = await self.clients.matchAll({ type: 'window' });
      clientList.forEach((c) => { try { c.navigate(c.url); } catch (_e) { /* ignore */ } });
    } catch (_e) { /* ignore */ }
  })());
});

// Pass-through fetch — nie modyfikuj requestów, nic nie cache'uj.
self.addEventListener('fetch', () => {});
