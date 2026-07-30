import { headers } from 'next/headers';

import {
  getActiveSegmentFromHeaders,
  getActiveVariantFromHeaders,
  getPreprHeadersFromHeaders,
  getPreprUUIDFromHeaders,
  getToolbarPropsFromHeaders,
} from '../core/server';
import type { PreprHeaders, PreprToolbarProps } from '../core/types';

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
export async function getToolbarProps(token: string): Promise<PreprToolbarProps> {
  const h = await readHeaders();
  return getToolbarPropsFromHeaders(h, token);
}
