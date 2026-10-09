import {
  createElement,
  Fragment,
  Suspense,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { NextRequest, NextResponse } from 'next/server';

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
import { getPreprHeadersFromHeaders } from '../core/server';
import {
  PREPR_CONTEXT_ALIAS,
  PREPR_DEFAULT_VARIANT,
  preprVariantProps,
  resolveVariants,
  splitStack,
  type PreprDecisions,
} from '../core/variants';
import { applyPreprAbBucket, applyPreprDecisions } from './ab-switch';
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
  /**
   * In middleware (`proxy.ts`): asks Prepr which segment variant this visitor
   * gets for each personalization group on the page, and stores the answer in
   * the `prepr_decisions` cookie on `response`. `PreprStack` with
   * `aboveTheFold` then shows those variants before first paint instead of
   * streaming them in.
   *
   * Call it after `createPreprMiddleware`, whose visitor headers (customer id,
   * UTM parameters, IP, HubSpot id) it forwards. The decision is one uncached
   * Prepr request per page view, so limit it with `onlyIf` to pages whose
   * personalized content is above the fold; pages without segment groups are
   * skipped after a cached check. Never throws and gives up after `timeoutMs`
   * (default 1000): the default variant shows instead.
   */
  resolveDecisions<TVariables>(
    request: NextRequest,
    response: NextResponse,
    document: PreprDocument<unknown, TVariables>,
    variables?: TVariables,
    options?: {
      timeoutMs?: number;
      /** Skip the decision when this resolves to false, e.g. for pages without a personalized hero. */
      onlyIf?: () => boolean | Promise<boolean>;
    },
  ): Promise<void>;
}

/** The cookie `resolveDecisions` writes and the `PreprStack` switch reads. */
export const PREPR_DECISIONS_COOKIE = 'prepr_decisions';

// Groups remembered across pages; prefetches of several pages each add theirs.
const DECISIONS_MAX_GROUPS = 40;
const SAFE_ID = /^[\w-]+$/;

function parseDecisions(raw: string | undefined): Map<string, string[]> {
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

function serializeDecisions(decisions: Map<string, string[]>): string {
  return [...decisions]
    .slice(0, DECISIONS_MAX_GROUPS)
    .map(([group, variants]) => `${group}:${variants.join('|')}`)
    .join('~');
}

/**
 * The visitor headers `createPreprMiddleware` forwards: the overridden request
 * headers on `response` when it set any, the request's own otherwise.
 */
function forwardedHeaders(request: NextRequest, response: NextResponse) {
  const overridden = response.headers.get('x-middleware-override-headers');
  if (!overridden) return getPreprHeadersFromHeaders(request.headers);
  const headers = new Headers();
  for (const name of overridden.split(',')) {
    const value = response.headers.get(`x-middleware-request-${name.trim()}`);
    if (value !== null) headers.set(name.trim(), value);
  }
  return getPreprHeadersFromHeaders(headers);
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

    async resolveDecisions(request, response, document, variables, options) {
      try {
        if (options?.onlyIf && !(await options.onlyIf())) return;
        // A cached check: pages without segment groups cost no request.
        if (!(await client.hasSegments(document, variables))) return;
        const decided = await client.decide(document, variables, {
          headers: mergePreprHeaders(forwardedHeaders(request, response)),
          init: { signal: AbortSignal.timeout(options?.timeoutMs ?? 1000) },
        });
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
        const stored = parseDecisions(
          request.cookies.get(PREPR_DECISIONS_COOKIE)?.value,
        );
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
    },
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
  /**
   * How many blocks, from the top, are on screen before the visitor scrolls.
   * Default `0`.
   *
   * Their segment groups do not stream: every variant is in the cached page,
   * and the variant the proxy decided (`prepr.resolveDecisions`) shows before
   * first paint, so nothing on screen changes while the page loads. Without
   * a decision (no cookie yet, or the proxy's lookup failed) the default
   * variant shows. Costs the HTML of the other variants; images in them still
   * download. An item with a segment group nested inside it keeps streaming.
   */
  aboveTheFold?: number;
}

const AB_ATTRIBUTE = 'data-prepr-ab';
const AB_BUCKETS = ['A', 'B'] as const;

// The variant wrappers never affect layout, and only A shows by default: what
// visitors without JavaScript, crawlers and anonymous visitors get.
const AB_BASE_CSS = `[${AB_ATTRIBUTE}]{display:contents}[${AB_ATTRIBUTE}]:not([${AB_ATTRIBUTE}="A"]){display:none}`;

// Runs while the HTML is parsed, so the visitor's variant is the first one
// painted. A hidden variant never reaches 50% visibility, so the tracking
// pixel never records an impression for it.
const AB_SWITCH_SCRIPT = `(${applyPreprAbBucket.toString()})();(${applyPreprDecisions.toString()})()`;

const GROUP_ATTRIBUTE = 'data-prepr-group';
const VARIANT_ATTRIBUTE = 'data-prepr-variant';
const DEFAULT_ATTRIBUTE = 'data-prepr-default';

// Segment variants of above-the-fold groups: no layout effect, and only the
// default shows until the switch script applies the proxy's decision.
const GROUP_BASE_CSS = `[${GROUP_ATTRIBUTE}]{display:contents}[${GROUP_ATTRIBUTE}]:not([${DEFAULT_ATTRIBUTE}]){display:none}`;

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

/**
 * Every variant of one segment group, each in a wrapper the switch script
 * shows or hides.
 */
function renderAllVariants<T>(
  block: { key: string; items: T[]; index: number },
  render: StackRender<T>,
  options: { bucket?: string; track?: boolean },
): ReactNode {
  const group = block.key.slice('group:'.length);
  const variants = [
    ...new Set(
      block.items.flatMap((item) => {
        const ctx = (item as Record<string, unknown>)[PREPR_CONTEXT_ALIAS] as
          { variant_id?: string } | undefined;
        return ctx?.variant_id ? [ctx.variant_id] : [];
      }),
    ),
  ];
  return variants.map((variant) =>
    createElement(
      'div',
      {
        key: variant,
        [GROUP_ATTRIBUTE]: group,
        [VARIANT_ATTRIBUTE]: variant,
        ...(variant === PREPR_DEFAULT_VARIANT
          ? { [DEFAULT_ATTRIBUTE]: '' }
          : {}),
      },
      renderBuckets(block.items, render, {
        bucket: options.bucket,
        decisions: new Map([[group, [variant]]]),
        abTest: false,
        index: block.index,
        track: options.track,
      }),
    ),
  );
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
  aboveTheFold = 0,
}: PreprStackProps<T>): ReactElement {
  // Blocks that never wait would leave a rejection unobserved.
  decisions.catch(() => undefined);
  const blocks = splitStack(items);
  const decidedInProxy = (block: (typeof blocks)[number]) =>
    block.index < aboveTheFold &&
    block.personalized &&
    !block.abTest &&
    block.key.startsWith('group:');
  const hasDecided = blocks.some(decidedInProxy);
  const needsSwitch =
    (!bucket && blocks.some((block) => block.abTest)) || hasDecided;

  return createElement(
    Fragment,
    null,
    needsSwitch &&
      createElement(
        Fragment,
        { key: 'prepr-ab' },
        createElement('style', {
          nonce,
          dangerouslySetInnerHTML: {
            __html: AB_BASE_CSS + (hasDecided ? GROUP_BASE_CSS : ''),
          },
        }),
        createElement('script', {
          nonce,
          dangerouslySetInnerHTML: { __html: AB_SWITCH_SCRIPT },
        }),
        createElement(PreprAbSwitch),
      ),
    ...blocks.map((block) => {
      if (decidedInProxy(block)) {
        return createElement(
          Fragment,
          { key: block.key },
          renderAllVariants(block, render, { bucket, track: trackVariants }),
        );
      }
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
