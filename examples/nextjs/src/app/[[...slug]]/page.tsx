// Import the client wrapper that renders the sections with live-edit wiring
import PageContent from '@/components/page-content';
import { prepr } from '@/prepr-client';
import { GetPageBySlugDocument } from '@/gql/graphql';
import { notFound } from 'next/navigation';

async function getData(slug: string) {
  // personalize: true forwards this visitor's segment / A-B headers and keeps
  // the response out of the Data Cache; the route renders per request.
  const { data } = await prepr().query(
    GetPageBySlugDocument,
    { slug },
    { personalize: true },
  );

  if (!data.Page) {
    return notFound();
  }

  return data;
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string | string[] }>;
}) {
  let { slug } = await params;

  // Set the slug to the home page value if there's no slug
  if (!slug) {
    slug = '/';
  }

  // Add a forward slash to the slug to navigate to the correct page.
  if (slug instanceof Array) {
    slug = slug.join('/');
  }

  const data = await getData(slug);

  return (
    <div>
      <meta property="prepr:id" content={data.Page?._id} />
      {data.Page && <PageContent page={data.Page} />}
    </div>
  );
}
