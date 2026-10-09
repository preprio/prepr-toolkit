import { VERCEL_STEGA_REGEX } from '@vercel/stega';
import type { DocumentNode } from 'graphql';

import { isPersonalizedResponse } from '../personalization';
import { PreprError } from '../server';
import { stegaClean } from '../stega/clean';
import type { PreprHeaders } from '../types';
import { resolveQuery } from './document';
import type {
  PreprClientOptions,
  PreprDocument,
  PreprQueryOptions,
  PreprQueryResult,
  PreprStegaMode,
} from './types';

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

/** One request to Prepr, as made by {@link createTransport}. */
export type PreprTransport = <TResult, TVariables>(
  document: PreprDocument<TResult, TVariables> | DocumentNode,
  variables?: TVariables,
  queryOptions?: PreprQueryOptions,
) => Promise<PreprQueryResult<TResult>>;

/**
 * The single-request layer under `createPreprClient`: header layering, cache
 * mode, the optional `Fastly-Query` GET, error mapping and stega cleanup. The
 * `variants` option is not read here; the client resolves it to a derived
 * document first. Expects `options.url` to be validated already.
 */
export function createTransport(options: PreprClientOptions): PreprTransport {
  const { url, preview = false } = options;
  const stega = options.stega ?? (preview ? 'urls' : 'all');
  const clientHeaders = new Headers(options.headers);

  return async <TResult, TVariables>(
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
}
