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
  navigate(url: string): void;
  currentPath(): string;
  reload(): void;
  /** Start/stop the click-to-edit stega controller on edit-mode toggles. */
  stega: { start(): void; stop(): void };
  /** Start/stop the runtime auto-clean pass on preview-mode toggles. */
  syncAutoClean(active: boolean): void;
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
  const { store, stega, syncAutoClean } = deps;

  function updateParam(name: string, value: string | null): void {
    const [path, existing] = splitPath(deps.currentPath());
    const params = new URLSearchParams(existing);
    if (value === null) {
      params.delete(name);
    } else {
      params.set(name, value);
    }
    const query = params.toString();
    deps.navigate(query ? `${path}?${query}` : path);
  }

  return function handleChange(
    before: ToolbarState,
    after: ToolbarState
  ): void {
    if (before.selectedSegment !== after.selectedSegment) {
      if (after.selectedSegment === null) {
        removeCookie(COOKIE_SEGMENT, '/', crossSiteCookieOptions());
      } else {
        setCookie(COOKIE_SEGMENT, after.selectedSegment, cookieOpts());
      }
      updateParam(PARAM_SEGMENT, after.selectedSegment);
      sendPreprEvent('segment_changed', {
        segment: after.selectedSegment ?? undefined,
      });
    }

    if (before.selectedVariant !== after.selectedVariant) {
      if (after.selectedVariant === null) {
        removeCookie(COOKIE_VARIANT, '/', crossSiteCookieOptions());
      } else {
        setCookie(COOKIE_VARIANT, after.selectedVariant, cookieOpts());
      }
      updateParam(PARAM_VARIANT, after.selectedVariant);
      sendPreprEvent('variant_changed', {
        variant: after.selectedVariant ?? undefined,
      });
    }

    if (before.editMode !== after.editMode) {
      if (after.editMode) {
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
      // Auto-clean runs only in preview mode.
      syncAutoClean(after.previewMode);
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
