import {
  getActiveSegmentFromHeaders,
  getActiveVariantFromHeaders,
  getPreprHeadersFromHeaders,
  getPreprUUIDFromHeaders,
  getToolbarPropsFromHeaders,
} from '../core/server';
import type { PreprHeaders, PreprToolbarProps } from '../core/types';

/** Returns the Prepr Customer ID from `event.request.headers`. */
export function getPreprUUID(headers: Headers): string | null {
  return getPreprUUIDFromHeaders(headers);
}

/** Returns the active segment from `event.request.headers`. */
export function getActiveSegment(headers: Headers): string | null {
  return getActiveSegmentFromHeaders(headers);
}

/** Returns the active A/B testing variant from `event.request.headers`. */
export function getActiveVariant(headers: Headers): string | null {
  return getActiveVariantFromHeaders(headers);
}

/** Returns all Prepr headers from `event.request.headers`. */
export function getPreprHeaders(headers: Headers): PreprHeaders {
  return getPreprHeadersFromHeaders(headers);
}

/**
 * Props needed to mount `PreprToolbar.svelte`, from `event.request.headers`
 * plus a Prepr GraphQL token. Ungated — gate on preview mode yourself in
 * `+layout.server.ts`.
 */
export async function getToolbarProps(
  headers: Headers,
  token: string
): Promise<PreprToolbarProps> {
  return getToolbarPropsFromHeaders(headers, token);
}
