import {
  COOKIE_PREVIEW_MODE,
  COOKIE_SEGMENT,
  COOKIE_TOOLBAR_OPEN,
  COOKIE_VARIANT,
  ONE_YEAR_SECONDS,
  PARAM_SEGMENT,
  PARAM_VARIANT,
} from './constants';
import { crossSiteCookieOptions, removeCookie, setCookie } from './cookies';
import type { ToolbarState, ToolbarStore } from './store';
import type { ResolvedPreprFeatures } from './types';
import { sendPreprEvent } from './utils';

// Resolved per call, not once at module load: `crossSiteCookieOptions` reads
// `window`, which is absent when this module is imported during SSR.
//
// Inside the editor's cross-site iframe every one of these cookies is a
// third-party cookie, so without SameSite=None the browser drops the write.
// Losing Prepr-Preview-Mode there is what caused a reload loop: the toolbar
// remounted as previewMode:false, the editor's `prepr:initVE` set it back to
// true, and that transition triggered another reload.
function cookieOpts() {
  return {
    maxAge: ONE_YEAR_SECONDS,
    path: '/',
    ...crossSiteCookieOptions(),
  };
}

export interface ChangeHandlerDeps {
  store: ToolbarStore;
  /** Disabled features write no cookies, no query params and emit no events. */
  features: ResolvedPreprFeatures;
  /**
   * Whether click-to-edit may run at all: `features.editMode`, OR the editor
   * iframe, which drives edit mode itself.
   */
  editingEnabled: boolean;
  navigate(url: string): void;
  currentPath(): string;
  reload(): void;
  /** Start/stop the click-to-edit stega controller on edit-mode toggles. */
  stega: { start(): void; stop(): void };
}

/**
 * Store-change handler owning every toolbar side effect: cookies, query params,
 * postMessage, stega lifecycle and reloads. Pure function of its deps, so it is
 * testable without mounting the toolbar.
 *
 * Wire protocol: a personalization reset has no dedicated event. It is an
 * ordinary segment + variant write emitting `segment_changed`/`variant_changed`.
 */
export function createChangeHandler(
  deps: ChangeHandlerDeps
): (before: ToolbarState, after: ToolbarState) => void {
  const { store, stega, features, editingEnabled } = deps;

  // Batches every param write in a transition into a single `navigate` call.
  // `navigate` triggers a full page load, so two calls race: the second
  // recomputes its URL from the still-unchanged `currentPath()` and resurrects
  // the param the first one removed. Clearing a segment and a variant together
  // would otherwise only clear the variant.
  function updateParams(patch: Record<string, string | null>): void {
    const [path, existing] = splitPath(deps.currentPath());
    const params = new URLSearchParams(existing);
    for (const [name, value] of Object.entries(patch)) {
      if (value === null) {
        params.delete(name);
      } else {
        params.set(name, value);
      }
    }
    const query = params.toString();
    deps.navigate(query ? `${path}?${query}` : path);
  }

  return function handleChange(
    before: ToolbarState,
    after: ToolbarState
  ): void {
    const paramPatch: Record<string, string | null> = {};

    if (features.segments && before.selectedSegment !== after.selectedSegment) {
      if (after.selectedSegment === null) {
        removeCookie(COOKIE_SEGMENT, '/', crossSiteCookieOptions());
      } else {
        setCookie(COOKIE_SEGMENT, after.selectedSegment, cookieOpts());
      }
      paramPatch[PARAM_SEGMENT] = after.selectedSegment;
      sendPreprEvent('segment_changed', {
        segment: after.selectedSegment ?? undefined,
      });
    }

    if (features.abTesting && before.selectedVariant !== after.selectedVariant) {
      if (after.selectedVariant === null) {
        removeCookie(COOKIE_VARIANT, '/', crossSiteCookieOptions());
      } else {
        setCookie(COOKIE_VARIANT, after.selectedVariant, cookieOpts());
      }
      paramPatch[PARAM_VARIANT] = after.selectedVariant;
      sendPreprEvent('variant_changed', {
        variant: after.selectedVariant ?? undefined,
      });
    }

    if (Object.keys(paramPatch).length > 0) {
      updateParams(paramPatch);
    }

    if (before.editMode !== after.editMode) {
      // `edit_mode_toggled` stays unconditional — the editor tracks it even when
      // the site's own click-to-edit is off — but the overlay only runs when
      // editing is actually enabled here.
      if (after.editMode && editingEnabled) {
        stega.start();
      } else {
        stega.stop();
      }
      sendPreprEvent('edit_mode_toggled', { editMode: after.editMode });
    }

    if (before.previewMode !== after.previewMode) {
      // One nested set for both coupled writes, so subscribers see a single
      // transition and edit_mode_toggled fires once, before
      // preview_mode_toggled.
      const coupled: Partial<ToolbarState> = {};
      if (!after.previewMode && after.editMode) {
        coupled.editMode = false;
      }
      // Toggling preview always auto-closes the toolbar.
      if (after.toolbarOpen) {
        coupled.toolbarOpen = false;
      }
      if (Object.keys(coupled).length > 0) {
        store.set(coupled);
      }
      setCookie(COOKIE_PREVIEW_MODE, String(after.previewMode), cookieOpts());
      setCookie(COOKIE_TOOLBAR_OPEN, 'false', cookieOpts());
      sendPreprEvent('preview_mode_toggled', { previewMode: after.previewMode });
      // Inside the editor iframe the transition comes from `prepr:initVE` and
      // the content is already preview — reloading there is what caused the
      // infinite reload loop when the cross-site preview cookie was dropped
      // (each load remounted as previewMode:false, initVE flipped it back,
      // reload, repeat).
      if (!after.isIframe) {
        // Stale ?segment/?ab_testing params outrank the preview cookie in the
        // middleware, so a plain reload would keep serving preview content.
        // Strip them (navigate is a full page load) and only fall back to
        // reload() when there is nothing to strip.
        const [path, existing] = splitPath(deps.currentPath());
        const params = new URLSearchParams(existing);
        if (params.has(PARAM_SEGMENT) || params.has(PARAM_VARIANT)) {
          params.delete(PARAM_SEGMENT);
          params.delete(PARAM_VARIANT);
          const query = params.toString();
          deps.navigate(query ? `${path}?${query}` : path);
        } else {
          // Re-render with the new preview state.
          deps.reload();
        }
      }
    }

    if (before.toolbarOpen !== after.toolbarOpen) {
      setCookie(COOKIE_TOOLBAR_OPEN, String(after.toolbarOpen), cookieOpts());
    }
  };
}

/** Split "path?query" into ["path", "query"]. */
function splitPath(full: string): [string, string] {
  const index = full.indexOf('?');
  if (index === -1) return [full, ''];
  return [full.slice(0, index), full.slice(index + 1)];
}
