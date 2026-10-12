import type { NextRequest, NextResponse } from 'next/server';

import {
  createPreprClient as createCoreClient,
  mergePreprHeaders,
  type PreprClientOptions,
  type PreprDecideOptions,
  type PreprDocument,
  type PreprQueryOptions,
  type PreprQueryResult,
} from '../core/graphql';
import type { PreprDecisions } from '../core/variants';
import {
  preprClientInternals,
  resolveDecisionsWith,
  type PreprSeenGroups,
  type ResolveDecisionsOptions,
} from './decisions';
import { getPreprHeaders } from './server';

export interface PreprNextClientOptions extends PreprClientOptions {
  /** Tags set on every cacheable fetch, for `revalidateTag`. Default `['prepr']`. */
  cacheTags?: string[];
  /**
   * `next.revalidate` for cacheable fetches. Unset leaves the installed Next
   * version's default in place. `false` caches until `revalidateTag` runs,
   * which suits a publish webhook calling `revalidateTag('prepr')`.
   */
  revalidate?: number | false;
}

export interface PreprNextQueryOptions extends PreprQueryOptions {
  /**
   * Forward the visitor's Prepr headers (read through `next/headers`) and
   * skip the Data Cache. The route renders per request.
   */
  personalize?: boolean;
}

export interface PreprNextClient {
  /**
   * Run a GraphQL query against Prepr.
   *
   * Without `personalize`, the fetch is tagged for `revalidateTag` and may be
   * served from the Data Cache. Do not swallow errors thrown here without
   * `unstable_rethrow`: Next.js signals dynamic rendering by throwing from
   * inside fetch, and the client passes those signals through untouched.
   *
   * @throws PreprError — `INVALID_DOCUMENT`, `FETCH_ERROR`, `HTTP_ERROR`,
   *   `INVALID_RESPONSE` or `GRAPHQL_ERROR`.
   */
  query<TResult, TVariables>(
    document: PreprDocument<TResult, TVariables>,
    variables?: TVariables,
    options?: PreprNextQueryOptions,
  ): Promise<PreprQueryResult<TResult>>;
  /**
   * Which variant of each personalization and A/B group this visitor gets,
   * for the query you render with `variants: true`. Forwards the visitor's
   * Prepr headers (read through `next/headers`); never cached. Prepr decides
   * from everything the middleware forwards: customer profile, UTM
   * parameters, visitor IP, HubSpot id.
   *
   * Start it without awaiting and hand the promise to `PreprStack`: only the
   * parts that vary per visitor wait for it.
   */
  decide<TVariables>(
    document: PreprDocument<unknown, TVariables>,
    variables?: TVariables,
    options?: PreprDecideOptions,
  ): Promise<PreprDecisions>;
  /**
   * Whether the query's result holds an A/B test: see `resolvePreprBucket`'s
   * `onlyIf`. Never reads request headers, so it also works in middleware.
   */
  hasAbTests<TVariables>(
    document: PreprDocument<unknown, TVariables>,
    variables?: TVariables,
  ): Promise<boolean>;
  /**
   * In middleware (`proxy.ts`): asks Prepr which segment variant this visitor
   * gets for each personalization group at the top of the page, and stores
   * the answer in the `prepr_decisions` cookie on `response`. `PreprStack`
   * then shows those variants before first paint instead of streaming them
   * in. `createPreprProxy` calls this for you.
   *
   * Call it after `createPreprMiddleware`, whose visitor headers (customer id,
   * UTM parameters, IP, HubSpot id) it forwards. A stored decision that
   * covers the page is kept for `freshFor` (default 10 s); a first visit, UTM
   * parameters and a segment forced in preview always ask again. Pages
   * without segment groups at the top are skipped after a cached check.
   * Never throws and gives up after `timeoutMs` (default 1000): the default
   * variant shows instead.
   */
  resolveDecisions<TVariables>(
    request: NextRequest,
    response: NextResponse,
    document: PreprDocument<unknown, TVariables>,
    variables?: TVariables,
    options?: ResolveDecisionsOptions,
  ): Promise<void>;
}

type NextFetchInit = RequestInit & {
  next?: { tags?: string[]; revalidate?: number | false };
};

/**
 * Prepr GraphQL client for Next.js (App Router, server only).
 *
 * Headerless queries go through the Data Cache with `cacheTags`; queries with
 * `personalize: true` forward the visitor's Prepr headers and are never
 * cached.
 *
 * With Cache Components, run headerless queries inside `'use cache'` (the
 * client's fetch tags carry over to the entry, so `revalidateTag` reaches it)
 * and `personalize: true` queries inside `<Suspense>`: `personalize` reads
 * request headers, which `'use cache'` forbids. A headerless query outside
 * both only prerenders when `revalidate` is set. `preview: true` works inside `'use cache'`, but the entry is still
 * cached unless draft mode is enabled, which makes Next skip cached entries.
 *
 * Requires the `graphql` package, which graphql-codegen already installs.
 */
export function createPreprClient(
  options: PreprNextClientOptions,
): PreprNextClient {
  const { cacheTags = ['prepr'], revalidate, ...coreOptions } = options;
  const client = createCoreClient({
    // The schema introspection goes through the Data Cache: shared across
    // server instances, refreshed hourly and by revalidateTag on publish.
    schemaInit: {
      next: { tags: cacheTags, revalidate: 3600 },
    } as NextFetchInit,
    ...coreOptions,
  });

  // Per page: the groups decisions have named, so a later request can tell
  // whether the stored cookie already covers the page.
  const seenGroups: PreprSeenGroups = new Map();

  const nextClient: PreprNextClient = {
    async query<TResult, TVariables>(
      document: PreprDocument<TResult, TVariables>,
      variables?: TVariables,
      queryOptions: PreprNextQueryOptions = {},
    ): Promise<PreprQueryResult<TResult>> {
      const { personalize = false, ...rest } = queryOptions;

      // Tags are attached unconditionally; the core client drops them again
      // whenever the request ends up `no-store` (personalized, per-request
      // headers, or preview).
      const init = rest.init as NextFetchInit | undefined;
      const tagged: PreprQueryOptions = {
        ...rest,
        init: {
          ...init,
          next: {
            tags: cacheTags,
            ...(revalidate === undefined ? {} : { revalidate }),
            ...init?.next,
          },
        } as NextFetchInit,
      };

      if (!personalize) return client.query(document, variables, tagged);

      // getPreprHeaders reads headers(), which makes the route dynamic.
      return client.query(document, variables, {
        ...tagged,
        headers: mergePreprHeaders(await getPreprHeaders(), rest.headers),
      });
    },

    async decide<TVariables>(
      document: PreprDocument<unknown, TVariables>,
      variables?: TVariables,
      queryOptions: PreprDecideOptions = {},
    ): Promise<PreprDecisions> {
      return client.decide(document, variables, {
        ...queryOptions,
        headers: mergePreprHeaders(
          await getPreprHeaders(),
          queryOptions.headers,
        ),
      });
    },

    hasAbTests: (document, variables) => client.hasAbTests(document, variables),

    resolveDecisions: (request, response, document, variables, options) =>
      resolveDecisionsWith(
        client,
        seenGroups,
        request,
        response,
        document,
        variables,
        options,
      ),
  };
  preprClientInternals.set(nextClient, {
    client,
    seenGroups,
    url: coreOptions.url,
  });
  return nextClient;
}

export {
  PREPR_DECISIONS_COOKIE,
  type ResolveDecisionsOptions,
} from './decisions';
export {
  createPreprProxy,
  type PreprProxyOptions,
  type PreprProxyPage,
} from './proxy';
export { PreprStack, type PreprStackProps } from './stack';
export { isPersonalizedResponse } from '../core/personalization';
export { PreprError } from '../core/server';
export {
  PREPR_DEFAULT_VARIANT,
  preprVariantProps,
  decisionsFrom,
  resolveVariants,
  toDecisionQuery,
  toVariantsQuery,
  type PreprSchema,
  splitStack,
  type PreprDecisions,
  type PreprStackBlock,
  type PreprVariantProps,
  type ResolveVariantsOptions,
} from '../core/variants';
export type {
  PreprDecideOptions,
  PreprDocument,
  PreprQueryResult,
  PreprStegaMode,
} from '../core/graphql';
export { loadPreprSchema } from '../core/graphql';
