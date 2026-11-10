import {
  getActiveSegmentFromHeaders,
  getActiveVariantFromHeaders,
  getPreprHeadersFromHeaders,
  getPreprUUIDFromHeaders,
  getToolbarPropsFromHeaders,
} from './server';
import type { PreprFeatures, PreprHeaders, PreprToolbarProps } from './types';

// The short names the Nuxt, SvelteKit and Astro entry points share. Each takes
// the request's standard `Headers`, as rewritten by the Prepr middleware.

/** Returns the Prepr Customer ID from the request headers. */
export function getPreprUUID(headers: Headers): string | null {
  return getPreprUUIDFromHeaders(headers);
}

/** Returns the active segment from the request headers. */
export function getActiveSegment(headers: Headers): string | null {
  return getActiveSegmentFromHeaders(headers);
}

/** Returns the active A/B testing variant from the request headers. */
export function getActiveVariant(headers: Headers): string | null {
  return getActiveVariantFromHeaders(headers);
}

/** Returns all Prepr headers from the request headers. */
export function getPreprHeaders(headers: Headers): PreprHeaders {
  return getPreprHeadersFromHeaders(headers);
}

/**
 * Props needed to mount the `PreprToolbar` component, from the request
 * headers plus a Prepr GraphQL token.
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
