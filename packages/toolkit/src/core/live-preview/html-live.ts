import { HEADER_LIVE_RENDER } from '../constants';
import { createScopedLogger } from '../utils';
import { createLiveBridge } from './bridge-events';
import { createLiveStore, type LiveStore } from './live-store';
import { morphElement } from './morph';
import type { LivePatch } from './normalize-query';

const debug = createScopedLogger('live-preview:html');

const COMPLETE_DOCUMENT = /<\/html>\s*$/i;

/** Coalesces bursts of keystrokes into one server render. */
const SYNC_DEBOUNCE_MS = 150;

export interface HtmlLivePreviewOptions {
  /**
   * Replace the `*.prepr.io` editor-origin wildcard with an exact list, as
   * the toolbar's option of the same name.
   */
  allowedEditorOrigins?: string[];
}

export interface HtmlLivePreview {
  stop(): void;
}

/**
 * Live preview for server-rendered pages without a client framework (Astro,
 * or any HTML-first site): while an editor types, the page is requested
 * again from the server with the unsaved changes in the request body, and
 * only the parts of the DOM that changed are updated. On save the page is
 * requested without changes. The server applies them with `normalizeQuery`;
 * see `readLiveLogFromRequest`.
 *
 * A no-op outside the Prepr editor's preview iframe.
 */
export function startHtmlLivePreview(
  options: HtmlLivePreviewOptions = {},
): HtmlLivePreview {
  if (typeof window === 'undefined' || window.self === window.top) {
    return { stop() {} };
  }
  const store: LiveStore = createLiveStore();
  const bridge = createLiveBridge(store, {
    allowedEditorOrigins: () => options.allowedEditorOrigins,
  });
  bridge.start();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let pending: LivePatch[] | null = null;
  let stopped = false;

  const render = async (log: LivePatch[]): Promise<void> => {
    inFlight = true;
    try {
      const response = await fetch(window.location.href, {
        method: log.length ? 'POST' : 'GET',
        headers: log.length
          ? { 'Content-Type': 'application/json', [HEADER_LIVE_RENDER]: '1' }
          : {},
        body: log.length ? JSON.stringify({ log }) : undefined,
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      if (stopped) return;
      // A render that throws midway still arrives as a 200 when the page
      // streams, cut off where it failed. Applying it would blank the rest of
      // the page, so the editor keeps the last complete render instead.
      if (!COMPLETE_DOCUMENT.test(html)) {
        throw new Error('incomplete page; a component failed to render');
      }
      const next = new DOMParser().parseFromString(html, 'text/html');
      if (next.title && next.title !== document.title)
        document.title = next.title;
      morphElement(document.body, next.body);
    } catch (error) {
      debug.log('re-render failed', error as object);
    } finally {
      inFlight = false;
    }
    if (pending && !stopped) {
      const queued = pending;
      pending = null;
      void render(queued);
    }
  };

  const schedule = (log: LivePatch[]): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (inFlight) pending = log;
      else void render(log);
    }, SYNC_DEBOUNCE_MS);
  };

  const offLog = store.onLogChange((log) => {
    // A cleared log means a save; the invalidation below re-renders.
    if (log.length) schedule(log);
  });
  const offInvalidate = store.onInvalidate(() => schedule([]));

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      offLog();
      offInvalidate();
      bridge.stop();
    },
  };
}
