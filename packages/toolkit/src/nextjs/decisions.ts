import type { NextRequest, NextResponse } from 'next/server';

import {
  isFrameworkSignal,
  mergePreprHeaders,
  type PreprClient,
  type PreprDocument,
} from '../core/graphql';
import { getPreprHeadersFromHeaders } from '../core/server';

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
  options?: {
    timeoutMs?: number;
    reuse?: boolean;
    onlyIf?: () => boolean | Promise<boolean>;
  },
): Promise<void> {
  try {
    if (options?.onlyIf && !(await options.onlyIf())) return;
    // A cached check: pages without segment groups cost no request.
    if (!(await client.hasSegments(document, variables))) return;

    const headers = mergePreprHeaders(forwardedHeaders(request, response));
    const stored = parseDecisions(
      request.cookies.get(PREPR_DECISIONS_COOKIE)?.value,
    );
    const pageKey = `${JSON.stringify(variables ?? null)}`;
    let byVariables = seenGroups.get(document);
    if (!byVariables) {
      byVariables = new Map();
      seenGroups.set(document, byVariables);
    }
    const known = byVariables.get(pageKey);
    const isNewVisitor = headers.get('Prepr-Customer-Id-Created') === 'true';

    // Within a visit the segments rarely change: reuse the stored decision
    // unless something arrived that can change it (UTM parameters, a first
    // visit, a segment forced in preview).
    const contextChanged =
      isNewVisitor ||
      headers.has('Prepr-Segments') ||
      [...request.nextUrl.searchParams.keys()].some((key) =>
        key.startsWith('utm_'),
      );
    if (
      options?.reuse !== false &&
      !contextChanged &&
      known &&
      [...known].every((group) => stored.has(group))
    ) {
      return;
    }

    // Only the top-level lists: `aboveTheFold` renders those groups, and
    // Prepr answers this far faster than for every nested list.
    const decided = await client.decide(document, variables, {
      topLevelOnly: true,
      headers,
      init: { signal: AbortSignal.timeout(options?.timeoutMs ?? 1000) },
    });

    if (!known && byVariables.size >= SEEN_MAX_PAGES) {
      byVariables.delete(byVariables.keys().next().value!);
    }
    const groups = known ?? new Set<string>();
    for (const group of decided.keys()) groups.add(group);
    byVariables.set(pageKey, groups);

    // This page's groups first, then what other pages stored.
    const next = new Map<string, string[]>();
    for (const [group, variants] of decided) {
      if (SAFE_ID.test(group)) {
        next.set(
          group,
          variants.filter((v) => SAFE_ID.test(v)),
        );
      }
    }
    for (const [group, variants] of stored) {
      if (!next.has(group)) next.set(group, variants);
    }
    if (next.size === 0) return;
    response.cookies.set(PREPR_DECISIONS_COOKIE, serializeDecisions(next), {
      path: '/',
      sameSite: 'lax',
      // Read by the inline switch script before first paint.
      httpOnly: false,
    });
  } catch (error) {
    if (isFrameworkSignal(error)) throw error;
    // The default variant shows; the next request asks again.
  }
}
