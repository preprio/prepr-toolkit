import type { NextRequest, NextResponse } from 'next/server';

import type { DocumentNode } from 'graphql';

import {
  clientSchemas,
  isFrameworkSignal,
  mergePreprHeaders,
  type PreprClient,
  type PreprDocument,
} from '../core/graphql';
import {
  PREPR_REFRESH_COOKIE,
  isFresh,
  parseRefresh,
  serializeRefresh,
} from '../core/refresh';
import { getPreprHeadersFromHeaders } from '../core/server';
import {
  batchDocuments,
  decisionsFrom,
  toDecisionDocument,
  type PreprDecisions,
} from '../core/variants';

/** The cookie `resolveDecisions` writes and the `PreprStack` switch reads. */
export const PREPR_DECISIONS_COOKIE = 'prepr_decisions';

/**
 * Request header from the proxy to the page render: the decisions of the
 * page's top-level lists, so `decide()` asks Prepr only about nested ones.
 * Visitors can send it too; like the decisions cookie, it only picks which
 * variant shows and is no access control.
 */
export const PREPR_DECIDED_HEADER = 'x-prepr-decided';

/**
 * Sets (or, with `null`, removes) the decided header on the request the
 * page renders, through Next's request-header override protocol. Removing it
 * keeps a value the visitor sent from reaching the render.
 */
export function forwardDecided(
  request: NextRequest,
  response: NextResponse,
  decisions: PreprDecisions | null,
): void {
  const existing = response.headers.get('x-middleware-override-headers');
  const names = new Set<string>();
  if (existing) {
    for (const name of existing.split(',')) {
      if (name.trim()) names.add(name.trim());
    }
  } else {
    // Overriding replaces the request's headers: carry the others over.
    request.headers.forEach((value, key) => {
      names.add(key);
      response.headers.set(`x-middleware-request-${key}`, value);
    });
  }
  const forwarded = `x-middleware-request-${PREPR_DECIDED_HEADER}`;
  if (decisions) {
    names.add(PREPR_DECIDED_HEADER);
    response.headers.set(forwarded, serializeDecisions(decisions));
  } else {
    names.delete(PREPR_DECIDED_HEADER);
    response.headers.delete(forwarded);
  }
  response.headers.set('x-middleware-override-headers', [...names].join(','));
}

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

export function serializeDecisions(decisions: PreprDecisions): string {
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
  rememberGroups(seenGroups, document, variables, decided);
  return decided;
}

/** A page to decide: the query it renders and its variables. */
export interface PreprPageQuery {
  document: PreprDocument<unknown, any>;
  variables?: unknown;
}

// Per client and document: the top-level decision document, built once.
const topLevelDocuments = new WeakMap<
  PreprClient,
  Map<unknown, DocumentNode | null>
>();

async function topLevelDocument(
  client: PreprClient,
  document: unknown,
): Promise<DocumentNode | null> {
  let byDocument = topLevelDocuments.get(client);
  if (!byDocument) {
    byDocument = new Map();
    topLevelDocuments.set(client, byDocument);
  }
  if (!byDocument.has(document)) {
    const schema = await clientSchemas.get(client)!();
    byDocument.set(
      document,
      toDecisionDocument(document, schema, undefined, { topLevelOnly: true }),
    );
  }
  return byDocument.get(document)!;
}

/**
 * {@link decidePage} for several pages in one Prepr request: their decision
 * queries are merged into one operation. `undefined` for a page without
 * segment content, or for every page when the request fails.
 */
export async function decidePages(
  client: PreprClient,
  seenGroups: PreprSeenGroups,
  headers: Headers,
  pages: readonly PreprPageQuery[],
  timeoutMs = 1000,
): Promise<(PreprDecisions | undefined)[]> {
  // Cached checks: pages without segment groups are left out of the batch.
  const segmented = await Promise.all(
    pages.map((page) => client.hasSegments(page.document, page.variables)),
  );
  const asked = pages.filter((_, index) => segmented[index]);
  if (asked.length <= 1) {
    return Promise.all(
      pages.map((page, index) =>
        segmented[index]
          ? decidePage(
              client,
              seenGroups,
              headers,
              page.document,
              page.variables,
              timeoutMs,
            )
          : undefined,
      ),
    );
  }

  const documents = await Promise.all(
    asked.map((page) => topLevelDocument(client, page.document)),
  );
  const batch = batchDocuments(
    asked.flatMap((page, index) =>
      documents[index]
        ? [
            {
              document: documents[index],
              variables: (page.variables ?? {}) as Record<string, unknown>,
            },
          ]
        : [],
    ),
  );
  const { data } = await client.query(batch.document, batch.variables, {
    headers,
    init: { signal: AbortSignal.timeout(timeoutMs) },
  });

  let batchIndex = 0;
  let askedIndex = 0;
  return pages.map((page, index) => {
    if (!segmented[index]) return undefined;
    const hasDocument = documents[askedIndex++] !== null;
    if (!hasDocument) return new Map();
    const decided = decisionsFrom(batch.split(data, batchIndex++));
    rememberGroups(seenGroups, page.document, page.variables, decided);
    return decided;
  });
}

function rememberGroups(
  seenGroups: PreprSeenGroups,
  document: unknown,
  variables: unknown,
  decided: PreprDecisions,
): void {
  let byVariables = seenGroups.get(document);
  if (!byVariables) {
    byVariables = new Map();
    seenGroups.set(document, byVariables);
  }
  const pageKey = JSON.stringify(variables ?? null);
  let groups = byVariables.get(pageKey);
  if (!groups) {
    if (byVariables.size >= SEEN_MAX_PAGES) {
      byVariables.delete(byVariables.keys().next().value!);
    }
    groups = new Set();
    byVariables.set(pageKey, groups);
  }
  // Every group any visitor got: Prepr leaves out a group without a default
  // variant for a visitor in none of its segments, so one answer does not
  // list them all.
  for (const group of decided.keys()) groups.add(group);
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
    const at = Date.now();
    response.cookies.set(
      PREPR_REFRESH_COOKIE,
      serializeRefresh([
        ...paths.map((path) => ({ path, at })),
        ...parseRefresh(request.cookies.get(PREPR_REFRESH_COOKIE)?.value),
      ]),
      options,
    );
  }
}

/**
 * The page's path as the browser sees it, including `basePath`: the
 * refresh scheduler matches it against link URLs.
 */
export function pagePath(request: NextRequest): string {
  return request.nextUrl.basePath + request.nextUrl.pathname;
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
  // Until a decision is in hand, the render decides the whole page itself.
  forwardDecided(request, response, null);
  try {
    if (options?.onlyIf && !(await options.onlyIf())) return;

    const known = seenGroups
      .get(document)
      ?.get(JSON.stringify(variables ?? null));
    const path = pagePath(request);

    const headers = mergePreprHeaders(forwardedHeaders(request, response));
    const stored = parseDecisions(
      request.cookies.get(PREPR_DECISIONS_COOKIE)?.value,
    );
    const decidedAt =
      parseRefresh(request.cookies.get(PREPR_REFRESH_COOKIE)?.value).find(
        (entry) => entry.path === path,
      )?.at ?? 0;
    const fresh = isFresh(decidedAt, options?.freshFor ?? DEFAULT_FRESH_FOR_MS);
    // One rule for full loads, navigations and prefetches: a fresh decision
    // that covers the page is what the browser already shows, so asking again
    // could only swap a variant the visitor is looking at.
    if (
      fresh &&
      known &&
      !contextChanged(request, headers) &&
      [...known].every((group) => stored.has(group))
    ) {
      forwardDecided(request, response, stored);
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
    if (!decided) return;
    forwardDecided(request, response, decided);
    if (decided.size === 0) return;
    writeDecisions(request, response, [decided], [path]);
  } catch (error) {
    if (isFrameworkSignal(error)) throw error;
    // The default variant shows; the next request asks again.
  }
}
