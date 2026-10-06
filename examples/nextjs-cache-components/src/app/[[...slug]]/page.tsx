import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import PageContent from '@/components/page-content';
import { prepr } from '@/prepr-client';
import { GetPageBySlugDocument } from '@/gql/graphql';

/**
 * Headerless, so the response is the same for every visitor and can be
 * cached. Prepr's `personalized` verdict is cached with the data: it tells
 * the page, at prerender time, whether any part of it varies per visitor.
 *
 * No cacheTag() needed: the client tags its fetch 'prepr', and that tag
 * carries over to this entry, so revalidateTag('prepr') from a publish
 * webhook refreshes it.
 */
async function getPage(slug: string) {
  'use cache';
  return prepr().query(GetPageBySlugDocument, { slug });
}

/** Per-visitor render: forwards the segment / A-B headers, never cached. */
async function PersonalizedPage({ slug }: { slug: string }) {
  const { data } = await prepr().query(
    GetPageBySlugDocument,
    { slug },
    { personalize: true },
  );
  if (!data.Page) notFound();
  return <PageContent page={data.Page} />;
}

// Prerender the home page; other slugs render on first request.
export function generateStaticParams() {
  return [{ slug: [] }];
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const path = slug?.join('/') || '/';

  const { data, personalized } = await getPage(path);
  if (!data.Page) notFound();

  return (
    <div>
      <meta property="prepr:id" content={data.Page._id} />
      {personalized ? (
        // The default variant is the static fallback; this visitor's variant
        // streams in over it.
        <Suspense fallback={<PageContent page={data.Page} />}>
          <PersonalizedPage slug={path} />
        </Suspense>
      ) : (
        <PageContent page={data.Page} />
      )}
    </div>
  );
}
