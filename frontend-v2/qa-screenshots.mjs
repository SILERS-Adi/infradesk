/**
 * Owner Visual QA Batch 1 — Playwright screenshots script.
 *
 * Wymaga uruchomionego dev server (npm run dev → http://localhost:5174).
 * Backend NIE jest wymagany — /api/v2/** są abortowane, UI renderuje empty/skeleton states.
 *
 * Output: ./qa-shots/<route>--<theme>--<viewport>.png
 *
 * Run: node qa-screenshots.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = 'http://localhost:5174';
const OUT = resolve('./qa-shots');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const MOCK_AUTH = {
  state: {
    user: {
      id: 'mock-user-1',
      email: 'adrian@silers.pl',
      firstName: 'Adrian',
      lastName: 'Baszczykowski',
      twoFactorEnabled: true,
      emailVerified: true,
    },
    workspaceId: 'mock-ws-1',
  },
  version: 0,
};

const ROUTES = [
  { path: '/dashboard?ui=new',  name: 'dashboard-new'  },
  { path: '/dashboard?ui=legacy', name: 'dashboard-legacy' },
  { path: '/settings?ui=new',   name: 'settings-new'   },
  { path: '/tickets?ui=new',    name: 'tickets-new'    },
  { path: '/devices?ui=new',    name: 'devices-new'    },
  { path: '/design?ui=new',     name: 'design-new'     },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile',  width: 390,  height: 844 },
];

const THEMES = ['light', 'dark'];

async function main() {
  const browser = await chromium.launch();
  const results = [];

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
        baseURL: BASE,
      });

      // Inject mock auth state into localStorage przed React-em
      await context.addInitScript((auth) => {
        localStorage.setItem('idesk-auth', JSON.stringify(auth));
        localStorage.setItem('sd-ui', 'new');
        localStorage.setItem('idesk-theme', JSON.stringify({ state: { theme: 'auto' }, version: 0 }));
      }, MOCK_AUTH);

      // Block all API calls (szybki fail) ALE mock auth/refresh:
      // AuthBootstrap robi POST /auth/refresh i przy fail wykonuje logout() → redirect /login.
      // Playwright: ostatnia route zarejestrowana ma priorytet → wildcard first, specific last.
      await context.route('**/api/v2/**', (route) => route.abort());
      await context.route('**/api/v2/auth/refresh', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ accessToken: 'mock-access-token' }),
        }),
      );

      const page = await context.newPage();

      for (const r of ROUTES) {
        const file = `${r.name}--${theme}--${vp.name}.png`;
        const path = resolve(OUT, file);
        try {
          await page.goto(`${BASE}${r.path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
          // Czekamy aż AuthBootstrap zakończy + lazy chunk się wczyta + queries zfailują z route.abort()
          await page.waitForTimeout(3500);
          // Zamknij cookie banner jeśli jest, żeby nie zasłaniał DS UI
          try {
            await page.click('button:has-text("Rozumiem")', { timeout: 1500 });
            await page.waitForTimeout(300);
          } catch { /* brak bannera, OK */ }
          await page.screenshot({ path, fullPage: false });
          results.push({ file, ok: true, route: r.path, theme, viewport: vp.name });
          console.log(`✓ ${file}`);
        } catch (err) {
          results.push({ file, ok: false, route: r.path, theme, viewport: vp.name, error: String(err) });
          console.error(`✗ ${file}: ${err.message}`);
        }
      }

      // Special: mobile drawer open snapshot
      if (vp.name === 'mobile' && theme === 'light') {
        try {
          await page.goto(`${BASE}/dashboard?ui=new`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(3500);
          try { await page.click('button:has-text("Rozumiem")', { timeout: 1500 }); await page.waitForTimeout(300); } catch {}
          await page.click('.sd-topbar__burger', { timeout: 5000 });
          await page.waitForTimeout(400);
          const file = `dashboard-new--light--mobile-drawer-open.png`;
          await page.screenshot({ path: resolve(OUT, file), fullPage: false });
          results.push({ file, ok: true, route: '/dashboard?ui=new (drawer open)', theme: 'light', viewport: 'mobile' });
          console.log(`✓ ${file}`);
        } catch (err) {
          console.error(`✗ drawer-open: ${err.message}`);
        }
      }

      await context.close();
    }
  }

  await browser.close();
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} screenshots OK`);
  console.log(`Output: ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
