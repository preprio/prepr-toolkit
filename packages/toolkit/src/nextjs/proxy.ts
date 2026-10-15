import { NextResponse, type NextRequest } from 'next/server';

import { mergePreprHeaders, type PreprDocument } from '../core/graphql';
import { PreprError } from '../core/server';
import type { PreprFeatures } from '../core/types';
import { resolvePreprBucket } from './bucket';
import {
  DEFAULT_DECISION,
  PREPR_DECIDE_HEADER,
  decideView,
  forwardedHeaders,
  preprClientInternals,
  resolveDecisionsWith,
} from './decisions';
import { preprDraftRedirect } from './draft';
import type { PreprNextClient } from './graphql';
import { createPreprMiddleware } from './middleware';

/** The query a page renders, as `createPreprProxy`'s `page` returns it. */
export interface PreprProxyPage<TVariables = unknown> {
  document: PreprDocument<unknown, TVariables>;
  variables?: TVariables;
}

export interface PreprProxyOptions {
  /** A client made with this package's Next `createPreprClient`. */
  client: PreprNextClient;
  /**
   * The query the page at `url` renders with `variants: true`, or `null` for
   * a URL that is not a CMS page. Sites that route every page through one
   * query need one line:
   * `(url) => ({ document: PageDocument, variables: { slug: url.pathname } })`.
   */
  page: (url: URL) => PreprProxyPage<any> | null | undefined;
  /** Whether this deployment serves preview content (draft mode, toolbar overrides). */
  preview?: boolean;
  /** Features disabled app-wide, as for `createPreprMiddleware`. */
  features?: PreprFeatures;
  /** Give up on Prepr after this many ms; the default variants show. Default 1000. */
  timeoutMs?: number;
  /**
   * Skip the A/B bucket lookup and segment decisions (page views and
   * client-side navigations) when this resolves to false, for example for
   * crawlers, so they never wait for Prepr. Those requests get the default
   * variants.
   */
  onlyIf?: (request: NextRequest) => boolean | Promise<boolean>;
}

// Prefetches and client-side navigations fetch the page's RSC payload. Next.js
// strips its own `RSC` and `Next-Router-*` headers before the proxy runs, but
// keeps `Next-Url`, and the browser marks a fetch as `Sec-Fetch-Dest: empty`.
function isRouterFetch(request: NextRequest): boolean {
  return (
    request.headers.has('rsc') ||
    request.headers.has('next-url') ||
    request.headers.get('sec-fetch-dest') === 'empty'
  );
}

// API routes, Next.js internals and files never render a CMS page.
function isPagePath(pathname: string): boolean {
  return (
    !pathname.startsWith('/_next/') &&
    !pathname.startsWith('/api/') &&
    !/\.[^/]*$/.test(pathname)
  );
}

/**
 * Everything Prepr needs in the proxy (`proxy.ts`), in one call: the visitor's
 * Prepr headers and customer id (`createPreprMiddleware`), the draft-mode
 * redirect in preview, the A/B bucket, and, at every page view, the segment
 * variant of every personalization group on the page, asked from Prepr in
 * one request, so `PreprStack` shows them before first paint.
 *
 * Prefetches and client-side navigations (requests with an `RSC` header) are
 * never decided: their answer would be reused later. Instead it answers the
 * decision requests `PreprPersonalizationSwitch` sends when a visitor clicks
 * a link, with the target page's decisions as text and no page. Add your own
 * cookies or headers to the response it returns.
 *
 * @example
 * const handlePrepr = createPreprProxy({
 *   client: prepr,
 *   page: (url) => ({ document: PageDocument, variables: { slug: url.pathname } }),
 *   preview: process.env.PREPR_ENV === 'preview',
 * });
 * export function proxy(request: NextRequest) {
 *   return handlePrepr(request);
 * }
 *
 * @throws PreprError `CONTEXT_ERROR` when `client` was not made by the Next
 *   `createPreprClient`.
 */
export function createPreprProxy(
  options: PreprProxyOptions,
): (request: NextRequest) => Promise<NextResponse> {
  const internals = preprClientInternals.get(options.client);
  if (!internals) {
    throw new PreprError(
      'createPreprProxy needs a client made by createPreprClient from @preprio/toolkit/nextjs/graphql',
      'CONTEXT_ERROR',
      'createPreprProxy',
    );
  }
  const { client, url } = internals;
  const preview = options.preview ?? false;

  const allowed = async (request: NextRequest): Promise<boolean> => {
    if (!options.onlyIf) return true;
    try {
      return await options.onlyIf(request);
    } catch {
      return false;
    }
  };

  const lookup = (target: URL): PreprProxyPage | null => {
    try {
      return options.page(target) ?? null;
    } catch {
      return null;
    }
  };

  // Answers a client-side navigation's decision request. Always answers:
  // the browser holds the navigation until it does.
  async function answerDecision(
    request: NextRequest,
    response: NextResponse,
    target: PreprProxyPage | null,
  ): Promise<NextResponse> {
    let decision: string | null = DEFAULT_DECISION;
    // Only the visitor's own page asks: a GET from the same site. Anything
    // else could make the proxy spend Prepr requests on someone else's behalf.
    const site = request.headers.get('sec-fetch-site');
    if (
      target &&
      request.method === 'GET' &&
      (site === null || site === 'same-origin') &&
      (await allowed(request))
    ) {
      decision = await decideView(
        client,
        mergePreprHeaders(forwardedHeaders(request, response)),
        target.document,
        target.variables,
        options.timeoutMs,
      );
    }
    const answer = new NextResponse(decision ?? DEFAULT_DECISION, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
    // The customer id the middleware may just have minted.
    for (const cookie of response.cookies.getAll()) answer.cookies.set(cookie);
    return answer;
  }

  return async (request) => {
    // Only a GET or HEAD renders a page view. Form posts and server actions
    // get the visitor headers but never wait for a Prepr decision.
    const rendersPage =
      (request.method === 'GET' || request.method === 'HEAD') &&
      isPagePath(request.nextUrl.pathname);
    const target = rendersPage ? lookup(request.nextUrl) : null;
    const decisionRequest = request.headers.has(PREPR_DECIDE_HEADER);

    if (target && preview && !decisionRequest) {
      const draft = preprDraftRedirect(request, { preview });
      if (draft) return draft;
    }

    const response = createPreprMiddleware(request, {
      preview,
      features: options.features,
    });
    if (decisionRequest) return answerDecision(request, response, target);

    if (target) {
      const ok = await allowed(request);
      await Promise.all([
        ok &&
          resolvePreprBucket(request, response, {
            url,
            preview,
            onlyIf: () =>
              options.client.hasAbTests(target.document, target.variables),
          }),
        // Prefetches and client-side navigations: the browser asks its own
        // decision when the visitor clicks.
        !isRouterFetch(request) &&
          resolveDecisionsWith(
            client,
            request,
            response,
            target.document,
            target.variables,
            { timeoutMs: options.timeoutMs, onlyIf: () => ok },
          ),
      ]);
    }
    return response;
  };
}
