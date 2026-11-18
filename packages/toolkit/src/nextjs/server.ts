import { cookies, headers } from 'next/headers';
import * as navigation from 'next/navigation';

import {
  applyPatchLog,
  type LivePatch,
} from '../core/live-preview/normalize-query';
import type { QueryInput } from '../core/live-preview/query-document';
import { annotateEditLinks } from '../core/live-preview/edit-links';
import * as React from 'react';

import { hasLiveLog, LIVE_LOG_COOKIE, takeLiveLog } from './live-log';
import {
  getActiveSegmentFromHeaders,
  getActiveVariantFromHeaders,
  getPreprHeadersFromHeaders,
  getPreprUUIDFromHeaders,
  getToolbarPropsFromHeaders,
} from '../core/server';
import type {
  PreprFeatures,
  PreprHeaders,
  PreprToolbarProps,
} from '../core/types';

/**
 * `headers()` is sync on Next 13/14 and returns a Promise from Next 15 on.
 * Awaiting a non-promise is a no-op, so this covers both without a version check.
 */
async function readHeaders(): Promise<Headers> {
  return await headers();
}

/** Prepr Customer ID for the current request. Server-only. */
export async function getPreprUUID(): Promise<string | null> {
  const h = await readHeaders();
  return getPreprUUIDFromHeaders(h);
}

/** Active segment for the current request. Server-only. */
export async function getActiveSegment(): Promise<string | null> {
  const h = await readHeaders();
  return getActiveSegmentFromHeaders(h);
}

/** Active A/B variant for the current request. Server-only. */
export async function getActiveVariant(): Promise<string | null> {
  const h = await readHeaders();
  return getActiveVariantFromHeaders(h);
}

/** All Prepr headers for the current request, to forward to a GraphQL fetch. Server-only. */
export async function getPreprHeaders(): Promise<PreprHeaders> {
  const h = await readHeaders();
  return getPreprHeadersFromHeaders(h);
}

/**
 * Props needed to mount `PreprToolbar`, from the current request's headers plus
 * a Prepr GraphQL token.
 *
 * Ungated: call it only when your app is in preview mode. Resolve that however
 * your deployment already does (`VERCEL_ENV`, a branch check, your own flag) —
 * the toolkit reads no environment variables of its own.
 *
 * Never throws: segment-fetch failures degrade to an empty segment list, so a
 * bad or missing token can't crash the host app.
 */
export async function getToolbarProps(
  token: string,
  features?: PreprFeatures,
): Promise<PreprToolbarProps> {
  const h = await readHeaders();
  return getToolbarPropsFromHeaders(h, token, features);
}

export interface NextNormalizeQueryOptions {
  /**
   * Pass the same preview flag as the middleware; never `true` on a
   * production deployment. When false (the default) the request is not read,
   * so static and ISR pages stay static.
   */
  enabled?: boolean;
  /** Which operation to use when the document holds more than one. */
  operationName?: string;
}

const HEADER_NEXT_ACTION = 'next-action';

// The token is single-use, so every `normalizeQuery` call in one render must
// share the first read. Outside React Server Components each call reads anew.
const cacheForRender =
  (React as { cache?: <F extends (...args: never[]) => unknown>(fn: F) => F })
    .cache ?? (<F>(fn: F): F => fn);

/**
 * Unsaved changes the Prepr editor sent for this render, or an empty list.
 * Reads the request, which makes the route dynamic.
 */
export const getPreprLiveLog = cacheForRender(
  async (): Promise<LivePatch[]> => {
    let token: string | undefined;
    try {
      // Only a server action re-render may see a log, never a plain GET that
      // replays an unconsumed token.
      if (!(await headers()).has(HEADER_NEXT_ACTION)) return [];
      token = (await cookies()).get(LIVE_LOG_COOKIE)?.value;
    } catch (error) {
      // Next's control-flow throws (dynamic rendering) must reach Next.
      // Anything else means there is no request, e.g. at build time.
      (
        navigation as { unstable_rethrow?: (error: unknown) => void }
      ).unstable_rethrow?.(error);
      return [];
    }
    return takeLiveLog(token);
  },
);

/**
 * Show the Prepr editor's unsaved changes in server components: pass the
 * query and its result, and render what comes back.
 *
 * ```ts
 * const page = await normalizeQuery(GetPageDocument, data, { enabled: isPreview });
 * ```
 *
 * Needs `PreprRefresh` mounted, and `_id` selected on every item and
 * component that should update. Server-only; Next.js 16+.
 */
export async function normalizeQuery<T>(
  query: QueryInput,
  result: T,
  options: NextNormalizeQueryOptions = {},
): Promise<T> {
  if (!options.enabled) return result;
  // Every render in preview, so click-to-edit finds list entries by id.
  const annotated = annotateEditLinks(result, query, options.operationName);
  const log = await getPreprLiveLog();
  if (!log.length) return annotated;
  return applyPatchLog(query, annotated, log, options.operationName);
}

export interface LivePreviewFetchKey {
  /** The query the fetcher runs, string or document. */
  query: QueryInput;
  /** Its variables. */
  variables?: Record<string, unknown>;
}

export interface LivePreviewFetchOptions {
  /**
   * Pass the same preview flag as the middleware; never `true` on a
   * production deployment. When false (the default) the fetcher runs as it
   * is and the request is not read.
   */
  enabled?: boolean;
}

// Responses are whole query results, so the count stays low; the age limit
// bounds how long another editor's save can go unseen while someone types.
const MAX_STORED_RESPONSES = 30;
const STORED_RESPONSE_TTL_MS = 5 * 60_000;

interface StoredResponse {
  value: unknown;
  expires: number;
}

const storedResponses = new Map<string, StoredResponse>();

// Query documents are module constants, so identity names them without
// printing the document on every call.
const documentIds = new WeakMap<object, number>();
let nextDocumentId = 0;

function queryKey(query: QueryInput): string {
  if (typeof query === 'string') return query;
  let id = documentIds.get(query);
  if (id === undefined) documentIds.set(query, (id = nextDocumentId++));
  return `#${id}`;
}

function responseKey(
  key: LivePreviewFetchKey,
  preprHeaders: PreprHeaders,
): string | null {
  try {
    return JSON.stringify([
      queryKey(key.query),
      key.variables ?? null,
      // Segment, A/B variant and visitor decide what Prepr returns.
      Object.entries(preprHeaders).sort(([a], [b]) => (a < b ? -1 : 1)),
    ]);
  } catch {
    // Variables that do not serialize (a cycle, a BigInt) cannot name a
    // response.
    return null;
  }
}

/**
 * Skips the Prepr request while an editor types. Wrap the fetch of a query
 * whose result goes through `normalizeQuery`:
 *
 * ```ts
 * const data = await livePreviewFetch(
 *   { query: GetPageDocument, variables: { slug } },
 *   () => fetchFromPrepr(GetPageDocument, { slug }),
 *   { enabled: isPreview },
 * );
 * const page = await normalizeQuery(GetPageDocument, data, { enabled: isPreview });
 * ```
 *
 * A render for unsaved changes gets the response of the last full render of
 * the same query, variables and Prepr headers; `normalizeQuery` puts the
 * changes on top. Every other render (a page load, a save) runs the fetcher
 * and stores what it returns. Stored content is not changed by typing, so
 * the page shows the same as without this helper.
 *
 * Responses are kept in the memory of the server process, a few at a time
 * and for a few minutes; another instance or an expired response runs the
 * fetcher. Treat the returned value as read-only: renders share it. Keys
 * must tell responses apart, so include every variable the fetcher uses.
 * Server-only.
 */
export async function livePreviewFetch<T>(
  key: LivePreviewFetchKey,
  fetcher: () => Promise<T>,
  options: LivePreviewFetchOptions = {},
): Promise<T> {
  if (!options.enabled) return fetcher();
  let unsaved: boolean;
  let preprHeaders: PreprHeaders;
  try {
    const h = await readHeaders();
    preprHeaders = getPreprHeadersFromHeaders(h);
    // Looked up without taking the log, which is single-use and belongs to
    // `normalizeQuery`.
    unsaved =
      h.has(HEADER_NEXT_ACTION) &&
      hasLiveLog((await cookies()).get(LIVE_LOG_COOKIE)?.value);
  } catch (error) {
    (
      navigation as { unstable_rethrow?: (error: unknown) => void }
    ).unstable_rethrow?.(error);
    return fetcher();
  }
  const id = responseKey(key, preprHeaders);
  if (id === null) return fetcher();

  const now = Date.now();
  if (unsaved) {
    const stored = storedResponses.get(id);
    if (stored && stored.expires > now) return stored.value as T;
  }
  const value = await fetcher();
  // Re-inserted so insertion order stays age order.
  storedResponses.delete(id);
  for (const [other, stored] of storedResponses) {
    if (stored.expires > now && storedResponses.size < MAX_STORED_RESPONSES) {
      break;
    }
    storedResponses.delete(other);
  }
  storedResponses.set(id, { value, expires: now + STORED_RESPONSE_TTL_MS });
  return value;
}
