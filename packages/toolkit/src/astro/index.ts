import {
  getActiveSegmentFromHeaders,
  getActiveVariantFromHeaders,
  getPreprHeadersFromHeaders,
  getPreprUUIDFromHeaders,
  getToolbarPropsFromHeaders,
} from '../core/server';
import {
  processFrameworkRequest,
  serializeCookie,
  type PreprMiddlewareOptions,
} from '../core/middleware';
import type {
  PreprFeatures,
  PreprHeaders,
  PreprToolbarProps,
} from '../core/types';
import {
  normalizeQuery as applyPatchLog,
  type LivePatch,
} from '../core/live-preview/normalize-query';
import { readLiveLogFromRequest } from '../core/live-preview/live-request';
import type { QueryInput } from '../core/live-preview/query-document';
import { annotateEditLinks } from '../core/live-preview/edit-links';

export type { PreprMiddlewareOptions };

/**
 * Structural stand-in for Astro's `APIContext`, so this package needs no
 * build-time dependency on `astro`. Only the fields `onPreprRequest` uses.
 */
export interface AstroLikeContext {
  request: Request;
  /** Unused; typed loosely so passing the real Astro context still checks. */
  cookies?: unknown;
  /** Per-request storage; carries the editor's unsaved changes in preview. */
  locals?: object;
}

// Where `onPreprRequest` leaves the editor's unsaved changes for
// `normalizeQuery`. A symbol, so it cannot collide with a site's own locals.
const LIVE_LOG = Symbol.for('@preprio/toolkit/astro-live-log');

/** Astro middleware's `next()` — resolves to the `Response` from downstream. */
export type AstroNext = () => Promise<Response>;

/**
 * Astro middleware entry point: computes the Prepr headers/cookies for this
 * request, forwards the headers downstream and sets the cookies on the response.
 *
 * Astro hands downstream code the same `Request` instance this middleware receives, so the
 * headers are mutated in place — building a new `Request` would go nowhere,
 * there's no way to hand a replacement back out of middleware.
 */
export async function onPreprRequest(
  context: AstroLikeContext,
  next: AstroNext,
  options?: PreprMiddlewareOptions,
): Promise<Response> {
  const { requestHeaders, responseCookies } = processFrameworkRequest(
    context.request,
    options,
    'astro',
  );

  // processPreprRequest returns a copy, so fold it back onto the original
  // request — that instance is the only one downstream code will see.
  requestHeaders.forEach((value, key) => {
    context.request.headers.set(key, value);
  });

  // In preview, a live-preview re-render carries the editor's unsaved
  // changes; `normalizeQuery` applies them while the page renders.
  const log =
    options?.preview && context.locals
      ? await readLiveLogFromRequest(context.request)
      : [];
  if (log.length && context.locals) {
    (context.locals as Record<symbol, unknown>)[LIVE_LOG] = log;
  }

  const response = await next();

  if (log.length) {
    // One editor's unsaved changes must never be served to anyone else.
    response.headers.set('Cache-Control', 'private, no-store');
  }

  for (const cookie of responseCookies) {
    response.headers.append('Set-Cookie', serializeCookie(cookie));
  }

  return response;
}

// --- Server helpers (Astro-friendly names, take a standard Headers) --------

/** Prepr Customer ID for this request, from `Astro.request.headers`. */
export function getPreprUUID(headers: Headers): string | null {
  return getPreprUUIDFromHeaders(headers);
}

/** Active segment for this request, from `Astro.request.headers`. */
export function getActiveSegment(headers: Headers): string | null {
  return getActiveSegmentFromHeaders(headers);
}

/** Active A/B variant for this request, from `Astro.request.headers`. */
export function getActiveVariant(headers: Headers): string | null {
  return getActiveVariantFromHeaders(headers);
}

/** All Prepr headers for this request, from `Astro.request.headers`. */
export function getPreprHeaders(headers: Headers): PreprHeaders {
  return getPreprHeadersFromHeaders(headers);
}

/**
 * Props needed to mount `PreprToolbar.astro`, from `Astro.request.headers`
 * plus a Prepr GraphQL token.
 *
 * Ungated: call it only when your app is in preview mode. Resolve that however
 * your deployment already does — the toolkit reads no environment variables of
 * its own.
 */
export async function getToolbarProps(
  headers: Headers,
  token: string,
  features?: PreprFeatures,
): Promise<PreprToolbarProps> {
  return getToolbarPropsFromHeaders(headers, token, features);
}

export interface AstroNormalizeQueryOptions {
  /**
   * Whether this render may show unsaved editor changes. Pass your preview
   * flag, and never `true` on a production deployment. When false (the
   * default) the result is returned untouched.
   */
  enabled?: boolean;
  /** `Astro.locals`, where `onPreprRequest` leaves the editor's changes. */
  locals?: object;
  /** Which operation to use when the document holds more than one. */
  operationName?: string;
}

/**
 * Show the Prepr editor's unsaved changes on a server-rendered Astro page:
 * pass the query and the result you fetched (with any client), and render
 * what comes back.
 *
 * ```astro
 * ---
 * const data = await fetchFromPrepr(GetPageDocument, { slug });
 * const page = normalizeQuery(GetPageDocument, data, {
 *   enabled: preview,
 *   locals: Astro.locals,
 * });
 * ---
 * ```
 *
 * Needs `onPreprRequest` with `preview: true` in your middleware and
 * `PreprToolbar.astro` on the page; the toolbar re-requests the page with
 * the editor's changes while they type. Select `_id` on every item and
 * component that should update.
 */
export function normalizeQuery<T>(
  query: QueryInput,
  result: T,
  options: AstroNormalizeQueryOptions = {},
): T {
  if (!options.enabled) return result;
  // Every render in preview, so click-to-edit finds list entries by id.
  const annotated = annotateEditLinks(result, query, options.operationName);
  const log = (options.locals as Record<symbol, unknown> | undefined)?.[
    LIVE_LOG
  ] as LivePatch[] | undefined;
  if (!log?.length) return annotated;
  return applyPatchLog(query, annotated, {
    log,
    operationName: options.operationName,
  });
}
