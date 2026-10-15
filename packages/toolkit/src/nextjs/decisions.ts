import type { NextRequest, NextResponse } from 'next/server';

import {
  isFrameworkSignal,
  mergePreprHeaders,
  type PreprClient,
  type PreprDocument,
} from '../core/graphql';
import { getPreprHeadersFromHeaders } from '../core/server';
import type { PreprDecisions } from '../core/variants';

/**
 * The cookie `resolveDecisions` writes on a page response: that page view's
 * decisions, the URL they are for and when they were made. The browser
 * deletes it as soon as the visitor views another page, so only a reload of
 * the same view can reuse it.
 */
export const PREPR_DECISIONS_COOKIE = 'prepr_decisions';

/**
 * Request header of the decision requests `PreprPersonalizationSwitch` sends
 * for a client-side navigation. `createPreprProxy` answers them with the
 * page's decisions as text instead of rendering the page.
 */
export const PREPR_DECIDE_HEADER = 'Prepr-Decide';

/** A decision that shows the default variant of every group. */
export const DEFAULT_DECISION = '*';

/**
 * How long a reload of the same view, with no other page view in between,
 * reuses its decision instead of asking Prepr again. Prepr needs a few
 * seconds to process a visitor's activity, so asking again sooner would
 * mostly get the same answer.
 */
const REUSE_MS = 10_000;

// More groups than a page shows; the cap keeps the cookie small.
const DECISIONS_MAX_GROUPS = 40;
const SAFE_ID = /^[\w-]+$/;

/**
 * `group:variant|variant~group:variant`. Ids outside letters, digits, `_`
 * and `-` are dropped: the browser builds selectors from them.
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

export interface ResolveDecisionsOptions {
  /** Give up after this many ms; the default variants show. Default 1000. */
  timeoutMs?: number;
  /** Skip the Prepr request when this resolves to false: the default variants show. */
  onlyIf?: () => boolean | Promise<boolean>;
}

/**
 * The decisions for one page view, serialized: the visitor's variant of
 * every A/B test and segment personalization group on the page, nested lists
 * included, in one Prepr request. Empty when the page has none;
 * {@link DEFAULT_DECISION} when Prepr cannot answer in time.
 */
export async function decideView<TVariables>(
  client: PreprClient,
  headers: Headers,
  document: PreprDocument<unknown, TVariables>,
  variables: TVariables | undefined,
  timeoutMs = 1000,
): Promise<string> {
  try {
    const decided = await client.decide(document, variables, {
      headers,
      init: { signal: AbortSignal.timeout(timeoutMs) },
    });
    return serializeDecisions(decided);
  } catch (error) {
    if (isFrameworkSignal(error)) throw error;
    return DEFAULT_DECISION;
  }
}

/**
 * The page view as the browser sees it: `basePath`, path and query. The
 * browser applies a decision only to the view it was made for.
 */
export function viewKey(request: NextRequest): string {
  const url = request.nextUrl;
  return url.basePath + url.pathname + url.search;
}

/** Whether something arrived that can move the visitor into another segment. */
function contextChanged(request: NextRequest, headers: Headers): boolean {
  return (
    headers.get('Prepr-Customer-Id-Created') === 'true' ||
    headers.has('Prepr-Segments') ||
    [...request.nextUrl.searchParams.keys()].some((key) =>
      key.startsWith('utm_'),
    )
  );
}

/**
 * Whether the decision stored for this exact view is recent, with nothing
 * that can change a segment arrived since.
 */
function reusable(request: NextRequest, headers: Headers): boolean {
  const raw = request.cookies.get(PREPR_DECISIONS_COOKIE)?.value ?? '';
  const bar = raw.indexOf('|');
  const at = raw.lastIndexOf('@');
  if (bar < 0 || at < bar) return false;
  const age = Date.now() - Number(raw.slice(0, bar));
  return (
    age >= 0 &&
    age < REUSE_MS &&
    raw.slice(bar + 1, at) === viewKey(request) &&
    !contextChanged(request, headers)
  );
}

/**
 * The body of the Next client's `resolveDecisions`: decides the page view
 * and stores the answer on `response`. A reload of the same view within
 * {@link REUSE_MS}, with no other page view in between, keeps the stored
 * decision.
 */
export async function resolveDecisionsWith<TVariables>(
  client: PreprClient,
  request: NextRequest,
  response: NextResponse,
  document: PreprDocument<unknown, TVariables>,
  variables?: TVariables,
  options?: ResolveDecisionsOptions,
): Promise<void> {
  const headers = mergePreprHeaders(forwardedHeaders(request, response));
  // The browser still has it: nothing to write.
  if (reusable(request, headers)) return;
  let decision = DEFAULT_DECISION;
  try {
    if (!options?.onlyIf || (await options.onlyIf())) {
      decision = await decideView(
        client,
        headers,
        document,
        variables,
        options?.timeoutMs,
      );
    }
  } catch (error) {
    if (isFrameworkSignal(error)) throw error;
  }
  response.cookies.set(
    PREPR_DECISIONS_COOKIE,
    `${Date.now()}|${viewKey(request)}@${decision}`,
    {
      path: '/',
      sameSite: 'lax',
      // Read by the inline script before first paint.
      httpOnly: false,
      secure: request.nextUrl.protocol === 'https:',
    },
  );
}
