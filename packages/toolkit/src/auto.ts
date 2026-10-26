/**
 * Drop-in entry for server-rendered sites on any backend. Importing it (or
 * loading `dist/browser/auto.js` with a `<script type="module">`) starts the
 * Prepr preview from the props the server rendered into
 * `<script type="application/json" data-prepr-toolbar-props>`; a page without
 * that tag is left alone.
 */
import { startPreprAuto } from './core/auto-start';

export { startPreprAuto, type PreprAutoPayload } from './core/auto-start';

declare global {
  interface Window {
    __preprAutoStarted?: boolean;
  }
}

function boot(): void {
  // The entry can be bundled into a page and loaded from a CDN at the same
  // time; two previews would announce themselves to the editor twice.
  if (window.__preprAutoStarted) return;
  window.__preprAutoStarted = true;
  startPreprAuto();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
