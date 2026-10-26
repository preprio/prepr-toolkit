import {
  createPreprPreview,
  type PreprPreviewController,
} from './create-preview';
import {
  startHtmlLivePreview,
  type HtmlLivePreview,
  type HtmlLivePreviewOptions,
} from './live-preview/html-live';
import type { PreprPreviewOptions, PreprToolbarProps } from './types';
import { createScopedLogger } from './utils';

const debug = createScopedLogger('auto');

const PAYLOAD_SELECTOR = 'script[data-prepr-toolbar-props]';

/**
 * What the server renders into `<script type="application/json"
 * data-prepr-toolbar-props>`. The same shape the Astro `PreprToolbar` emits,
 * plus `live`.
 */
export interface PreprAutoPayload {
  props?: PreprToolbarProps;
  options?: PreprPreviewOptions;
  /**
   * How live preview applies the editor's unsaved changes; see
   * `startHtmlLivePreview`'s `apply`. Defaults to `'dom'`, which needs no
   * server support. `false` turns live preview off.
   */
  live?: HtmlLivePreviewOptions['apply'] | false;
}

function readPayload(): PreprAutoPayload | null {
  const element = document.querySelector(PAYLOAD_SELECTOR);
  if (!element?.textContent) return null;
  try {
    const payload: unknown = JSON.parse(element.textContent);
    return payload && typeof payload === 'object'
      ? (payload as PreprAutoPayload)
      : null;
  } catch {
    debug.warn('could not read the toolbar props');
    return null;
  }
}

/**
 * Start the Prepr preview from server-rendered props: toolbar, click-to-edit
 * and live preview, from one call. Reads the JSON the server put in a
 * `<script type="application/json" data-prepr-toolbar-props>` tag and does
 * nothing when the page has none, so it is safe to load everywhere and gate
 * on the server.
 *
 * Survives client-side page swaps (Livewire `wire:navigate`, Turbo, htmx
 * boosting): when `<body>` is replaced, or the toolbar is removed from it,
 * the preview starts again on the new page. Inside the Prepr editor the page
 * is reloaded instead, because the editor connects to the preview only when
 * the frame loads.
 *
 * Returns a function that stops everything.
 */
export function startPreprAuto(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }
  const first = readPayload();
  if (!first) return () => {};

  const inEditor = window.self !== window.top;
  let payload = first;
  let preview: PreprPreviewController | null = null;
  let live: HtmlLivePreview | null = null;
  let body = document.body;

  const start = (): void => {
    preview = createPreprPreview({
      props: payload.props,
      options: payload.options,
    });
    body = document.body;
    watchBody();
  };

  // Live preview listens on `window` and renders into whatever `<body>` is
  // current, so it outlives page swaps and starts once.
  if (payload.live !== false) {
    live = startHtmlLivePreview({
      allowedEditorOrigins: payload.options?.allowedEditorOrigins,
      strictMode: payload.options?.strictMode,
      apply: payload.live ?? 'dom',
    });
  }

  const restart = (): void => {
    if (inEditor) {
      window.location.reload();
      return;
    }
    debug.log('page swapped; starting the preview again');
    preview?.destroy();
    payload = readPayload() ?? payload;
    start();
  };

  // A swap replaces `<body>` (a child of `<html>`) or empties it, taking the
  // toolbar element with it.
  const htmlObserver = new MutationObserver(() => {
    if (document.body && document.body !== body) restart();
  });
  htmlObserver.observe(document.documentElement, { childList: true });

  let bodyObserver: MutationObserver | null = null;
  function watchBody(): void {
    bodyObserver?.disconnect();
    const toolbar = body.querySelector(':scope > prepr-toolbar');
    if (!toolbar) return;
    bodyObserver = new MutationObserver(() => {
      if (!toolbar.isConnected) restart();
    });
    bodyObserver.observe(body, { childList: true });
  }

  start();

  return () => {
    htmlObserver.disconnect();
    bodyObserver?.disconnect();
    preview?.destroy();
    live?.stop();
  };
}
