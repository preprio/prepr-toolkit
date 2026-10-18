import type { NextRequest, NextResponse } from 'next/server';

import {
  isFrameworkSignal,
  type PreprClient,
  type PreprDocument,
} from '../core/graphql';
import { getPreprHeadersFromHeaders } from '../core/server';
import { decisionsFrom, type PreprDecisions } from '../core/variants';

/**
 * Request header of the decision requests the browser sends, for a page load
 * and for a click. `createPreprProxy` answers them with the page's decisions
 * as text instead of rendering the page.
 */
export const PREPR_DECIDE_HEADER = 'Prepr-Decide';

/** A decision that shows the default variant of every group. */
export const DEFAULT_DECISION = '*';

/**
 * Cookie holding the visitor's recent decisions per URL, written by
 * `createPreprProxy` and by the browser, and read by both: the proxy decides
 * a page load only when it holds nothing usable for that URL, and the inline
 * script of `PreprStack` shows what it holds before the page paints.
 */
export const PREPR_DECISIONS_COOKIE = 'prepr_decisions';

// Kept in step with `requestPreprDecision`, which runs in the browser and
// cannot import these.
const DECISION_FRESH_MS = 10_000;
const DECISION_KEEP_MS = 1_800_000;
const DECISION_KEEP_STATIC_MS = 3_600_000;
const STORED_MAX_ENTRIES = 20;
// Encoded; well under the 4 KB browsers keep per cookie.
const STORED_MAX_LENGTH = 3000;

/** Decision and the time it was made (ms), per URL path and query. */
export type StoredDecisions = Record<string, [string, number]>;

/**
 * Parses the decisions cookie. Never throws: the cookie comes from the
 * visitor, so anything malformed counts as nothing stored.
 */
export function readStoredDecisions(raw: string | undefined): StoredDecisions {
  const stored: StoredDecisions = Object.create(null);
  if (!raw) return stored;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return stored;
    for (const [key, entry] of Object.entries(parsed)) {
      if (
        key.startsWith('/') &&
        Array.isArray(entry) &&
        typeof entry[0] === 'string' &&
        typeof entry[1] === 'number'
      ) {
        stored[key] = [entry[0], entry[1]];
      }
    }
  } catch {
    // Malformed: nothing stored.
  }
  return stored;
}

/**
 * The stored decision for `key` while it may still be shown: a failed
 * answer for 10 seconds, "no groups" for an hour, any other for 30 minutes.
 */
export function usableDecision(
  stored: StoredDecisions,
  key: string,
  now: number,
): string | undefined {
  const entry = stored[key];
  if (!entry) return undefined;
  const [value, at] = entry;
  const age = now - at;
  const keep =
    value === DEFAULT_DECISION
      ? DECISION_FRESH_MS
      : value === ''
        ? DECISION_KEEP_STATIC_MS
        : DECISION_KEEP_MS;
  return age >= 0 && age < keep ? value : undefined;
}

/**
 * The cookie value with `value` stored for `key`: entries past their time
 * dropped, the newest kept within the size cap. A failed answer never
 * replaces a usable real one.
 */
export function writeStoredDecisions(
  stored: StoredDecisions,
  key: string,
  value: string,
  now: number,
): string {
  const kept = usableDecision(stored, key, now);
  const entries = Object.entries(stored).filter(
    ([stale]) =>
      stale !== key && usableDecision(stored, stale, now) !== undefined,
  );
  entries.push([
    key,
    value === DEFAULT_DECISION &&
    kept !== undefined &&
    kept !== DEFAULT_DECISION
      ? stored[key]!
      : [value, now],
  ]);
  entries.sort((a, b) => b[1][1] - a[1][1]);
  entries.length = Math.min(entries.length, STORED_MAX_ENTRIES);
  let json = JSON.stringify(Object.fromEntries(entries));
  while (
    entries.length > 1 &&
    encodeURIComponent(json).length > STORED_MAX_LENGTH
  ) {
    entries.pop();
    json = JSON.stringify(Object.fromEntries(entries));
  }
  return json;
}

// More groups than a page shows; the cap keeps the answer small.
const DECISIONS_MAX_GROUPS = 40;
const SAFE_ID = /^[\w-]+$/;

/**
 * `group:variant|variant~group:variant`. Ids outside letters, digits, `_`
 * and `-` are dropped.
 */
export function serializeDecisions(decisions: PreprDecisions): string {
  return [...decisions]
    .filter(([group]) => SAFE_ID.test(group))
    .slice(0, DECISIONS_MAX_GROUPS)
    .map(
      ([group, variants]) =>
        `${group}:${variants.filter((v) => SAFE_ID.test(v)).join('|')}`,
    )
    .join('~');
}

/**
 * The visitor headers `createPreprMiddleware` forwards: the overridden request
 * headers on `response` when it set any, the request's own otherwise.
 */
export function forwardedHeaders(request: NextRequest, response: NextResponse) {
  const overridden = response.headers.get('x-middleware-override-headers');
  if (!overridden) return getPreprHeadersFromHeaders(request.headers);
  const headers = new Headers();
  for (const name of overridden.split(',')) {
    const value = response.headers.get(`x-middleware-request-${name.trim()}`);
    if (value !== null) headers.set(name.trim(), value);
  }
  return getPreprHeadersFromHeaders(headers);
}

/**
 * What `createPreprProxy` needs from a client made by the Next
 * `createPreprClient`, kept off its public type.
 */
export const preprClientInternals = new WeakMap<
  object,
  { client: PreprClient }
>();

/**
 * The decisions for one page view, serialized: the visitor's variant of
 * every A/B test and segment personalization group on the page, nested lists
 * included, in one Prepr request. Empty when the page has none;
 * {@link DEFAULT_DECISION} when Prepr cannot answer in time.
 */
export async function decideView<TVariables>(
  client: PreprClient,
  headers: Headers,
  page: {
    document: PreprDocument<unknown, TVariables>;
    variables?: TVariables;
    decision?: PreprDocument<unknown, TVariables>;
  },
  timeoutMs = 1000,
): Promise<string> {
  const init = { signal: AbortSignal.timeout(timeoutMs) };
  try {
    const decided = page.decision
      ? decisionsFrom(
          (await client.query(page.decision, page.variables, { headers, init }))
            .data,
        )
      : await client.decide(page.document, page.variables, { headers, init });
    return serializeDecisions(decided);
  } catch (error) {
    if (isFrameworkSignal(error)) throw error;
    return DEFAULT_DECISION;
  }
}
