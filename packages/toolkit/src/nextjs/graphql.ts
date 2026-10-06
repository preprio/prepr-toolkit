import {
  createElement,
  Fragment,
  Suspense,
  type ReactElement,
  type ReactNode,
} from 'react';

import {
  createPreprClient as createCoreClient,
  isFrameworkSignal,
  mergePreprHeaders,
  type PreprClientOptions,
  type PreprDocument,
  type PreprQueryOptions,
  type PreprQueryResult,
} from '../core/graphql';
import {
  resolveVariants,
  splitStack,
  type PreprDecisions,
} from '../core/variants';
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
    options?: PreprQueryOptions,
  ): Promise<PreprDecisions>;
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
  const client = createCoreClient(coreOptions);

  return {
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
      queryOptions: PreprQueryOptions = {},
    ): Promise<PreprDecisions> {
      return client.decide(document, variables, {
        ...queryOptions,
        headers: mergePreprHeaders(
          await getPreprHeaders(),
          queryOptions.headers,
        ),
      });
    },
  };
}

export interface PreprStackProps<T> {
  /** A stack (e.g. `page.content`) from a query run with `variants: true`. */
  items: readonly T[];
  /**
   * The visitor's decisions, as a promise from `decide()`. Only the parts
   * that vary per visitor wait for it; a failed decision falls back to the
   * default variants instead of failing the page.
   */
  decisions: Promise<PreprDecisions>;
  /** The visitor's A/B bucket; see `resolvePreprBucket`. Default `A`. */
  bucket?: string;
  /** Renders resolved stack items, e.g. your section switch. */
  render: (items: T[]) => ReactNode;
}

async function PersonalizedBlock<T>({
  items,
  decisions,
  bucket,
  render,
}: Omit<PreprStackProps<T>, 'items'> & { items: T[] }): Promise<ReactNode> {
  const decided = await decisions.catch((error: unknown) => {
    // Next.js control flow must reach Next; anything else degrades to the
    // default variant rather than an error page.
    if (isFrameworkSignal(error)) throw error;
    return undefined;
  });
  return render(resolveVariants(items, { decisions: decided, bucket }));
}

/**
 * Renders a personalized stack with Cache Components / Partial Prerendering.
 *
 * Parts that never vary, and A/B tests (resolved from `bucket`), render in
 * the static shell. Each segment-personalized group, and each item with
 * personalized content nested inside it, gets its own `<Suspense>` boundary:
 * the default variant (possibly empty) is the fallback, and this visitor's
 * variant streams in once `decisions` resolves. Because `items` holds every
 * variant, a group with no default variant still gets its place.
 *
 * @example
 * const { data } = await getPage(slug); // 'use cache' + query(..., { variants: true })
 * <PreprStack
 *   items={data.Page.content}
 *   decisions={prepr.decide(PageDocument, { slug })}
 *   bucket={bucket}
 *   render={(items) => <Sections sections={items} />}
 * />
 */
export function PreprStack<T>({
  items,
  decisions,
  bucket,
  render,
}: PreprStackProps<T>): ReactElement {
  // Blocks that never wait would leave a rejection unobserved.
  decisions.catch(() => undefined);
  return createElement(
    Fragment,
    null,
    ...splitStack(items).map((block) => {
      const fallback = render(resolveVariants(block.items, { bucket }));
      if (!block.personalized) {
        return createElement(Fragment, { key: block.key }, fallback);
      }
      return createElement(
        Suspense,
        { key: block.key, fallback },
        createElement(PersonalizedBlock<T>, {
          items: block.items,
          decisions,
          bucket,
          render,
        }),
      );
    }),
  );
}

export { isPersonalizedResponse } from '../core/personalization';
export { PreprError } from '../core/server';
export {
  PREPR_DEFAULT_VARIANT,
  resolveVariants,
  splitStack,
  type PreprDecisions,
  type PreprStackBlock,
  type ResolveVariantsOptions,
} from '../core/variants';
export type {
  PreprDocument,
  PreprQueryResult,
  PreprStegaMode,
} from '../core/graphql';
