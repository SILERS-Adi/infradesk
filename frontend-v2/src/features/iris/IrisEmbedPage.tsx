/**
 * IrisEmbedPage — fullscreen Iris chat for iframe/webview embedding.
 *
 * DEPLOY LOCATION: /home/adrian/infradesk/frontend-v2/src/features/iris/IrisEmbedPage.tsx
 * ROUTE:           /iris-embed (registered OUTSIDE the AppShell wrapper)
 *
 * Token flow:
 *   1. Read ?token=<jwt> from URL (set by Asystent via get_iris_embed_url).
 *   2. Keep in-memory ONLY -- never localStorage (webview cookies may be
 *      shared across users in some enterprise setups).
 *   3. Attach as Authorization: Bearer <token> to /api/v2/ai/chat requests.
 *   4. If no token, fall back to session cookie (parent-window usage).
 *
 * Theme: ?theme=dark|light|auto applied via data-theme on documentElement.
 *        Respects prefers-color-scheme for "auto".
 */
import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IrisChatPage } from '@/features/ai/IrisChatPage';

type ThemeMode = 'auto' | 'light' | 'dark';

function applyTheme(mode: ThemeMode) {
  const effective =
    mode === 'auto'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : mode;
  document.documentElement.setAttribute('data-theme', effective);
  document.documentElement.style.colorScheme = effective;
}

export default function IrisEmbedPage() {
  const [params] = useSearchParams();
  const embedToken = params.get('token') || null;
  const themeParam = (params.get('theme') as ThemeMode) || 'auto';
  const chatRef = useRef<HTMLDivElement>(null);

  // Apply theme once on mount + listen for system changes if auto.
  useEffect(() => {
    applyTheme(themeParam);
    if (themeParam !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => applyTheme('auto');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themeParam]);

  // Expose the embed token on window so the shared `apiFetch` helper can
  // pick it up. IrisChatPage should check `window.__IRIS_EMBED_TOKEN__`
  // before falling back to cookie-based auth.
  useEffect(() => {
    if (embedToken) {
      (window as unknown as { __IRIS_EMBED_TOKEN__?: string }).__IRIS_EMBED_TOKEN__ =
        embedToken;
    }
    return () => {
      delete (window as unknown as { __IRIS_EMBED_TOKEN__?: string })
        .__IRIS_EMBED_TOKEN__;
    };
  }, [embedToken]);

  const bgStyle = useMemo<React.CSSProperties>(
    () => ({
      background:
        'radial-gradient(circle at 50% 20%, rgba(139, 92, 246, 0.08), transparent 60%), var(--bg, #040810)',
    }),
    [],
  );

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={bgStyle}
    >
      <div ref={chatRef} className="flex-1 min-h-0 overflow-hidden">
        <IrisChatPage />
      </div>
    </div>
  );
}
