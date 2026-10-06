import { NextResponse, type NextRequest } from 'next/server';
import { createPreprMiddleware } from '@preprio/toolkit/nextjs';
import { preprFeatures } from '@/prepr-features';
import { preprGraphqlUrl } from '@/prepr-env';

const BUCKET_COOKIE = 'prepr_ab_bucket';
const AB_SEGMENT = 'ab';

type Bucket = 'A' | 'B';
const isBucket = (value: string | undefined): value is Bucket =>
  value === 'A' || value === 'B';

/**
 * The visitor's A/B bucket, as Prepr assigns it: one bucket per visitor,
 * applied to every 50/50 test. Learned once from Prepr's
 * `x-prepr-customer-bucket` header and kept in a cookie, so pages prerender
 * both buckets and pick one without streaming the variant in.
 */
async function resolveBucket(
  request: NextRequest,
  response: NextResponse,
  preview: boolean,
): Promise<Bucket> {
  // In preview the toolbar can force a variant.
  const forced = request.cookies.get('Prepr-ABtesting')?.value;
  if (preview && isBucket(forced)) return forced;

  const stored = request.cookies.get(BUCKET_COOKIE)?.value;
  if (isBucket(stored)) return stored;

  const customerId =
    request.cookies.get('__prepr_uid')?.value ??
    response.cookies.get('__prepr_uid')?.value;
  if (!customerId) return 'A';

  try {
    const res = await fetch(preprGraphqlUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Prepr-Customer-Id': customerId,
      },
      body: JSON.stringify({ query: '{ __typename }' }),
      signal: AbortSignal.timeout(1500),
    });
    const bucket = res.headers.get('x-prepr-customer-bucket') ?? undefined;
    if (isBucket(bucket)) {
      response.cookies.set(BUCKET_COOKIE, bucket, {
        path: '/',
        sameSite: 'lax',
        httpOnly: true,
        secure: request.nextUrl.protocol === 'https:',
        maxAge: 60 * 60 * 24 * 365,
      });
      return bucket;
    }
  } catch {
    // Anonymous visitors get A; the lookup is retried on the next request.
  }
  return 'A';
}

export async function proxy(request: NextRequest) {
  const preview = process.env.NODE_ENV !== 'production';
  const response = createPreprMiddleware(request, {
    preview,
    features: preprFeatures,
  });

  const [, first, ...rest] = request.nextUrl.pathname.split('/');
  if (first === AB_SEGMENT) {
    // Internal route: redirect direct hits to the public URL.
    const publicPath = ['', ...rest.slice(1)].join('/') || '/';
    return NextResponse.redirect(new URL(publicPath, request.url), 308);
  }

  // Pages render from /ab/<bucket>/<slug>, so both buckets can be cached.
  const bucket = await resolveBucket(request, response, preview);
  const target = new URL(request.url);
  target.pathname = ['', AB_SEGMENT, bucket, first, ...rest]
    .filter((part, i) => i === 0 || part)
    .join('/');
  response.headers.set('x-middleware-rewrite', target.toString());
  response.headers.delete('x-middleware-next');
  return response;
}
