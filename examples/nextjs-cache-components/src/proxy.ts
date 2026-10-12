import type { NextRequest } from 'next/server';
import { createPreprProxy } from '@preprio/toolkit/nextjs/graphql';
import { preprFeatures } from '@/prepr-features';
import { prepr, isPreview } from '@/prepr-client';
import { GetPageBySlugDocument } from '@/gql/graphql';

let handlePrepr: ReturnType<typeof createPreprProxy> | undefined;

// The visitor's Prepr headers, the draft-mode redirect in preview, the A/B
// bucket and the segment variants at the top of each page, in one call. Made
// on first request: the client needs the GraphQL URL, which `next build`
// does not have.
export function proxy(request: NextRequest) {
  handlePrepr ??= createPreprProxy({
    client: prepr(),
    page: (url) => ({
      document: GetPageBySlugDocument,
      variables: { slug: url.pathname.replace(/^\/+|\/+$/g, '') || '/' },
    }),
    preview: isPreview,
    features: preprFeatures,
  });
  return handlePrepr(request);
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
