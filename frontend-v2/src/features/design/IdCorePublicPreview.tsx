/**
 * Public unauthenticated preview of IdCoreShowcasePage for headless screenshots.
 * Route: /public/design/id-core-preview
 *
 * Forces dark theme on <html> while mounted so the orb renders against the
 * same dark navy background shown in the IDCORE.PNG reference.
 */

import { useEffect } from 'react';
import { IdCoreShowcasePage } from './IdCoreShowcasePage';

export function IdCorePublicPreview() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.getAttribute('data-theme');
    html.setAttribute('data-theme', 'dark');
    return () => {
      if (prev) html.setAttribute('data-theme', prev);
      else html.removeAttribute('data-theme');
    };
  }, []);
  return <IdCoreShowcasePage />;
}

export default IdCorePublicPreview;
