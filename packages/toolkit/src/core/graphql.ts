import { VERCEL_STEGA_REGEX } from '@vercel/stega';
import type { DocumentNode } from 'graphql';
// The printer module alone, not the `graphql` barrel: resolved as CommonJS,
// the barrel loads the whole package (~260 KB minified) for this one function.
import { print } from 'graphql/language/printer.js';
import { stripIgnoredCharacters } from 'graphql/utilities/stripIgnoredCharacters.js';

import { isPersonalizedResponse } from './personalization';
import {
  PreprError,
  getPreprHeadersFromHeaders,
  validatePreprToken,
} from './server';
import { stegaClean } from './stega/clean';
import {
  PREPR_SCHEMA_QUERY,
  decisionsFrom,
  hasAbTest,
  personalizationPaths,
  toDecisionDocument,
  toSchemaInfo,
  toVariantsDocument,
  type PreprDecisions,
  type PreprSchemaInfo,
} from './variants';
import type { PreprHeaders } from './types';

const OPERATION_NAME =
  /\b(?:query|mutation|subscription)\s+([_A-Za-z][_0-9A-Za-z]*)/;

// Non-global copy: `.test` on a global regex keeps `lastIndex` between calls.
const STEGA_RAW = new RegExp(
  VERCEL_STEGA_REGEX.source,
  VERCEL_STEGA_REGEX.flags.replace('g', ''),
);
// The same zero-width characters written as JSON escapes; U+D834 is the high
// surrogate of the astral characters stega also uses.
const STEGA_ESCAPED = /\\u(?:200[bcd]|206[0-3]|feff|d834)/i;
// Markers under these keys get percent-encoded inside href/src and break links.
const URL_KEY = /(url|slug|link|href)$/i;

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
   * middleware whether a visitor's A/B bucket is needed. Sends the query cut
   * down to each item's `_context`, without visitor headers, so Prepr's CDN
   * caches it; answers are also kept in memory for a minute. Resolves to
   * `true` when the check itself fails, so callers err toward having the
   * bucket.
   */
  hasAbTests<TVariables>(
    document: PreprDocument<unknown, TVariables>,
    variables?: TVariables,
  ): Promise<boolean>;
}

// Codegen documents are module-level constants, so after the first request
// every lookup hits. Keyed weakly so documents built at runtime can be
// collected.
const printed = new WeakMap<object, string>();

function isDocumentNode(value: unknown): value is DocumentNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'Document' &&
    Array.isArray((value as { definitions?: unknown }).definitions)
  );
}

function invalidDocument(originalError?: Error): PreprError {
  return new PreprError(
    'Expected a GraphQL query string, TypedDocumentString or DocumentNode',
    'INVALID_DOCUMENT',
    'createPreprClient',
    originalError,
  );
}

// Fastly rejects request headers over 128 KB; this leaves headroom for the
// visitor headers sent alongside.
const FASTLY_QUERY_MAX = 96 * 1024;

/** Base64 of UTF-8 text, in any runtime (no Node Buffer). */
function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// How long a hasAbTests answer is reused, and how many are kept per query.
const AB_CHECK_TTL_MS = 60_000;
const AB_CHECK_MAX_ENTRIES = 1000;

// Prepr rejects queries over 27,500 characters (HTTP 412), and indentation
// alone can push a query with many fragments past that. Every query is sent
// without insignificant whitespace and comments.
const minified = new Map<string, string>();
const MINIFIED_CACHE_LIMIT = 500;

function minify(query: string): string {
  const cached = minified.get(query);
  if (cached !== undefined) return cached;
  let result = query;
  try {
    result = stripIgnoredCharacters(query);
  } catch {
    // Not valid GraphQL: send it as is and let Prepr report the error.
  }
  // Query strings are normally module constants; the cap keeps queries built
  // at runtime from growing the cache without bound.
  if (minified.size < MINIFIED_CACHE_LIMIT) minified.set(query, result);
  return result;
}

function resolveQuery(document: unknown): string {
  if (typeof document === 'string') return minify(document);
  if (document instanceof String) return minify(document.toString());
  if (!isDocumentNode(document)) throw invalidDocument();

  let query = printed.get(document);
  if (query === undefined) {
    try {
      query = minify(print(document));
    } catch (error) {
      throw invalidDocument(error instanceof Error ? error : undefined);
    }
    printed.set(document, query);
  }
  return query;
}

function isParseableUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Next.js's fetch extension `next` is dropped together with the cache
 * override: `revalidate` alongside `no-store` is a conflict whose winner
 * depends on the Next version, and the no-store guarantee must hold.
 */
function cacheInit(
  init: RequestInit | undefined,
  noStore: boolean,
): RequestInit {
  const result: RequestInit & { next?: unknown } = { ...init };
  if (noStore) {
    result.cache = 'no-store';
    delete result.next;
  }
  return result;
}

/**
 * Frameworks signal control flow by throwing from inside `fetch`: Next.js
 * marks dynamic-rendering bailouts and prerender interrupts with a string
 * `digest`. Wrapping those in `PreprError` would stop the framework from
 * recognizing them.
 */
/** @internal */
export function isFrameworkSignal(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { digest?: unknown }).digest === 'string'
  );
}

function cleanEveryString(_key: string, value: unknown): unknown {
  return typeof value === 'string' ? stegaClean(value) : value;
}

function cleanUrlStrings(key: string, value: unknown): unknown {
  return typeof value === 'string' && URL_KEY.test(key)
    ? stegaClean(value)
    : value;
}

/**
 * One scan of the raw body decides whether any marker is present; a body
 * without markers parses without a reviver, so tokens that do not encode
 * stega pay no per-string cost.
 */
function parseBody(text: string, stega: PreprStegaMode): unknown {
  if (stega === 'none' || !(STEGA_RAW.test(text) || STEGA_ESCAPED.test(text))) {
    return JSON.parse(text);
  }
  return JSON.parse(text, stega === 'all' ? cleanEveryString : cleanUrlStrings);
}

/**
 * Create a GraphQL client for the Prepr API.
 *
 * Reach for it on the server, to fetch content with codegen types and get
 * Prepr's personalization verdict alongside the data. Requests without
 * `headers` are identical for every visitor and safe to cache; requests with
 * them are always `no-store`.
 *
 * Requires the `graphql` package, which graphql-codegen already installs.
 *
 * @throws PreprError `MISSING_TOKEN` or `INVALID_TOKEN` for a bad `url`.
 */
export function createPreprClient(options: PreprClientOptions): PreprClient {
  const { url, preview = false } = options;
  validatePreprToken(url);
  if (!isParseableUrl(url)) {
    // The message deliberately omits the url: it contains the access token.
    throw new PreprError(
      'Prepr GraphQL URL is not a valid URL',
      'INVALID_TOKEN',
      'createPreprClient',
    );
  }
  const stega = options.stega ?? (preview ? 'urls' : 'all');
  const clientHeaders = new Headers(options.headers);

  const run = async <TResult, TVariables>(
    document: PreprDocument<TResult, TVariables> | DocumentNode,
    variables?: TVariables,
    queryOptions: PreprQueryOptions = {},
  ): Promise<PreprQueryResult<TResult>> => {
    const query = resolveQuery(document);
    const operation = OPERATION_NAME.exec(query)?.[1] ?? 'anonymous';

    // Later layers win: client, then `init.headers`, then `headers`.
    // Content-Type is set last because the body is always JSON.
    const headers = new Headers(clientHeaders);
    for (const layer of [queryOptions.init?.headers, queryOptions.headers]) {
      new Headers(layer as HeadersInit | undefined).forEach((value, key) => {
        headers.set(key, value);
      });
    }
    headers.set('Content-Type', 'application/json');

    // Per-request headers may carry visitor data; client-level ones cannot.
    const perRequestHeaders =
      queryOptions.headers !== undefined ||
      queryOptions.init?.headers !== undefined;

    const payload = JSON.stringify({ query, variables });
    const fastly = options.fastlyQuery ? base64(payload) : null;
    const viaGet = fastly !== null && fastly.length <= FASTLY_QUERY_MAX;
    if (viaGet) headers.set('Fastly-Query', fastly);

    const init: RequestInit = {
      ...cacheInit(queryOptions.init, preview || perRequestHeaders),
      method: viaGet ? 'GET' : 'POST',
      headers,
      body: viaGet ? undefined : payload,
    };
    const fetchImpl = queryOptions.fetch ?? options.fetch;

    let response: Response;
    try {
      response = await (fetchImpl ? fetchImpl(url, init) : fetch(url, init));
    } catch (error) {
      if (isFrameworkSignal(error)) throw error;
      throw new PreprError(
        `Prepr GraphQL request failed for ${operation}`,
        'FETCH_ERROR',
        operation,
        error instanceof Error ? error : undefined,
      );
    }

    if (!response.ok) {
      throw new PreprError(
        `Prepr GraphQL HTTP ${response.status} for ${operation}${
          response.status === 412
            ? ' (Prepr rejects queries longer than 27,500 characters)'
            : ''
        }`,
        'HTTP_ERROR',
        operation,
      );
    }

    let body: unknown;
    try {
      body = parseBody(await response.text(), stega);
    } catch (error) {
      throw new PreprError(
        `Prepr GraphQL response for ${operation} is not valid JSON`,
        'INVALID_RESPONSE',
        operation,
        error instanceof Error ? error : undefined,
      );
    }

    if (typeof body !== 'object' || body === null) {
      throw new PreprError(
        `Prepr GraphQL response for ${operation} is not an object`,
        'INVALID_RESPONSE',
        operation,
      );
    }

    const { data, errors } = body as {
      data?: TResult | null;
      errors?: { message?: unknown }[];
    };

    if (Array.isArray(errors) && errors.length > 0) {
      const messages = errors
        .map((e) => String(e?.message ?? 'Unknown error'))
        .join('; ');
      throw new PreprError(
        `Prepr GraphQL errors for ${operation}: ${messages}`,
        'GRAPHQL_ERROR',
        operation,
      );
    }

    if (data === null || data === undefined) {
      throw new PreprError(
        `Prepr GraphQL response for ${operation} has no data`,
        'INVALID_RESPONSE',
        operation,
      );
    }

    return { data, personalized: isPersonalizedResponse(response) };
  };

  // The schema says which fields take `personalize`; it is fetched once per
  // client, and refetched only if that request fails.
  let schema: Promise<PreprSchemaInfo> | undefined;
  const loadSchema = () =>
    (schema ??= run<Parameters<typeof toSchemaInfo>[0], undefined>(
      PREPR_SCHEMA_QUERY,
      undefined,
      { init: options.schemaInit },
    ).then(
      (result) => toSchemaInfo(result.data),
      (error: unknown) => {
        schema = undefined;
        throw error;
      },
    ));

  // Derived documents are cached per source document, so each is built (and
  // printed) once.
  const variantsDocuments = new Map<unknown, DocumentNode>();
  const abChecks = new Map<
    unknown,
    Map<string, { value: Promise<boolean>; at: number }>
  >();
  const decisionDocuments = new Map<
    unknown,
    Map<string, DocumentNode | null>
  >();

  return {
    async query<TResult, TVariables>(
      document: PreprDocument<TResult, TVariables>,
      variables?: TVariables,
      queryOptions: PreprQueryOptions = {},
    ): Promise<PreprQueryResult<TResult>> {
      const { variants, ...rest } = queryOptions;
      if (!variants) return run(document, variables, rest);

      let derived = variantsDocuments.get(document);
      if (!derived) {
        derived = toVariantsDocument(document, await loadSchema());
        variantsDocuments.set(document, derived);
      }
      return run<TResult, TVariables>(derived, variables, rest);
    },

    async decide<TVariables>(
      document: PreprDocument<unknown, TVariables>,
      variables?: TVariables,
      queryOptions: PreprDecideOptions = {},
    ): Promise<PreprDecisions> {
      const { from, ...rest } = queryOptions;
      const paths = from === undefined ? undefined : personalizationPaths(from);
      // Nothing on the page depends on a segment: no request at all.
      if (paths && paths.size === 0) return new Map();

      const signature = paths ? [...paths].sort().join('|') : '*';
      let byPaths = decisionDocuments.get(document);
      if (!byPaths) {
        byPaths = new Map();
        decisionDocuments.set(document, byPaths);
      }
      let derived = byPaths.get(signature);
      if (derived === undefined) {
        derived = toDecisionDocument(document, await loadSchema(), paths);
        byPaths.set(signature, derived);
      }
      if (!derived) return new Map();
      const { data } = await run(derived, variables, rest);
      return decisionsFrom(data);
    },

    async hasAbTests<TVariables>(
      document: PreprDocument<unknown, TVariables>,
      variables?: TVariables,
    ): Promise<boolean> {
      const key = JSON.stringify(variables ?? null);
      let answers = abChecks.get(document);
      if (!answers) {
        answers = new Map();
        abChecks.set(document, answers);
      }
      const cached = answers.get(key);
      if (cached && Date.now() - cached.at < AB_CHECK_TTL_MS)
        return cached.value;

      const value = (async () => {
        let derived = decisionDocuments.get(document)?.get('*');
        if (derived === undefined) {
          derived = toDecisionDocument(document, await loadSchema());
        }
        if (!derived) return false;
        // No visitor headers: the default response already contains every
        // A/B test (as variant A), and Prepr's CDN can cache it.
        const { data } = await run(derived, variables);
        return hasAbTest(data);
      })().catch((error: unknown) => {
        if (isFrameworkSignal(error)) throw error;
        answers!.delete(key);
        return true;
      });

      if (answers.size >= AB_CHECK_MAX_ENTRIES) {
        answers.delete(answers.keys().next().value!);
      }
      answers.set(key, { value, at: Date.now() });
      return value;
    },
  };
}

/**
 * @internal Request Prepr headers with caller-supplied ones layered on top.
 */
export function mergePreprHeaders(
  base: PreprHeaders,
  extra?: PreprHeaders | HeadersInit,
): Headers {
  const merged = new Headers(base as Record<string, string>);
  new Headers(extra as HeadersInit | undefined).forEach((value, key) => {
    merged.set(key, value);
  });
  return merged;
}

/** @internal How a framework wrapper reaches the current request. */
export interface PreprEventAdapter<TEvent> {
  /** Request headers; only the Prepr ones are forwarded. */
  headers(event: TEvent): Headers;
  /** Request-scoped fetch, when the framework provides one. */
  fetch?(event: TEvent): typeof fetch | undefined;
}

/**
 * Query options for frameworks without an implicit request scope.
 * `personalize: true` requires the request `event`; the compiler enforces it.
 */
export type PreprEventQueryOptions<TEvent> = PreprQueryOptions &
  (
    | { personalize?: false; event?: TEvent }
    | { personalize: true; event: TEvent }
  );

export interface PreprEventClient<TEvent> {
  /**
   * Run a GraphQL query against Prepr. With `personalize: true`, the Prepr
   * headers of `event` are forwarded and the request is `no-store`; without
   * it the request is identical for every visitor.
   *
   * @throws PreprError — as `PreprClient.query`, plus `CONTEXT_ERROR` when
   *   `personalize` is true and no `event` is passed.
   */
  query<TResult, TVariables>(
    document: PreprDocument<TResult, TVariables>,
    variables?: TVariables,
    options?: PreprEventQueryOptions<TEvent>,
  ): Promise<PreprQueryResult<TResult>>;
  /**
   * Which variant of each group this visitor gets, for the query you render
   * with `variants: true`. Forwards the Prepr headers of `event`.
   *
   * @throws PreprError — `CONTEXT_ERROR` without an `event`.
   */
  decide<TVariables>(
    document: PreprDocument<unknown, TVariables>,
    variables: TVariables | undefined,
    options: PreprDecideOptions & { event: TEvent },
  ): Promise<PreprDecisions>;
}

/** @internal Shared implementation of the Nuxt, SvelteKit and Astro clients. */
export function createEventClient<TEvent>(
  options: PreprClientOptions,
  adapter: PreprEventAdapter<TEvent>,
): PreprEventClient<TEvent> {
  const client = createPreprClient(options);

  return {
    async query<TResult, TVariables>(
      document: PreprDocument<TResult, TVariables>,
      variables?: TVariables,
      queryOptions: PreprEventQueryOptions<TEvent> = {},
    ): Promise<PreprQueryResult<TResult>> {
      const { personalize, event, ...rest } = queryOptions;

      // Throwing beats a silent headerless fetch: the caller asked for this
      // visitor's variant and would otherwise get the default one.
      if (personalize && event === undefined) {
        throw new PreprError(
          'personalize: true requires the request event',
          'CONTEXT_ERROR',
          'createPreprClient',
        );
      }

      const fetchImpl =
        rest.fetch ??
        (event === undefined ? undefined : adapter.fetch?.(event));
      // Filtering through getPreprHeadersFromHeaders keeps cookies and other
      // request headers from ever reaching the Prepr API.
      const headers = personalize
        ? mergePreprHeaders(
            getPreprHeadersFromHeaders(adapter.headers(event as TEvent)),
            rest.headers,
          )
        : rest.headers;

      return client.query(document, variables, {
        ...rest,
        headers,
        fetch: fetchImpl,
      });
    },

    async decide<TVariables>(
      document: PreprDocument<unknown, TVariables>,
      variables: TVariables | undefined,
      queryOptions: PreprDecideOptions & { event: TEvent },
    ): Promise<PreprDecisions> {
      const { event, ...rest } = queryOptions;
      if (event === undefined) {
        throw new PreprError(
          'decide requires the request event',
          'CONTEXT_ERROR',
          'createPreprClient',
        );
      }
      return client.decide(document, variables, {
        ...rest,
        headers: mergePreprHeaders(
          getPreprHeadersFromHeaders(adapter.headers(event)),
          rest.headers,
        ),
        fetch: rest.fetch ?? adapter.fetch?.(event),
      });
    },
  };
}
