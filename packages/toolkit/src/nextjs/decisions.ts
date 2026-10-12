import type { NextRequest, NextResponse } from 'next/server';

import {
  isFrameworkSignal,
  mergePreprHeaders,
  type PreprClient,
  type PreprDocument,
} from '../core/graphql';
import {
  PREPR_REFRESH_COOKIE,
  parseRefresh,
  serializeRefresh,
} from '../core/refresh';
import { getPreprHeadersFromHeaders } from '../core/server';
import type { PreprDecisions } from '../core/variants';

/** The cookie `resolveDecisions` writes and the `PreprStack` switch reads. */
export const PREPR_DECISIONS_COOKIE = 'prepr_decisions';

// Groups remembered across pages; prefetches of several pages each add theirs.
const DECISIONS_MAX_GROUPS = 40;
export const SAFE_ID = /^[\w-]+$/;
const SEEN_MAX_PAGES = 1000;

export function parseDecisions(raw: string | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const pair of (raw ?? '').split('~')) {
    const at = pair.indexOf(':');
    const group = pair.slice(0, at);
    if (at < 1 || !SAFE_ID.test(group)) continue;
    out.set(
      group,
      pair
        .slice(at + 1)
        .split('|')
        .filter((variant) => SAFE_ID.test(variant)),
    );
  }
  return out;
}

export function serializeDecisions(decisions: Map<string, string[]>): string {
  return [...decisions]
    .slice(0, DECISIONS_MAX_GROUPS)
    .map(([group, variants]) => `${group}:${variants.join('|')}`)
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
 * Per page (document, then variables): the groups decisions have named, so a
 * later request can tell whether the stored cookie already covers the page.
 */
export type PreprSeenGroups = Map<unknown, Map<string, Set<string>>>;

/**
 * What `createPreprProxy` needs from a client made by the Next
 * `createPreprClient`, kept off its public type.
 */
export const preprClientInternals = new WeakMap<
  object,
  { client: PreprClient; seenGroups: PreprSeenGroups; url: string }
>();

/** How long a decision is kept before Prepr is asked again. */
export const DEFAULT_FRESH_FOR_MS = 10_000;

export interface ResolveDecisionsOptions {
  /** Give up after this many ms; the default variant shows. Default 1000. */
  timeoutMs?: number;
  /**
   * Keep the stored decision for this many ms instead of asking Prepr again.
   * Default 10 000; `0` asks on every request. Background refreshes by
   * `PreprPersonalizationSwitch` keep it fresh, so a page view rarely waits.
   */
  freshFor?: number;
  /** Skip the decision when this resolves to false. */
  onlyIf?: () => boolean | Promise<boolean>;
}

/**
 * Asks Prepr for the variants of the groups at the top of one page and
 * remembers which groups that page has. `undefined` when the page holds no
 * segment content at all.
 */
export async function decidePage<TVariables>(
  client: PreprClient,
  seenGroups: PreprSeenGroups,
  headers: Headers,
  document: PreprDocument<unknown, TVariables>,
  variables: TVariables | undefined,
  timeoutMs = 1000,
): Promise<PreprDecisions | undefined> {
  // A cached check: pages without segment groups cost no request.
  if (!(await client.hasSegments(document, variables))) return undefined;
  // Only the top-level lists: `aboveTheFold` renders those groups, and
  // Prepr answers this far faster than for every nested list.
  const decided = await client.decide(document, variables, {
    topLevelOnly: true,
    headers,
    init: { signal: AbortSignal.timeout(timeoutMs) },
  });
  let byVariables = seenGroups.get(document);
  if (!byVariables) {
    byVariables = new Map();
    seenGroups.set(document, byVariables);
  }
  const pageKey = JSON.stringify(variables ?? null);
  if (!byVariables.has(pageKey) && byVariables.size >= SEEN_MAX_PAGES) {
    byVariables.delete(byVariables.keys().next().value!);
  }
  byVariables.set(pageKey, new Set(decided.keys()));
  return decided;
}

/**
 * Stores decisions in the `prepr_decisions` cookie (the decided groups first,
 * then what other pages stored) and records the decision time and the pages
 * decided in `prepr_refresh`.
 */
export function writeDecisions(
  request: NextRequest,
  response: NextResponse,
  decided: readonly PreprDecisions[],
  paths: readonly string[],
): void {
  const next = new Map<string, string[]>();
  for (const decisions of decided) {
    for (const [group, variants] of decisions) {
      if (SAFE_ID.test(group) && !next.has(group)) {
        next.set(
          group,
          variants.filter((v) => SAFE_ID.test(v)),
        );
      }
    }
  }
  for (const [group, variants] of parseDecisions(
    request.cookies.get(PREPR_DECISIONS_COOKIE)?.value,
  )) {
    if (!next.has(group)) next.set(group, variants);
  }
  // Read by the switch in the browser, before first paint and for refreshes.
  const options = {
    path: '/',
    sameSite: 'lax' as const,
    httpOnly: false,
    secure: request.nextUrl.protocol === 'https:',
  };
  if (next.size > 0) {
    response.cookies.set(
      PREPR_DECISIONS_COOKIE,
      serializeDecisions(next),
      options,
    );
  }
  if (paths.length > 0) {
    const previous = parseRefresh(
      request.cookies.get(PREPR_REFRESH_COOKIE)?.value,
    );
    response.cookies.set(
      PREPR_REFRESH_COOKIE,
      serializeRefresh({
        at: Date.now(),
        paths: [...paths, ...previous.paths],
      }),
      options,
    );
  }
}

/** Whether something arrived that can move the visitor into another segment. */
export function contextChanged(
  request: NextRequest,
  headers: Headers,
): boolean {
  return (
    headers.get('Prepr-Customer-Id-Created') === 'true' ||
    headers.has('Prepr-Segments') ||
    [...request.nextUrl.searchParams.keys()].some((key) =>
      key.startsWith('utm_'),
    )
  );
}

/**
 * The body of the Next client's `resolveDecisions`, against the core
 * `client` and the per-client `seenGroups` memory.
 */
export async function resolveDecisionsWith<TVariables>(
  client: PreprClient,
  seenGroups: PreprSeenGroups,
  request: NextRequest,
  response: NextResponse,
  document: PreprDocument<unknown, TVariables>,
  variables?: TVariables,
  options?: ResolveDecisionsOptions,
): Promise<void> {
  try {
    if (options?.onlyIf && !(await options.onlyIf())) return;

    const known = seenGroups
      .get(document)
      ?.get(JSON.stringify(variables ?? null));
    // Decided before: the top of this page holds no segment group.
    if (known?.size === 0) return;

    const headers = mergePreprHeaders(forwardedHeaders(request, response));
    const stored = parseDecisions(
      request.cookies.get(PREPR_DECISIONS_COOKIE)?.value,
    );
    const { at } = parseRefresh(
      request.cookies.get(PREPR_REFRESH_COOKIE)?.value,
    );
    const fresh = Date.now() - at < (options?.freshFor ?? DEFAULT_FRESH_FOR_MS);
    // One rule for full loads, navigations and prefetches: a fresh decision
    // that covers the page is what the browser already shows, so asking again
    // could only swap a variant the visitor is looking at.
    if (
      fresh &&
      known &&
      !contextChanged(request, headers) &&
      [...known].every((group) => stored.has(group))
    ) {
      return;
    }

    const decided = await decidePage(
      client,
      seenGroups,
      headers,
      document,
      variables,
      options?.timeoutMs,
    );
    if (!decided || decided.size === 0) return;
    writeDecisions(request, response, [decided], [request.nextUrl.pathname]);
  } catch (error) {
    if (isFrameworkSignal(error)) throw error;
    // The default variant shows; the next request asks again.
  }
}
