import { cookies, headers } from 'next/headers';
import * as navigation from 'next/navigation';

import {
  applyPatchLog,
  type LivePatch,
} from '../core/live-preview/normalize-query';
import type { QueryInput } from '../core/live-preview/query-document';
import * as React from 'react';

import { LIVE_LOG_COOKIE, takeLiveLog } from './live-log';
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
  const log = await getPreprLiveLog();
  if (!log.length) return result;
  return applyPatchLog(query, result, log, options.operationName);
}
