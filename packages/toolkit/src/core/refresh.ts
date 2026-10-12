/**
 * State shared between the server, which decides segment variants, and the
 * browser, which asks for fresh decisions in the background: when the last
 * decision was made and which pages it was made for.
 */

/** Cookie holding the time of the last segment decision and its pages. */
export const PREPR_REFRESH_COOKIE = 'prepr_refresh';

/** Request header of a background refresh: the pages to decide, `|`-separated. */
export const PREPR_REFRESH_HEADER = 'Prepr-Refresh';

/** Pages remembered for refreshing; each costs a Prepr request per refresh. */
export const REFRESH_MAX_PATHS = 5;

// One leading slash, then URL-path characters only. A second slash or a
// backslash would make `fetch` leave the site (`//host`, `/\host`), and the
// separators below must not appear inside a path.
const SAFE_PATH = /^\/(?![/\\])[\w\-./%]{0,200}$/;

export interface PreprRefreshState {
  /** Epoch milliseconds of the last decision; `0` when unknown. */
  at: number;
  /** Pages with segment groups at the top, most recently decided first. */
  paths: string[];
}

/** The path when it is a same-site URL path this module accepts. */
export function safePath(path: string): string | undefined {
  return SAFE_PATH.test(path) ? path : undefined;
}

function cleanPaths(paths: readonly string[]): string[] {
  const out: string[] = [];
  for (const path of paths) {
    if (out.length === REFRESH_MAX_PATHS) break;
    if (safePath(path) && !out.includes(path)) out.push(path);
  }
  return out;
}

/** Parses the refresh cookie. Never throws: bad input reads as empty. */
export function parseRefresh(raw: string | undefined): PreprRefreshState {
  const value = raw ?? '';
  const split = value.indexOf('~');
  const at = Number(split < 0 ? value : value.slice(0, split));
  return {
    at: Number.isFinite(at) && at > 0 ? at : 0,
    paths: split < 0 ? [] : cleanPaths(value.slice(split + 1).split('|')),
  };
}

export function serializeRefresh(state: PreprRefreshState): string {
  return `${Math.floor(state.at)}~${cleanPaths(state.paths).join('|')}`;
}

/** Parses the refresh request header. Never throws. */
export function parseRefreshPaths(header: string | null | undefined): string[] {
  return cleanPaths((header ?? '').split('|'));
}
