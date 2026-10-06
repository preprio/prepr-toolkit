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

// src/proxy.ts rewrites every page to /ab/<bucket>/<slug>, with the visitor's
// A/B bucket from Prepr. Prerender the home page for both buckets.
export function generateStaticParams() {
  return [
    { bucket: 'A', slug: [] },
    { bucket: 'B', slug: [] },
  ];
}

export default async function Page({
  params,
}: {
  params: Promise<{ bucket: string; slug?: string[] }>;
}) {
  const { bucket, slug: segments } = await params;
  const slug = segments?.join('/') || '/';

  const page = await getPage(slug);
  if (!page) notFound();

  return (
    <div>
      <meta property="prepr:id" content={page._id} />
      {/* Serializes the whole page for the editor; preview only. */}
      {isPreview && <EditorBridge page={page} />}
      {/* Static: everything that never varies, and A/B tests (from the
          bucket). Streamed per group: this visitor's segment variants. */}
      <PreprStack
        items={page.content}
        decisions={prepr().decide(GetPageBySlugDocument, { slug })}
        bucket={bucket}
        render={(elements) => <Sections elements={elements} />}
      />
    </div>
  );
}
