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
  type PreprDecideOptions,
  type PreprDocument,
  type PreprQueryOptions,
  type PreprQueryResult,
} from '../core/graphql';
import {
  preprVariantProps,
  resolveVariants,
  splitStack,
  type PreprDecisions,
} from '../core/variants';
import { applyPreprAbBucket } from './ab-switch';
import { PreprAbSwitch, PreprVariantTracking } from './components';
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
  };
}

export interface PreprStackProps<T> {
  /** A stack (e.g. `page.content`) from a query run with `variants: true`. */
  items: readonly T[];
  /**
   * The visitor's decisions, as a promise from `decide()`. Only the parts
   * that vary per segment wait for it; a failed decision falls back to the
   * default variants instead of failing the page.
   */
  decisions: Promise<PreprDecisions>;
  /**
   * Renders resolved stack items, e.g. your section switch. `index` is the
   * position of the block's first item in the whole stack, for anything that
   * depends on page position, such as which section owns the h1 or the
   * priority image.
   */
  render: (items: T[], position: { index: number }) => ReactNode;
  /**
   * The visitor's A/B bucket, when the route already knows it (for example
   * from a URL segment). Leave it out to render both variants of each A/B
   * test and pick the visitor's in the browser before first paint.
   */
  bucket?: string;
  /** Nonce for the inline A/B switch script, under a strict CSP. */
  nonce?: string;
  /**
   * Tag each personalization and A/B variant for Prepr's tracking pixel, so
   * it counts impressions (and clicks on `data-prepr-variant-event` elements
   * inside) without `data-prepr-variant-key` in your components. Default
   * `false`.
   *
   * Each item's key goes on the element `render` returns for it, in order,
   * once the page has hydrated. Each variant gets a wrapper with
   * `display: contents`: it takes no box, but CSS child combinators (`>`) and
   * `:first-child` from the stack's parent no longer reach the sections. Lists
   * nested inside an item are not tagged; use `preprVariantProps` there.
   */
  trackVariants?: boolean;
}

const AB_ATTRIBUTE = 'data-prepr-ab';
const AB_BUCKETS = ['A', 'B'] as const;

// The variant wrappers never affect layout, and only A shows by default: what
// visitors without JavaScript, crawlers and anonymous visitors get.
const AB_BASE_CSS = `[${AB_ATTRIBUTE}]{display:contents}[${AB_ATTRIBUTE}]:not([${AB_ATTRIBUTE}="A"]){display:none}`;

// Runs while the HTML is parsed, so the visitor's variant is the first one
// painted. A hidden variant never reaches 50% visibility, so the tracking
// pixel never records an impression for it.
const AB_SWITCH_SCRIPT = `(${applyPreprAbBucket.toString()})()`;

/**
 * Renders items for every A/B bucket the visitor might have, each in a
 * wrapper the switch script shows or hides; or for the known bucket only.
 */
type StackRender<T> = PreprStackProps<T>['render'];

function variantKeysOf(items: unknown[]): string[] {
  return items.flatMap((item) => {
    const key = preprVariantProps(item)['data-prepr-variant-key'];
    return key ? [key] : [];
  });
}

function renderBuckets<T>(
  items: T[],
  render: StackRender<T>,
  options: {
    bucket?: string;
    decisions?: PreprDecisions;
    abTest: boolean;
    index: number;
    track?: boolean;
  },
): ReactNode {
  const { bucket, decisions, abTest, index, track } = options;
  const renderVariant = (variant: string | undefined, key?: string) => {
    const resolved = resolveVariants(items, { decisions, bucket: variant });
    const content = render(resolved, { index });
    const variantKeys = track ? variantKeysOf(resolved) : [];
    const ab = abTest && !bucket ? variant : undefined;
    if (variantKeys.length > 0) {
      return createElement(
        PreprVariantTracking,
        { key, variantKeys, ab },
        content,
      );
    }
    if (ab) return createElement('div', { key, [AB_ATTRIBUTE]: ab }, content);
    return content;
  };
  if (!abTest || bucket) return renderVariant(bucket);
  return AB_BUCKETS.map((variant) => renderVariant(variant, variant));
}

async function PersonalizedBlock<T>({
  items,
  decisions,
  bucket,
  abTest,
  index,
  render,
  track,
}: {
  items: T[];
  decisions: Promise<PreprDecisions>;
  bucket?: string;
  abTest: boolean;
  index: number;
  render: StackRender<T>;
  track?: boolean;
}): Promise<ReactNode> {
  const decided = await decisions.catch((error: unknown) => {
    // Next.js control flow must reach Next; anything else degrades to the
    // default variant rather than an error page.
    if (isFrameworkSignal(error)) throw error;
    return undefined;
  });
  return renderBuckets(items, render, {
    bucket,
    decisions: decided,
    abTest,
    index,
    track,
  });
}

/**
 * Renders a personalized stack with Cache Components / Partial Prerendering.
 *
 * - Items that never vary render in the static shell.
 * - A/B tests render in the static shell too, once per bucket; a tiny inline
 *   script shows the visitor's bucket (from `resolvePreprBucket`'s cookie)
 *   before first paint, so no variant streams or swaps in. `A` is the
 *   default. Pass `bucket` instead when the route already knows it.
 * - Each segment-personalized group, and each item with segment content
 *   nested inside it, gets its own `<Suspense>` boundary: the default
 *   variant (possibly empty) is the fallback, and this visitor's variant
 *   streams in once `decisions` resolves. Because `items` holds every
 *   variant, a group with no default variant still gets its place.
 *
 * @example
 * const data = await getPage(slug); // 'use cache' + query(..., { variants: true })
 * <PreprStack
 *   items={data.Page.content}
 *   decisions={prepr.decide(PageDocument, { slug }, { from: data })}
 *   render={(items, { index }) => <Sections sections={items} offset={index} />}
 * />
 */
export function PreprStack<T>({
  items,
  decisions,
  render,
  bucket,
  nonce,
  trackVariants = false,
}: PreprStackProps<T>): ReactElement {
  // Blocks that never wait would leave a rejection unobserved.
  decisions.catch(() => undefined);
  const blocks = splitStack(items);
  const needsSwitch = !bucket && blocks.some((block) => block.abTest);

  return createElement(
    Fragment,
    null,
    needsSwitch &&
      createElement(
        Fragment,
        { key: 'prepr-ab' },
        createElement('style', {
          nonce,
          dangerouslySetInnerHTML: { __html: AB_BASE_CSS },
        }),
        createElement('script', {
          nonce,
          dangerouslySetInnerHTML: { __html: AB_SWITCH_SCRIPT },
        }),
        createElement(PreprAbSwitch),
      ),
    ...blocks.map((block) => {
      // A fallback is only on screen until the visitor's variant arrives, so
      // it is tagged only where it is final: blocks that never stream.
      const fallback = renderBuckets(block.items, render, {
        bucket,
        abTest: block.abTest,
        index: block.index,
        track: trackVariants && !block.personalized,
      });
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
          abTest: block.abTest,
          index: block.index,
          render,
          track: trackVariants,
        }),
      );
    }),
  );
}

export { isPersonalizedResponse } from '../core/personalization';
export { PreprError } from '../core/server';
export {
  PREPR_DEFAULT_VARIANT,
  preprVariantProps,
  resolveVariants,
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
