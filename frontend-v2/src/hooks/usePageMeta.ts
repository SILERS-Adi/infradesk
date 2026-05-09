import { useEffect } from 'react';

const DEFAULT_TITLE = 'InfraDesk — Helpdesk i monitoring IT z AI dla MSP i zespołów IT';
const DEFAULT_DESCRIPTION = 'Tickety, urządzenia, zdalny dostęp, monitoring i CRM w jednym panelu. Asystent na każdej stacji robotniczej. 30 dni za darmo, od 49 zł/mc netto.';

function setMetaContent(name: string, attr: 'name' | 'property', content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Ustawia document.title oraz meta description / og:title / og:description per-page.
 * Działa tylko po stronie klienta (UX); social crawlerzy widzą wyłącznie defaulty z index.html.
 */
export function usePageMeta(opts: { title?: string; description?: string }): void {
  useEffect(() => {
    const title = opts.title ? `${opts.title} · InfraDesk` : DEFAULT_TITLE;
    const desc = opts.description ?? DEFAULT_DESCRIPTION;
    document.title = title;
    setMetaContent('description', 'name', desc);
    setMetaContent('og:title', 'property', title);
    setMetaContent('og:description', 'property', desc);
    setMetaContent('twitter:title', 'name', title);
    setMetaContent('twitter:description', 'name', desc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.title, opts.description]);
}
