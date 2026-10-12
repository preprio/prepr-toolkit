/**
 * State shared between the server, which decides segment variants, and the
 * browser, which asks for fresh decisions in the background: which pages were
 * decided for this visitor, and when.
 */

/** Cookie holding the pages decided for this visitor, each with its decision time. */
export const PREPR_REFRESH_COOKIE = 'prepr_refresh';

/** Request header of a background refresh: the pages to decide, `|`-separated. */
export const PREPR_REFRESH_HEADER = 'Prepr-Refresh';

/** Pages remembered for refreshing; each costs a Prepr request per refresh. */
export const REFRESH_MAX_PATHS = 5;

// One leading slash, then URL-path characters only. A second slash or a
// backslash would make `fetch` leave the site (`//host`, `/\host`), and the
// separators below must not appear inside a path.
const SAFE_PATH = /^\/(?![/\\])[\w\-./%]{0,200}$/;

/** One page decided for this visitor, and when (epoch milliseconds; `0` when unknown). */
export interface PreprRefreshEntry {
  path: string;
  at: number;
}

/** The path when it is a same-site URL path this module accepts. */
export function safePath(path: string): string | undefined {
  return SAFE_PATH.test(path) ? path : undefined;
}

/**
 * Whether a decision made at `at` is younger than `freshFor`. A time in the
 * future (a tampered cookie, or clocks that disagree) is never fresh, so it
 * cannot hold an old decision in place.
 */
export function isFresh(
  at: number,
  freshFor: number,
  now = Date.now(),
): boolean {
  const age = now - at;
  return at > 0 && age >= 0 && age < freshFor;
}

/** Newest first, one entry per page, at most `REFRESH_MAX_PATHS`. */
function cleanEntries(
  entries: readonly PreprRefreshEntry[],
): PreprRefreshEntry[] {
  const out: PreprRefreshEntry[] = [];
  for (const entry of entries) {
    if (out.length === REFRESH_MAX_PATHS) break;
    if (safePath(entry.path) && !out.some((e) => e.path === entry.path)) {
      out.push(entry);
    }
  }
  return out;
}

/** Parses the refresh cookie. Never throws: bad input reads as empty. */
export function parseRefresh(raw: string | undefined): PreprRefreshEntry[] {
  return cleanEntries(
    (raw ?? '').split('|').map((pair) => {
      const split = pair.lastIndexOf('~');
      const at = Number(split < 0 ? '' : pair.slice(split + 1));
      return {
        path: split < 0 ? pair : pair.slice(0, split),
        at: Number.isFinite(at) && at > 0 ? Math.floor(at) : 0,
      };
    }),
  );
}

export function serializeRefresh(
  entries: readonly PreprRefreshEntry[],
): string {
  return cleanEntries(entries)
    .map((entry) => `${entry.path}~${Math.floor(entry.at)}`)
    .join('|');
}

/** Parses the refresh request header. Never throws. */
export function parseRefreshPaths(header: string | null | undefined): string[] {
  return cleanEntries(
    (header ?? '').split('|').map((path) => ({ path, at: 0 })),
  ).map((entry) => entry.path);
}
