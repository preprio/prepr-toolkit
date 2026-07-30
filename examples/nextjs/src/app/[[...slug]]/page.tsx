// Import the client wrapper that renders the sections with live-edit wiring
import PageContent from "@/components/page-content";
import {getClient} from "@/apollo-client";
import {GetPageBySlugDocument, GetPageBySlugQuery} from "@/gql/graphql";
import {notFound} from "next/navigation";
import { getPreprHeaders } from '@preprio/toolkit/nextjs'

export const revalidate = 0
export const dynamic = 'force-dynamic'

async function getData(slug: string) {
  const {data} = await getClient().query<GetPageBySlugQuery>({
    query: GetPageBySlugDocument,
    variables: {
      slug: slug,
    },
    context: {
      // Call the getPreprHeaders function to get the appropriate headers
      headers: await getPreprHeaders()
    },
    fetchPolicy: 'no-cache',
  })

  if (!data?.Page) {
    return notFound()
  }

  return data
}

export default async function Page({ params}: {params: Promise<{ slug: string | string[]}>})
{
  let { slug} = await params

  // Set the slug to the home page value if there's no slug
  if (!slug) {
    slug = '/'
  }

  // Add a forward slash to the slug to navigate to the correct page.
  if (slug instanceof Array) {
    slug = slug.join('/')
  }

  const data = await getData(slug)

  return (
    <div>
      <meta property='prepr:id' content={data.Page?._id}/>
      {data.Page && <PageContent page={data.Page}/>}
    </div>
  );
}