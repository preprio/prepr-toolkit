import type { NextRequest, NextResponse } from 'next/server';

import { COOKIE_UID, COOKIE_VARIANT } from '../core/constants';

/** Cookie holding the visitor's A/B bucket, as Prepr assigned it. */
export const PREPR_BUCKET_COOKIE = 'prepr_ab_bucket';

export type PreprBucket = 'A' | 'B';

const isBucket = (value: string | undefined | null): value is PreprBucket =>
  value === 'A' || value === 'B';

export interface ResolvePreprBucketOptions {
  /** Full Prepr GraphQL URL. */
  url: string;
  /** Preview mode: the toolbar's A/B override wins. */
  preview?: boolean;
  /** Abort the one-time lookup after this many ms. Default 1500. */
  timeoutMs?: number;
}

/**
 * The visitor's A/B bucket, for prerendering A/B tests per bucket instead of
 * streaming the variant in.
 *
 * Prepr assigns each visitor one bucket and reports it in the
 * `x-prepr-customer-bucket` response header. The first time a visitor is
 * seen, this asks Prepr once (a minimal query with their customer id) and
 * stores the answer in {@link PREPR_BUCKET_COOKIE} on `response`; later
 * requests read the cookie. Call it in middleware after
 * `createPreprMiddleware`, which mints the customer id, then put the bucket
 * in the rewritten URL so the page receives it as a route parameter.
 *
 * Never throws: if the lookup fails the visitor gets `A` (Prepr's default for
 * anonymous visitors) and the lookup is retried on the next request.
 */
export async function resolvePreprBucket(
  request: NextRequest,
  response: NextResponse,
  options: ResolvePreprBucketOptions,
): Promise<PreprBucket> {
  const forced = request.cookies.get(COOKIE_VARIANT)?.value;
  if (options.preview && isBucket(forced)) return forced;

  const stored = request.cookies.get(PREPR_BUCKET_COOKIE)?.value;
  if (isBucket(stored)) return stored;

  const customerId =
    request.cookies.get(COOKIE_UID)?.value ??
    response.cookies.get(COOKIE_UID)?.value;
  if (!customerId) return 'A';

  try {
    const res = await fetch(options.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prepr-Customer-Id': customerId,
      },
      body: JSON.stringify({ query: '{ __typename }' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs ?? 1500),
    });
    const bucket = res.headers.get('x-prepr-customer-bucket');
    if (isBucket(bucket)) {
      response.cookies.set(PREPR_BUCKET_COOKIE, bucket, {
        path: '/',
        sameSite: 'lax',
        httpOnly: true,
        secure: request.nextUrl.protocol === 'https:',
        maxAge: 60 * 60 * 24 * 365,
      });
      return bucket;
    }
  } catch {
    // Fall through to the anonymous default.
  }
  return 'A';
}
