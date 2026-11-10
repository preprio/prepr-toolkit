/**
 * State shared by every copy of the toolkit on a page.
 *
 * Each entry point (`@preprio/toolkit`, `/nuxt/live`, `/react`, ...) is its own
 * bundle, so a module-level variable exists once per bundle. The toolbar and
 * live preview usually load from different entry points and still have to agree
 * on the editor origin, the debug flag and strict mode, so that state lives in
 * one slot on `globalThis` instead.
 */
interface SharedState {
  /** Editor origin allowlisted by the toolbar handshake; `null` before it. */
  trustedParentOrigin: string | null;
  /** The toolbar's `debug` option; `undefined` until a toolbar is created. */
  debugEnabled: boolean | undefined;
  /** The toolbar's `strictMode` option. */
  strictMode: boolean;
  /**
   * What the running live bridge announced in `live_ready`: `true` with strict
   * mode, `false` without, `undefined` while no bridge runs.
   */
  liveAnnouncedStrict: boolean | undefined;
}

const KEY = Symbol.for('@preprio/toolkit:shared-state');

function initialState(): SharedState {
  return {
    trustedParentOrigin: null,
    debugEnabled: undefined,
    strictMode: false,
    liveAnnouncedStrict: undefined,
  };
}

/** @internal */
export function sharedState(): SharedState {
  const scope = globalThis as { [KEY]?: SharedState };
  return (scope[KEY] ??= initialState());
}

/** @internal Tests only. */
export function resetSharedState(): void {
  Object.assign(sharedState(), initialState());
}
