import { notFound } from 'next/navigation';
import { PreprStack } from '@preprio/toolkit/nextjs/graphql';
import EditorBridge from '@/components/editor-bridge';
import Sections from '@/components/sections';
import { isPreview, prepr } from '@/prepr-client';
import { GetPageBySlugDocument } from '@/gql/graphql';

/**
 * Every variant of every personalization and A/B group (`variants: true`):
 * the same for every visitor, so it is cached. The client rewrites the query
 * itself. `tagItems` tags this entry with every item it holds, so the publish
 * webhook (/api/prepr/webhook) refreshes only pages showing a changed item;
 * revalidateTag('prepr') still refreshes everything.
 */
async function getPage(slug: string) {
  'use cache';
  const { data } = await prepr().query(
    GetPageBySlugDocument,
    { slug },
    { variants: true, tagItems: true },
  );
  return data;
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
  const { slug: segments } = await params;
  const slug = segments?.join('/') || '/';

  const data = await getPage(slug);
  const page = data.Page;
  if (!page) notFound();

  return (
    <div>
      <meta property="prepr:id" content={page._id} />
      {/* Serializes the whole page for the editor; preview only. */}
      {isPreview && <EditorBridge page={page} />}
      {/* All prerendered: every variant of each A/B test and segment
          group. This page view's decision (from proxy.ts, or requested on a
          link press) shows the visitor's variant before first paint. */}
      <PreprStack
        items={page.content}
        render={(elements) => <Sections elements={elements} />}
      />
    </div>
  );
}
