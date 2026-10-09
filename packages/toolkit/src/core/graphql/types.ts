import type { DocumentNode } from 'graphql';

import type { PreprDecisions } from '../variants';
import type { PreprHeaders } from '../types';

/**
 * A GraphQL document accepted by `query`: a plain string, graphql-codegen's
 * `TypedDocumentString` (`documentMode: 'string'`), or any `DocumentNode`,
 * including codegen's default `TypedDocumentNode` output.
 *
 * The phantom `__apiType` field is how codegen attaches result and variable
 * types; matching it structurally keeps `@graphql-typed-document-node/core`
 * out of this package.
 */
export type PreprDocument<TResult, TVariables> =
  | string
  | ({ __apiType?: (variables: TVariables) => TResult } &
      // `String`, not `string`: codegen's TypedDocumentString is a `String`
      // subclass instance, which the primitive type does not accept.
      // eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
      (String | DocumentNode));

/**
 * How stega markers are stripped from the response:
 * - `'urls'`: only from values under URL-like keys (`url`, `slug`, `link`,
 *   `href`), where markers break links. Text keeps its markers for
 *   click-to-edit.
 * - `'all'`: from every string.
 * - `'none'`: never.
 */
export type PreprStegaMode = 'urls' | 'all' | 'none';

export interface PreprClientOptions {
  /** Full Prepr GraphQL URL, `https://graphql.prepr.io/<token>`. */
  url: string;
  /**
   * Fetch implementation. Defaults to the global `fetch`, read at call time so
   * framework-patched versions (such as Next.js's) are used.
   */
  fetch?: typeof fetch;
  /**
   * Preview mode: every query skips the HTTP cache so editors see each edit,
   * and stega defaults to `'urls'` so click-to-edit keeps working.
   */
  preview?: boolean;
  /** Default: `'urls'` when `preview` is true, otherwise `'all'`. */
  stega?: PreprStegaMode;
  /**
   * Send queries as a GET with the request body base64-encoded in a
   * `Fastly-Query` header, which Prepr's edge serves from the nearest point
   * of presence (about half the latency of a POST in our measurements).
   * Queries too large for a header still go as a POST. Off by default: it
   * relies on Prepr edge behavior that is not part of the documented API.
   */
  fastlyQuery?: boolean;
  /**
   * @internal Fetch options for the one-time schema introspection, so a
   * framework wrapper can put it in its data cache.
   */
  schemaInit?: RequestInit;
  /**
   * Headers sent with every request, such as a header a proxy in front of the
   * API requires. They are fixed when the client is created, so they cannot
   * vary per visitor and do not stop responses from being cached. Put
   * per-request values in the query's `headers` instead.
   */
  headers?: HeadersInit;
}

export interface PreprQueryOptions {
  /**
   * Prepr headers to forward, typically from `getPreprHeaders`. Passing any
   * headers object, even an empty one, makes the request `no-store`: the
   * response may be personalized and must not be shared between visitors.
   */
  headers?: PreprHeaders | HeadersInit;
  /**
   * Extra fetch options such as `signal`. `method` and `body` are set by the
   * client. `init.headers` are merged like `headers`, and also make the
   * request `no-store`.
   */
  init?: RequestInit;
  /** Per-query fetch, overriding the client's (e.g. SvelteKit's `event.fetch`). */
  fetch?: typeof fetch;
  /**
   * Fetch every variant instead of the visitor's: `personalize: false` is
   * added to every personalizable field in the query, at any depth, and each
   * item gets its `_context` (under `_preprContext`). The result is the same
   * for every visitor, so it can be cached; pass it to `resolveVariants` with
   * the visitor's `decide()` result to get what they see.
   *
   * The client learns which fields are personalizable from one schema
   * introspection request, made on first use.
   */
  variants?: boolean;
}

/** Options for `decide()`. */
export interface PreprDecideOptions extends Omit<
  PreprQueryOptions,
  'variants'
> {
  /**
   * The `variants: true` result this decision is for (the whole `data`
   * object). The decision query then asks only about the fields that hold
   * segment personalization groups, and is skipped entirely when there are
   * none, e.g. on pages with only A/B tests or no personalization.
   */
  from?: unknown;
  /**
   * @internal Ask only about the first personalizable list on each path,
   * without `from`: what middleware needs for groups at the top of a stack.
   */
  topLevelOnly?: boolean;
}

export interface PreprQueryResult<TResult> {
  data: TResult;
  /**
   * True when Prepr reports, through the response's `Vary` header, that the
   * queried fields hold segment variants or A/B tests.
   */
  personalized: boolean;
}

export interface PreprClient {
  /**
   * Run a GraphQL query against Prepr.
   *
   * @throws PreprError — `INVALID_DOCUMENT`, `FETCH_ERROR`, `HTTP_ERROR`,
   *   `INVALID_RESPONSE` or `GRAPHQL_ERROR`. Any entry in the response's
   *   `errors` array throws; there is no partial-data mode.
   */
  query<TResult, TVariables>(
    document: PreprDocument<TResult, TVariables>,
    variables?: TVariables,
    options?: PreprQueryOptions,
  ): Promise<PreprQueryResult<TResult>>;
  /**
   * Which variant of each personalization and A/B group a visitor gets, for
   * the same query you render with `variants: true`. Sends a cut-down copy of
   * the query that selects only each item's `_context`, so the response is a
   * few hundred bytes. Pass the visitor's Prepr headers: the result is only
   * as personal as the headers sent.
   */
  decide<TVariables>(
    document: PreprDocument<unknown, TVariables>,
    variables?: TVariables,
    options?: PreprDecideOptions,
  ): Promise<PreprDecisions>;
  /**
   * Whether the query's result holds an A/B test, e.g. to decide in
   * middleware whether a visitor's A/B bucket is needed. Sends the query
   * without its leaf fields and without visitor headers, so Prepr's CDN
   * caches it, and reads the answer from the `Vary` header; it needs no
   * schema download. Answers are also kept in memory for a minute. Resolves to
   * `true` when the check itself fails, so callers err toward having the
   * bucket.
   */
  hasAbTests<TVariables>(
    document: PreprDocument<unknown, TVariables>,
    variables?: TVariables,
  ): Promise<boolean>;
  /**
   * Whether the query's result holds a segment personalization group, from
   * the same cached check as `hasAbTests`. Resolves to `true` when the check
   * fails.
   */
  hasSegments<TVariables>(
    document: PreprDocument<unknown, TVariables>,
    variables?: TVariables,
  ): Promise<boolean>;
}
