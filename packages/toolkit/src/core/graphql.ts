import { print, type DocumentNode } from 'graphql';

import { isPersonalizedResponse } from './personalization';
import { PreprError, validatePreprToken } from './server';
import type { PreprHeaders } from './types';

const OPERATION_NAME =
  /\b(?:query|mutation|subscription)\s+([_A-Za-z][_0-9A-Za-z]*)/;

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
  | ({ __apiType?: (variables: TVariables) => TResult } & (
      | String
      | DocumentNode
    ));

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
}

export interface PreprQueryOptions {
  /**
   * Prepr headers to forward, typically from `getPreprHeaders`. Passing any
   * headers object, even an empty one, makes the request `no-store`: the
   * response may be personalized and must not be shared between visitors.
   */
  headers?: PreprHeaders | HeadersInit;
  /**
   * Extra fetch options such as `signal`. `method`, `headers` and `body` are
   * set by the client and cannot be overridden here.
   */
  init?: RequestInit;
  /** Per-query fetch, overriding the client's (e.g. SvelteKit's `event.fetch`). */
  fetch?: typeof fetch;
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

function resolveQuery(document: unknown): string {
  if (typeof document === 'string') return document;
  if (document instanceof String) return document.toString();
  if (!isDocumentNode(document)) throw invalidDocument();

  let query = printed.get(document);
  if (query === undefined) {
    try {
      query = print(document);
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
function isFrameworkSignal(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { digest?: unknown }).digest === 'string'
  );
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

  return {
    async query<TResult, TVariables>(
      document: PreprDocument<TResult, TVariables>,
      variables?: TVariables,
      queryOptions: PreprQueryOptions = {},
    ): Promise<PreprQueryResult<TResult>> {
      const query = resolveQuery(document);
      const operation = OPERATION_NAME.exec(query)?.[1] ?? 'anonymous';

      const headers = new Headers(
        queryOptions.headers as HeadersInit | undefined,
      );
      headers.set('Content-Type', 'application/json');

      const init: RequestInit = {
        ...cacheInit(
          queryOptions.init,
          preview || queryOptions.headers !== undefined,
        ),
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
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
          `Prepr GraphQL HTTP ${response.status} for ${operation}`,
          'HTTP_ERROR',
          operation,
        );
      }

      let body: unknown;
      try {
        body = JSON.parse(await response.text());
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
    },
  };
}
