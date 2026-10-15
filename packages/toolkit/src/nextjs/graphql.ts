// A namespace import: `cacheTag` only exists from Next 16, and a named import
// would fail to resolve on the older versions the peer range allows.
import * as nextCache from 'next/cache';
import type { NextRequest, NextResponse } from 'next/server';

import {
  createPreprClient as createCoreClient,
  clientSchemas,
  mergePreprHeaders,
  PREPR_ANY_ITEM_TAG,
  PREPR_SCHEMA_TAG,
  preprCacheTags,
  preprModelTagsFor,
  type PreprClientOptions,
  type PreprDecideOptions,
  type PreprDocument,
  type PreprQueryOptions,
  type PreprQueryResult,
} from '../core/graphql';
import type { PreprDecisions } from '../core/variants';
import { documentOf } from '../core/variants/ast';
import {
  preprClientInternals,
  resolveDecisionsWith,
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
  /**
   * Inside `'use cache'` (Cache Components, Next 16+): tags the cache entry
   * with `preprCacheTags(data)` and the client's `cacheTags`, so
   * `createPreprWebhookRoute` revalidates exactly the pages showing a changed
   * item. List queries and lookups that found nothing also get their
   * model's `preprModelTag`, so publishing a new item refreshes them. Pair it
   * with `variants: true`, whose result holds every variant's items.
   *
   * The fetch then skips the Data Cache: a Data Cache entry carries only the
   * client's `cacheTags`, so revalidating an item tag would re-run the
   * `'use cache'` function against the stale response.
   *
   * @throws Error — from Next.js when called outside a `'use cache'` function.
   */
  tagItems?: boolean;
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
   * For rendering variants yourself with `resolveVariants`. `PreprStack`
   * does not need it: `createPreprProxy` decides every page view.
   */
  decide<TVariables>(
    document: PreprDocument<unknown, TVariables>,
    variables?: TVariables,
    options?: PreprDecideOptions,
  ): Promise<PreprDecisions>;
  /**
   * Whether the query's result holds an A/B test. Never reads request
   * headers, so it also works in middleware.
   */
  hasAbTests<TVariables>(
    document: PreprDocument<unknown, TVariables>,
    variables?: TVariables,
  ): Promise<boolean>;
  /**
   * In middleware (`proxy.ts`): asks Prepr, in one request, which segment
   * variant this visitor gets for every personalization group on the page,
   * nested lists included, and stores the answer for this page view in the
   * `prepr_decisions` cookie on `response`. `PreprStack` shows those
   * variants before first paint. `createPreprProxy` calls this for you on
   * every page view; client-side navigations ask through
   * `PreprPersonalizationSwitch` instead.
   *
   * Call it after `createPreprMiddleware`, whose visitor headers (customer id,
   * UTM parameters, IP, HubSpot id) it forwards. Pages without segment groups
   * are skipped after a cached check. Never throws and gives up after
   * `timeoutMs` (default 1000): the default variants show instead.
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
    // server instances, refreshed hourly and by a `schema.changed` webhook.
    schemaInit: {
      next: { tags: [...cacheTags, PREPR_SCHEMA_TAG], revalidate: 3600 },
    } as NextFetchInit,
    ...coreOptions,
  });

  const nextClient: PreprNextClient = {
    async query<TResult, TVariables>(
      document: PreprDocument<TResult, TVariables>,
      variables?: TVariables,
      queryOptions: PreprNextQueryOptions = {},
    ): Promise<PreprQueryResult<TResult>> {
      const { personalize = false, tagItems = false, ...rest } = queryOptions;
      const { next, ...init } = (rest.init ?? {}) as NextFetchInit;
      if (tagItems && typeof nextCache.cacheTag !== 'function') {
        throw new Error('tagItems requires Next.js 16 or later.');
      }

      const options: PreprQueryOptions = {
        ...rest,
        // With tagItems, `next` is dropped too: tags or revalidate alongside
        // `no-store` are a conflict Next.js resolves by ignoring the store.
        // Otherwise tags are attached unconditionally; the core client drops
        // them again whenever the request ends up `no-store` (personalized,
        // per-request headers, or preview).
        init: tagItems
          ? { ...init, cache: 'no-store' }
          : ({
              ...init,
              next: {
                ...(revalidate === undefined ? {} : { revalidate }),
                ...next,
                // Merged, so a per-query tag never drops the client's own,
                // which the publish webhook relies on.
                tags: [...cacheTags, ...(next?.tags ?? [])],
              },
            } as NextFetchInit),
      };
      // getPreprHeaders reads headers(), which makes the route dynamic.
      if (personalize) {
        options.headers = mergePreprHeaders(
          await getPreprHeaders(),
          rest.headers,
        );
      }

      const result = await client.query(document, variables, options);
      if (tagItems) {
        let modelTags: string[];
        try {
          modelTags = preprModelTagsFor(
            documentOf(document),
            result.data,
            await clientSchemas.get(client)!(),
          );
        } catch {
          // Without the schema, a list or empty lookup cannot be told apart;
          // refreshing on every content event beats never refreshing.
          modelTags = [PREPR_ANY_ITEM_TAG];
        }
        // Two calls: Next.js caps each call at 128 tags, which
        // preprCacheTags can fill on its own.
        nextCache.cacheTag(...cacheTags, ...(next?.tags ?? []), ...modelTags);
        nextCache.cacheTag(...preprCacheTags(result.data));
      }
      return result;
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
        request,
        response,
        document,
        variables,
        options,
      ),
  };
  preprClientInternals.set(nextClient, { client });
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
export {
  loadPreprSchema,
  PREPR_ANY_ITEM_TAG,
  preprCacheTags,
  preprModelTag,
} from '../core/graphql';
