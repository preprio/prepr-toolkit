import { NextResponse, type NextRequest } from 'next/server';

import {
  isFrameworkSignal,
  mergePreprHeaders,
  type PreprDocument,
} from '../core/graphql';
import {
  PREPR_REFRESH_COOKIE,
  PREPR_REFRESH_HEADER,
  parseRefresh,
  parseRefreshPaths,
} from '../core/refresh';
import { PreprError } from '../core/server';
import type { PreprFeatures } from '../core/types';
import type { PreprDecisions } from '../core/variants';
import { resolvePreprBucket } from './bucket';
import {
  decidePages,
  forwardDecided,
  forwardedHeaders,
  preprClientInternals,
  resolveDecisionsWith,
  writeDecisions,
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
  /** See `resolveDecisions`. Default 10 000 ms. */
  freshFor?: number;
  /** Give up on Prepr after this many ms; the default variant shows. Default 1000. */
  timeoutMs?: number;
  /**
   * Skip the A/B bucket lookup and segment decisions (page requests and
   * refreshes) when this resolves to false, for example for crawlers: they
   * carry no cookies, so every crawler request is a first visit that waits
   * for Prepr. Those requests get the default variants.
   */
  onlyIf?: (request: NextRequest) => boolean | Promise<boolean>;
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
 * redirect in preview, the A/B bucket, and the segment variants of the groups
 * at the top of each page, so `PreprStack` shows them before first paint.
 *
 * It also answers the background refreshes `PreprPersonalizationSwitch`
 * sends: those return `204` with fresh decision cookies and never render a
 * page. Add your own cookies or headers to the response it returns.
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
  const { client, seenGroups, url } = internals;
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

  async function refresh(
    request: NextRequest,
    response: NextResponse,
    paths: string[],
  ): Promise<NextResponse> {
    const answer = new NextResponse(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
    // The customer id the middleware may just have minted.
    for (const cookie of response.cookies.getAll()) answer.cookies.set(cookie);

    // Only what this visitor's own page asks for: a GET from the same site,
    // for pages the proxy decided for them before. Anything else could make
    // the proxy spend Prepr requests on someone else's behalf.
    const site = request.headers.get('sec-fetch-site');
    if (
      request.method !== 'GET' ||
      (site !== null && site !== 'same-origin') ||
      !(await allowed(request))
    ) {
      return answer;
    }
    const own = new Set(
      parseRefresh(request.cookies.get(PREPR_REFRESH_COOKIE)?.value).map(
        (entry) => entry.path,
      ),
    );
    const basePath = request.nextUrl.basePath;
    const headers = mergePreprHeaders(forwardedHeaders(request, response));
    const targets: [string, PreprProxyPage][] = [];
    for (const path of paths) {
      if (!own.has(path) || !path.startsWith(basePath)) continue;
      const pathname = path.slice(basePath.length) || '/';
      if (!isPagePath(pathname)) continue;
      const target = lookup(new URL(pathname, request.url));
      if (target) targets.push([path, target]);
    }
    let decisions: (PreprDecisions | undefined)[] = [];
    try {
      // Every listed page in one Prepr request.
      decisions = await decidePages(
        client,
        seenGroups,
        headers,
        targets.map(([, target]) => target),
        options.timeoutMs,
      );
    } catch (error) {
      if (isFrameworkSignal(error)) throw error;
    }
    const decided = targets.map(
      ([path], index): [string, PreprDecisions] | undefined =>
        decisions[index]?.size ? [path, decisions[index]] : undefined,
    );
    const found = decided.filter((entry) => entry !== undefined);
    writeDecisions(
      request,
      answer,
      found.map(([, decisions]) => decisions),
      found.map(([path]) => path),
    );
    return answer;
  }

  return async (request) => {
    // A background refresh comes from a page already in draft mode, and
    // decides the pages it lists rather than its own URL.
    if (request.headers.has(PREPR_REFRESH_HEADER)) {
      return refresh(
        request,
        createPreprMiddleware(request, { preview, features: options.features }),
        parseRefreshPaths(request.headers.get(PREPR_REFRESH_HEADER)),
      );
    }

    // Only a GET or HEAD renders a page view. Form posts and server actions
    // get the visitor headers but never wait for a Prepr decision.
    const rendersPage =
      (request.method === 'GET' || request.method === 'HEAD') &&
      isPagePath(request.nextUrl.pathname);
    const target = rendersPage ? lookup(request.nextUrl) : null;

    if (target && preview) {
      const draft = preprDraftRedirect(request, { preview });
      if (draft) return draft;
    }

    const response = createPreprMiddleware(request, {
      preview,
      features: options.features,
    });
    // Only a decision made below reaches the render as decided.
    forwardDecided(request, response, null);

    if (target && (await allowed(request))) {
      await Promise.all([
        resolvePreprBucket(request, response, {
          url,
          preview,
          onlyIf: () =>
            options.client.hasAbTests(target.document, target.variables),
        }),
        resolveDecisionsWith(
          client,
          seenGroups,
          request,
          response,
          target.document,
          target.variables,
          { freshFor: options.freshFor, timeoutMs: options.timeoutMs },
        ),
      ]);
    }
    return response;
  };
}
