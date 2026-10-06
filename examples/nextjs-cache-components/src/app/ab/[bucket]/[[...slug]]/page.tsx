import { cache, Suspense } from 'react';
import { notFound } from 'next/navigation';
import EditorBridge from '@/components/editor-bridge';
import Sections from '@/components/sections';
import { isPreview, prepr } from '@/prepr-client';
import {
  GetPageDecisionDocument,
  GetPageVariantsDocument,
} from '@/gql/graphql';
import {
  DEFAULT_VARIANT,
  decisionsByGroup,
  pickVariants,
  toBlocks,
  type VariantElement,
} from '@/lib/personalization';

/**
 * Every variant of every group (`personalize: false`): the same for every
 * visitor, so it is cached. The client tags the fetch 'prepr', and that tag
 * carries over to this entry, so revalidateTag('prepr') refreshes it.
 *
 * Fetching all variants (not the default) is what lets a group that shows
 * nothing to "all other users" still get a place on the page.
 */
async function getPageVariants(slug: string) {
  'use cache';
  const { data } = await prepr().query(GetPageVariantsDocument, { slug });
  return data.Page;
}

/**
 * Which variant of each group this visitor gets: ids only, so tiny. Prepr
 * decides from every forwarded signal (customer profile, UTM, IP, HubSpot),
 * and one query per request serves every group via React's request cache.
 */
const getDecisions = cache(async (slug: string) => {
  const { data } = await prepr().query(
    GetPageDecisionDocument,
    { slug },
    { personalize: true },
  );
  return decisionsByGroup(data.Page?.content ?? []);
});

async function PersonalizedGroup({
  slug,
  groupId,
  elements,
}: {
  slug: string;
  groupId: string;
  elements: VariantElement[];
}) {
  const decisions = await getDecisions(slug);
  const chosen = decisions.get(groupId) ?? [DEFAULT_VARIANT];
  return <Sections elements={pickVariants(elements, chosen)} />;
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

  const page = await getPageVariants(slug);
  if (!page) notFound();

  return (
    <div>
      <meta property="prepr:id" content={page._id} />
      {/* Serializes the whole page for the editor; preview only. */}
      {isPreview && <EditorBridge page={page} />}
      {toBlocks(page.content).map((block, index) => {
        if (block.kind === 'plain') {
          return <Sections key={`plain-${index}`} elements={block.elements} />;
        }
        // A/B tests resolve from the bucket in the URL: part of the
        // prerendered page, never streamed, so no variant swaps in.
        if (block.kind === 'AB_TEST') {
          return (
            <Sections
              key={block.groupId}
              elements={pickVariants(block.elements, [bucket])}
            />
          );
        }
        // Segment personalization streams in per group. The fallback is the
        // default variant, which may be empty.
        return (
          <Suspense
            key={block.groupId}
            fallback={
              <Sections
                elements={pickVariants(block.elements, [DEFAULT_VARIANT])}
              />
            }
          >
            <PersonalizedGroup
              slug={slug}
              groupId={block.groupId}
              elements={block.elements}
            />
          </Suspense>
        );
      })}
    </div>
  );
}
