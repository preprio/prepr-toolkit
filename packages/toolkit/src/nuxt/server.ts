import {
  getActiveSegmentFromHeaders,
  getActiveVariantFromHeaders,
  getPreprHeadersFromHeaders,
  getPreprUUIDFromHeaders,
  getToolbarPropsFromHeaders,
} from '../core/server';
import type { PreprHeaders, PreprToolbarProps } from '../core/types';

// Same shape as the SvelteKit/Astro helpers: take a standard `Headers` —
// build one from `useRequestHeaders()` or read `getPreprHeadersFromEvent(event)`.

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
 * Props needed to mount `PreprToolbar.vue`, from the request headers plus a
 * Prepr GraphQL token. Ungated — gate on preview mode yourself (e.g.
 * `import.meta.dev`).
 */
export async function getToolbarProps(
  headers: Headers,
  token: string
): Promise<PreprToolbarProps> {
  return getToolbarPropsFromHeaders(headers, token);
}
