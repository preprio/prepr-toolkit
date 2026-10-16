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
  timeoutMs = 3000,
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
