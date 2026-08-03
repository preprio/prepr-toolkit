import {
  COOKIE_PREVIEW_MODE,
  COOKIE_SEGMENT,
  COOKIE_TOOLBAR_OPEN,
  COOKIE_VARIANT,
  PARAM_HIDE_BAR,
} from './constants';
import { getCookie } from './cookies';
import { isLocale, t as translate, type Locale } from './i18n';
import { createIframeBridge } from './iframe-bridge';
import { createStegaAutoClean, type StegaAutoClean } from './stega/auto-clean';
import { createStegaController, stegaClean } from './stega';
import { createToolbarStore, type ToolbarState, type ToolbarStore } from './store';
import { createChangeHandler } from './toolbar-change-handler';
import type {
  PreprSegment,
  PreprToolbarOptions,
  PreprToolbarProps,
  PreprVariant,
} from './types';
import { definePreprToolbar, type PreprToolbarElement } from './ui/toolbar-element';
import { createScopedLogger, initDebugLogger, sendPreprEvent } from './utils';

const debug = createScopedLogger('create-toolbar');

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

export interface CreatePreprToolbarOptions {
  props: PreprToolbarProps;
  options?: PreprToolbarOptions;
  navigation?: PreprNavigationAdapter;
}

export interface PreprToolbarController {
  destroy(): void;
}

// Test-only seam: keeps the store reachable without hanging a `__store` field
// off PreprToolbarController, which would leak into dist/index.d.ts and
// consumer autocomplete.
const controllerStores = new WeakMap<PreprToolbarController, ToolbarStore>();

/** @internal */
export function getControllerStore(
  controller: PreprToolbarController
): ToolbarStore | undefined {
  return controllerStores.get(controller);
}

function defaultNavigation(): PreprNavigationAdapter {
  return {
    navigate: url => window.location.assign(url),
    currentPath: () => window.location.pathname + window.location.search,
  };
}

// "all_other_users" is synthetic — the API never returns it.
function buildSegments(data: readonly PreprSegment[]): PreprSegment[] {
  return [{ _id: 'all_other_users', name: 'All other users' }, ...data];
}

/** Explicit option wins; otherwise the first supported browser language; else 'en'. */
function resolveLocale(options?: PreprToolbarOptions): Locale {
  const explicit = options?.locale;
  if (isLocale(explicit)) return explicit;
  if (typeof navigator !== 'undefined') {
    const candidates =
      Array.isArray(navigator.languages) && navigator.languages.length
        ? navigator.languages
        : [navigator.language];
    const match = candidates
      .filter(Boolean)
      .map(l => l.toLowerCase().split('-')[0])
      .find(isLocale);
    if (match) return match;
  }
  return 'en';
}

/**
 * Composition root: hydrates state from props + cookies, mounts
 * `<prepr-toolbar>`, and wires the collaborators — the change handler
 * (toolbar-change-handler.ts), the stega click-to-edit controller, the
 * auto-clean pass and the editor bridge (iframe-bridge.ts).
 */
export function createPreprToolbar(
  opts: CreatePreprToolbarOptions
): PreprToolbarController {
  const { props, options } = opts;
  const navigation = opts.navigation ?? defaultNavigation();

  initDebugLogger(options?.debug ?? false);

  const noop = (): PreprToolbarController => ({ destroy: () => {} });

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return noop();
  }

  const isIframe = window.parent !== window;
  const search = new URLSearchParams(window.location.search);
  const hideBar = search.get(PARAM_HIDE_BAR) === 'true';

  if (hideBar) {
    debug.log(`${PARAM_HIDE_BAR}=true — skipping mount`);
    return noop();
  }

  const locale = resolveLocale(options);

  // Props win; persisted cookies fill the gaps.
  const previewMode = getCookie(COOKIE_PREVIEW_MODE) === 'true';
  const toolbarOpen = getCookie(COOKIE_TOOLBAR_OPEN) === 'true';
  const cookieSegment = getCookie(COOKIE_SEGMENT);
  const cookieVariant = getCookie(COOKIE_VARIANT);
  const rawVariant = props.activeVariant ?? cookieVariant;
  const selectedVariant: PreprVariant | null =
    rawVariant === 'A' || rawVariant === 'B' ? rawVariant : null;

  const store = createToolbarStore({
    locale,
    segments: buildSegments(props.segments ?? props.data ?? []),
    selectedSegment: props.activeSegment ?? cookieSegment ?? null,
    selectedVariant,
    previewMode,
    toolbarOpen,
    isIframe,
  });

  // --- Element mount -------------------------------------------------------
  // Inside an iframe the visual editor owns all visible chrome, so we skip the
  // element entirely — every non-visual side effect below is still wired.
  let el: PreprToolbarElement | null = null;
  if (!isIframe) {
    definePreprToolbar();
    el = document.createElement('prepr-toolbar') as PreprToolbarElement;
    document.body.appendChild(el);
    el.connect(store, key => translate(key, locale));
  }

  // --- Stega controllers ---------------------------------------------------
  const stega = createStegaController({
    // The CMS deep-link tooltip is noise inside the editor; clicking the
    // element itself requests the edit there.
    tooltip: !isIframe,
    // In the editor, ask the parent to focus the field instead of opening a new
    // tab. Standalone previews keep the window.open behaviour.
    onEdit: ({ href, origin, id, field }) => {
      if (isIframe) {
        sendPreprEvent('field_edit_requested', { href, origin, id, field });
      } else if (href) {
        window.open(href);
      }
    },
  });

  const autoClean: StegaAutoClean = createStegaAutoClean();

  let autoCleanActive = false;
  function syncAutoClean(active: boolean): void {
    if (active && !autoCleanActive) {
      autoClean.start();
      autoCleanActive = true;
    } else if (!active && autoCleanActive) {
      autoClean.stop();
      autoCleanActive = false;
    }
  }

  // --- Subscriptions (side effects) ----------------------------------------
  const handleChange = createChangeHandler({
    store,
    navigate: url => navigation.navigate(url),
    currentPath: () => navigation.currentPath(),
    reload: navigation.reload ?? (() => window.location.reload()),
    stega,
    syncAutoClean,
  });

  let prev: ToolbarState = store.get();

  // Advance `prev` BEFORE running the handlers: a nested `store.set` from
  // inside handleChange must diff against the state it actually mutated, and
  // the outer call must not clobber `prev` back to a stale snapshot afterwards.
  const unsubscribe = store.subscribe(state => {
    const before = prev;
    prev = state;
    handleChange(before, state);
  });

  // Catch the case where we mounted already in preview mode.
  syncAutoClean(store.get().previewMode);

  // --- Iframe messaging -----------------------------------------------------
  const bridge = createIframeBridge(store);

  // Mount-time scroll handshake. Fired even outside an iframe, with the
  // `{ value: 0 }` payload the editor expects. Runs before `bridge.start()`,
  // so no trusted origin exists yet — allowed to broadcast because the
  // constant `{ value: 0 }` carries no content data, same as `loaded`.
  sendPreprEvent('getScrollPosition', { value: 0 }, {
    allowUntrustedTarget: true,
  });

  if (isIframe) {
    bridge.start();
  }

  // --- Teardown ------------------------------------------------------------
  function destroy(): void {
    unsubscribe();
    stega.stop();
    syncAutoClean(false);
    if (isIframe) {
      bridge.stop();
    }
    el?.remove();
    debug.log('toolbar destroyed');
  }

  const controller: PreprToolbarController = { destroy };
  controllerStores.set(controller, store);
  return controller;
}

export { stegaClean };
