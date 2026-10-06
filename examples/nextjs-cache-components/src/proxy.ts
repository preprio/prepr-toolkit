import type { NextRequest } from 'next/server';
import {
  createPreprMiddleware,
  resolvePreprBucket,
} from '@preprio/toolkit/nextjs';
import { preprFeatures } from '@/prepr-features';
import { preprGraphqlUrl } from '@/prepr-env';

export async function proxy(request: NextRequest) {
  const preview = process.env.NODE_ENV !== 'production';
  const response = createPreprMiddleware(request, {
    preview,
    features: preprFeatures,
  });

  // The visitor's A/B bucket, asked from Prepr once and kept in a cookie.
  // PreprStack reads it in the browser to show the right A/B variant before
  // first paint. Sites without A/B tests can drop this line.
  await resolvePreprBucket(request, response, {
    url: preprGraphqlUrl(),
    preview,
  });

  return response;
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
