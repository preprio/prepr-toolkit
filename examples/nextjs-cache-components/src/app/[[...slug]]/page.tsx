import { cache, Suspense } from 'react';
import { notFound } from 'next/navigation';
import EditorBridge from '@/components/editor-bridge';
import Sections from '@/components/sections';
import { isPreview, prepr } from '@/prepr-client';
import { GetPageBySlugDocument } from '@/gql/graphql';
import { groupOf, toBlocks } from '@/lib/personalization';

/**
 * Headerless, so the response is the same for every visitor and can be
 * cached. Prepr's `personalized` verdict is cached with the data.
 *
 * No cacheTag() needed: the client tags its fetch 'prepr', and that tag
 * carries over to this entry, so revalidateTag('prepr') from a publish
 * webhook refreshes it.
 */
async function getPage(slug: string) {
  'use cache';
  return prepr().query(GetPageBySlugDocument, { slug });
}

/**
 * The visitor's own version of the page: one query per request, shared by
 * every personalization group on the page through React's request cache.
 */
const getPersonalizedPage = cache((slug: string) =>
  prepr().query(GetPageBySlugDocument, { slug }, { personalize: true }),
);

/**
 * One personalization group, as this visitor sees it. A visitor can be in
 * several segments, so each group resolves its own variant: one section can
 * target small companies while another targets a specific company.
 */
async function PersonalizedGroup({
  slug,
  groupId,
}: {
  slug: string;
  groupId: string;
}) {
  const { data } = await getPersonalizedPage(slug);
  const elements =
    data.Page?.content.filter((element) => groupOf(element) === groupId) ?? [];
  return <Sections elements={elements} />;
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

  // Only personalization groups render per visitor; the rest of the page is
  // the cached shell. Each group's default variant is its static fallback.
  // A group whose default variant is empty does not appear in the cached
  // result, so it cannot get a boundary here: give every group a default.
  return (
    <div>
      <meta property="prepr:id" content={data.Page._id} />
      {/* Serializes the whole page for the editor; preview only. */}
      {isPreview && <EditorBridge page={data.Page} />}
      {toBlocks(data.Page.content).map((block, index) =>
        block.groupId && personalized ? (
          <Suspense
            key={block.groupId}
            fallback={<Sections elements={block.elements} />}
          >
            <PersonalizedGroup slug={path} groupId={block.groupId} />
          </Suspense>
        ) : (
          <Sections key={`static-${index}`} elements={block.elements} />
        ),
      )}
    </div>
  );
}
