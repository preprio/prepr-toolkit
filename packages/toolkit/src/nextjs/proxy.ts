import { NextResponse, type NextRequest } from 'next/server';

import {
  isFrameworkSignal,
  mergePreprHeaders,
  type PreprDocument,
} from '../core/graphql';
import { PREPR_REFRESH_HEADER, parseRefreshPaths } from '../core/refresh';
import { PreprError } from '../core/server';
import type { PreprFeatures } from '../core/types';
import type { PreprDecisions } from '../core/variants';
import { resolvePreprBucket } from './bucket';
import {
  decidePage,
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
    const headers = mergePreprHeaders(forwardedHeaders(request, response));
    const decided = await Promise.all(
      paths.map(async (path): Promise<[string, PreprDecisions] | undefined> => {
        const target = lookup(new URL(path, request.url));
        if (!target) return undefined;
        try {
          const decisions = await decidePage(
            client,
            seenGroups,
            headers,
            target.document,
            target.variables,
            options.timeoutMs,
          );
          return decisions?.size ? [path, decisions] : undefined;
        } catch (error) {
          if (isFrameworkSignal(error)) throw error;
          return undefined;
        }
      }),
    );
    const found = decided.filter((entry) => entry !== undefined);
    const answer = new NextResponse(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
    // The customer id the middleware may just have minted.
    for (const cookie of response.cookies.getAll()) answer.cookies.set(cookie);
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

    const target = isPagePath(request.nextUrl.pathname)
      ? lookup(request.nextUrl)
      : null;

    if (target && preview) {
      const draft = preprDraftRedirect(request, { preview });
      if (draft) return draft;
    }

    const response = createPreprMiddleware(request, {
      preview,
      features: options.features,
    });

    if (target) {
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
