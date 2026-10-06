import { NextResponse, type NextRequest } from 'next/server';
import {
  createPreprMiddleware,
  resolvePreprBucket,
} from '@preprio/toolkit/nextjs';
import { preprFeatures } from '@/prepr-features';
import { preprGraphqlUrl } from '@/prepr-env';

const AB_SEGMENT = 'ab';

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
  // The visitor's A/B bucket: asked from Prepr once, then kept in a cookie.
  const bucket = await resolvePreprBucket(request, response, {
    url: preprGraphqlUrl(),
    preview,
  });
  const target = new URL(request.url);
  target.pathname = ['', AB_SEGMENT, bucket, first, ...rest]
    .filter((part, i) => i === 0 || part)
    .join('/');
  response.headers.set('x-middleware-rewrite', target.toString());
  response.headers.delete('x-middleware-next');
  return response;
}

export const config = {
  // Pages only: assets, files and Next internals must not be rewritten into
  // the page route.
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
