import {
  getActiveSegmentFromHeaders,
  getActiveVariantFromHeaders,
  getPreprHeadersFromHeaders,
  getPreprUUIDFromHeaders,
  getToolbarPropsFromHeaders,
} from '../core/server';
import {
  processPreprRequest,
  serializeCookie,
  type PreprMiddlewareOptions,
} from '../core/middleware';
import type {
  PreprFeatures,
  PreprHeaders,
  PreprToolbarProps,
} from '../core/types';

export type { PreprMiddlewareOptions };

/**
 * Structural stand-in for Astro's `APIContext`, so this package needs no
 * build-time dependency on `astro`. Only the fields `onPreprRequest` uses.
 */
export interface AstroLikeContext {
  request: Request;
  /** Unused; typed loosely so passing the real Astro context still checks. */
  cookies?: unknown;
}

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
  const { requestHeaders, responseCookies } = processPreprRequest(
    context.request,
    options,
  );

  // processPreprRequest returns a copy, so fold it back onto the original
  // request — that instance is the only one downstream code will see.
  requestHeaders.forEach((value, key) => {
    context.request.headers.set(key, value);
  });

  const response = await next();

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
