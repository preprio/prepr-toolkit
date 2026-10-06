import type { NextRequest } from 'next/server';
import {
  createPreprMiddleware,
  resolvePreprBucket,
} from '@preprio/toolkit/nextjs';
import { preprFeatures } from '@/prepr-features';
import { preprGraphqlUrl } from '@/prepr-env';
import { prepr } from '@/prepr-client';
import { GetPageBySlugDocument } from '@/gql/graphql';

export async function proxy(request: NextRequest) {
  const preview = process.env.NODE_ENV !== 'production';
  const response = createPreprMiddleware(request, {
    preview,
    features: preprFeatures,
  });

  // The visitor's A/B bucket, asked from Prepr once and kept in a cookie, and
  // only on pages that have an A/B test. PreprStack reads it in the browser
  // to show the right A/B variant before first paint.
  const slug = request.nextUrl.pathname.replace(/^\/+|\/+$/g, '') || '/';
  await resolvePreprBucket(request, response, {
    url: preprGraphqlUrl(),
    preview,
    onlyIf: () => prepr().hasAbTests(GetPageBySlugDocument, { slug }),
  });

  return response;
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
