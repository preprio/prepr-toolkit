import {
  COOKIE_PREVIEW_MODE,
  COOKIE_SEGMENT,
  COOKIE_TOOLBAR_OPEN,
  COOKIE_VARIANT,
  PARAM_HIDE_BAR,
} from './constants';
import { getCookie } from './cookies';
import { resolveFeatures } from './features';
import { isLocale, t as translate, type Locale } from './i18n';
import { createIframeBridge } from './iframe-bridge';
import { createStegaAutoClean, type StegaAutoClean } from './stega/auto-clean';
import { createStegaController, stegaClean } from './stega';
import {
  createToolbarStore,
  type ToolbarState,
  type ToolbarStore,
} from './store';
import { createChangeHandler } from './toolbar-change-handler';
import type {
  PreprPreviewOptions,
  PreprSegment,
  PreprToolbarProps,
  PreprVariant,
} from './types';
import {
  definePreprToolbar,
  type PreprToolbarElement,
} from './ui/toolbar-element';
import { createScopedLogger, initDebugLogger, sendPreprEvent } from './utils';

const debug = createScopedLogger('create-preview');

/**
 * Navigation seam that keeps the controller framework-free. Next.js/Astro inject
 * their router here; the default uses `window.location`.
 */
export interface PreprNavigationAdapter {
  navigate(url: string): void;
  currentPath(): string;
  /**
   * Refresh after a preview-mode toggle. Defaults to `window.location.reload()`;
   * SPA routers can pass a soft refresh like Next.js `router.refresh()`.
   */
  reload?(): void;
}

export interface CreatePreprPreviewOptions {
  /**
   * Toolbar data. Optional: a headless preview (`ui: false`) that only wants
   * click-to-edit or scroll restore has no segment list to pass.
   */
  props?: PreprToolbarProps;
  options?: PreprPreviewOptions;
  navigation?: PreprNavigationAdapter;
}

export interface PreprPreviewController {
  destroy(): void;
}

// Test-only seam: keeps the store reachable without hanging a `__store` field
// off PreprPreviewController, which would leak into dist/index.d.ts and
// consumer autocomplete.
const controllerStores = new WeakMap<PreprPreviewController, ToolbarStore>();

/** @internal */
export function getControllerStore(
  controller: PreprPreviewController,
): ToolbarStore | undefined {
  return controllerStores.get(controller);
}

function defaultNavigation(): PreprNavigationAdapter {
  return {
    navigate: (url) => window.location.assign(url),
    currentPath: () => window.location.pathname + window.location.search,
  };
}

/**
 * The CMS deep-link to open for a clicked field, or null if it is not safe.
 *
 * `href` arrives from stega-encoded page content and is read back off a
 * `data-prepr-href` DOM attribute, so it is neither trusted nor tamper-proof:
 * any script on the page can rewrite the attribute before the click. Handing
 * that to `window.open` unchecked lets a `javascript:` or `data:` URL execute
 * in the site's own origin.
 *
 * Only http(s) is allowed through. Relative hrefs resolve against the current
 * document, which is why a base is passed — `new URL` throws without one.
 *
 * @internal Exported for tests only; not re-exported from the package entry.
 */
export function safeEditUrl(href: string): string | null {
  try {
    const url = new URL(href, window.location.href);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// "all_other_users" is synthetic — the API never returns it.
function buildSegments(data: readonly PreprSegment[]): PreprSegment[] {
  return [{ _id: 'all_other_users', name: 'All other users' }, ...data];
}

/** Explicit option wins; otherwise the first supported browser language; else 'en'. */
function resolveLocale(options?: PreprPreviewOptions): Locale {
  const explicit = options?.locale;
  if (isLocale(explicit)) return explicit;
  if (typeof navigator !== 'undefined') {
    const candidates =
      Array.isArray(navigator.languages) && navigator.languages.length
        ? navigator.languages
        : [navigator.language];
    const match = candidates
      .filter(Boolean)
      .map((l) => l.toLowerCase().split('-')[0])
      .find(isLocale);
    if (match) return match;
  }
  return 'en';
}

/**
 * Composition root for the Prepr preview runtime: hydrates state from props +
 * cookies, optionally mounts `<prepr-toolbar>`, and wires the collaborators —
 * the change handler (toolbar-change-handler.ts), the stega click-to-edit
 * controller, the auto-clean pass and the editor bridge (iframe-bridge.ts).
 *
 * Two independent axes control what runs:
 * - `options.features` — which features are active at all (segments, A/B,
 *   click-to-edit).
 * - `options.ui` — whether the visible toolbar is mounted. `ui: false` keeps
 *   every non-visual side effect wired, which is how a headless preview gets
 *   click-to-edit or editor scroll restore with no chrome of its own.
 */
export function createPreprPreview(
  opts: CreatePreprPreviewOptions = {},
): PreprPreviewController {
  const { props, options } = opts;
  const navigation = opts.navigation ?? defaultNavigation();

  initDebugLogger(options?.debug ?? false);

  const noop = (): PreprPreviewController => ({ destroy: () => {} });

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return noop();
  }

  const isIframe = window.parent !== window;
  const search = new URLSearchParams(window.location.search);
  const hideBar = search.get(PARAM_HIDE_BAR) === 'true';

  if (hideBar) {
    debug.log(`${PARAM_HIDE_BAR}=true — no visible toolbar`);
  }

  // The single place chrome is decided. Three independent reasons to skip it:
  // the consumer opted out, the editor owns the chrome inside its iframe, or
  // the URL asked for a bare preview. Every non-visual side effect below stays
  // wired in all three cases — the scroll position the editor restores travels
  // over the same bridge.
  const mountUi = (options?.ui ?? true) && !isIframe && !hideBar;

  const locale = resolveLocale(options);
  const features = resolveFeatures(options?.features);

  // Props win; persisted cookies fill the gaps. A disabled feature seeds empty
  // rather than reading its cookie at all, so a stale value left over from
  // before it was turned off cannot resurrect it.
  const previewMode = getCookie(COOKIE_PREVIEW_MODE) === 'true';
  const toolbarOpen = getCookie(COOKIE_TOOLBAR_OPEN) === 'true';
  const cookieSegment = features.segments ? getCookie(COOKIE_SEGMENT) : null;
  const cookieVariant = features.abTesting ? getCookie(COOKIE_VARIANT) : null;
  const rawVariant = features.abTesting
    ? (props?.activeVariant ?? cookieVariant)
    : null;
  const selectedVariant: PreprVariant | null =
    rawVariant === 'A' || rawVariant === 'B' ? rawVariant : null;

  const store = createToolbarStore({
    locale,
    features,
    segments: features.segments
      ? buildSegments(props?.segments ?? props?.data ?? [])
      : [],
    selectedSegment: features.segments
      ? (props?.activeSegment ?? cookieSegment ?? null)
      : null,
    selectedVariant,
    previewMode,
    toolbarOpen,
    isIframe,
  });

  // --- Element mount -------------------------------------------------------
  let el: PreprToolbarElement | null = null;
  if (mountUi) {
    definePreprToolbar();
    el = document.createElement('prepr-toolbar') as PreprToolbarElement;
    document.body.appendChild(el);
    el.connect(store, (key) => translate(key, locale));
  }

  // --- Stega controllers ---------------------------------------------------
  // `features.editMode` gates the site's OWN click-to-edit. Inside the editor's
  // iframe the CMS drives edit mode over `prepr:initVE`, so the machinery stays
  // wired there regardless of config — see the JSDoc on PreprFeatures.editMode.
  const editingEnabled = features.editMode || isIframe;

  const stega = createStegaController({
    // The CMS deep-link tooltip is chrome, so it follows the same decision as
    // the bar: noise inside the editor (clicking the element itself requests
    // the edit there), and unwanted in a headless preview that asked for no UI.
    tooltip: mountUi,
    // In the editor, ask the parent to focus the field instead of opening a new
    // tab. Standalone previews keep the window.open behaviour.
    onEdit: ({ href, origin, id, field }) => {
      // Validated on both branches: the editor follows this href too, so a
      // hostile value must not be laundered through postMessage either.
      const safeHref = href ? safeEditUrl(href) : null;
      if (href && !safeHref) {
        debug.warn('ignored edit request with unsupported href scheme');
        return;
      }
      if (isIframe) {
        sendPreprEvent('field_edit_requested', {
          href: safeHref ?? undefined,
          origin,
          id,
          field,
        });
      } else if (safeHref) {
        // `noopener` — without it the opened tab keeps a live `window.opener`
        // handle back to this page.
        window.open(safeHref, '_blank', 'noopener,noreferrer');
      }
    },
  });

  // Unconditional: stega characters only exist when the server already
  // fetched preview (encoded) content, so their presence — not the preview
  // cookie — is the signal. Outside preview the scan finds nothing and the
  // observer never matches, so this is free in production. Gating this on
  // previewMode left the editor iframe (edit mode via `prepr:initVE`, cookie
  // dropped cross-site) tagged but never stripped.
  const autoClean: StegaAutoClean = createStegaAutoClean();
  autoClean.start();

  // --- Subscriptions (side effects) ----------------------------------------
  const handleChange = createChangeHandler({
    store,
    features,
    editingEnabled,
    navigate: (url) => navigation.navigate(url),
    currentPath: () => navigation.currentPath(),
    reload: navigation.reload ?? (() => window.location.reload()),
    stega,
  });

  let prev: ToolbarState = store.get();

  // Advance `prev` BEFORE running the handlers: a nested `store.set` from
  // inside handleChange must diff against the state it actually mutated, and
  // the outer call must not clobber `prev` back to a stale snapshot afterwards.
  const unsubscribe = store.subscribe((state) => {
    const before = prev;
    prev = state;
    handleChange(before, state);
  });

  // --- Iframe messaging -----------------------------------------------------
  const bridge = createIframeBridge(store, {
    allowedEditorOrigins: options?.allowedEditorOrigins,
  });

  // Mount-time scroll handshake. Fired even outside an iframe, with the
  // `{ value: 0 }` payload the editor expects. Runs before `bridge.start()`,
  // so no trusted origin exists yet — allowed to broadcast because the
  // constant `{ value: 0 }` carries no content data, same as `loaded`.
  sendPreprEvent(
    'getScrollPosition',
    { value: 0 },
    {
      allowUntrustedTarget: true,
    },
  );

  if (isIframe) {
    bridge.start();
  }

  // --- Teardown ------------------------------------------------------------
  function destroy(): void {
    unsubscribe();
    stega.stop();
    autoClean.stop();
    if (isIframe) {
      bridge.stop();
    }
    el?.remove();
    debug.log('preview destroyed');
  }

  const controller: PreprPreviewController = { destroy };
  controllerStores.set(controller, store);
  return controller;
}

export { stegaClean };
