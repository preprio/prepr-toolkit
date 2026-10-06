import { notFound } from 'next/navigation';
import { PreprStack } from '@preprio/toolkit/nextjs/graphql';
import EditorBridge from '@/components/editor-bridge';
import Sections from '@/components/sections';
import { isPreview, prepr } from '@/prepr-client';
import { GetPageBySlugDocument } from '@/gql/graphql';

/**
 * Every variant of every personalization and A/B group (`variants: true`):
 * the same for every visitor, so it is cached. The client rewrites the query
 * itself, and its 'prepr' fetch tag carries over to this entry, so
 * revalidateTag('prepr') refreshes it.
 */
async function getPage(slug: string) {
  'use cache';
  const { data } = await prepr().query(
    GetPageBySlugDocument,
    { slug },
    { variants: true },
  );
  return data.Page;
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

  const page = await getPage(slug);
  if (!page) notFound();

  return (
    <div>
      <meta property="prepr:id" content={page._id} />
      {/* Serializes the whole page for the editor; preview only. */}
      {isPreview && <EditorBridge page={page} />}
      {/* Static: everything that never varies, and A/B tests (both variants;
          the visitor's bucket is shown before first paint). Streamed per
          group: this visitor's segment variants. */}
      <PreprStack
        items={page.content}
        decisions={prepr().decide(GetPageBySlugDocument, { slug })}
        render={(elements) => <Sections elements={elements} />}
      />
    </div>
  );
}
