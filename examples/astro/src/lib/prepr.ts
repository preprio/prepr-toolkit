import { getPreprHeaders } from '@preprio/toolkit/astro';

const PREPR_GRAPHQL_URL =
  import.meta.env.PREPR_GRAPHQL_URL ||
  'https://graphql.prepr.io/ac_5e48636ec968b4fe9b7490b0fc4f7702e51873418ae2acbc58c6431d9fe27429';

// Forward the Prepr request headers (segments / A-B variant / customer id)
// so the GraphQL response is personalized for this request.
export async function Prepr(
  query: string,
  variables: Record<string, unknown>,
  headers: Headers,
): Promise<Response> {
  return fetch(PREPR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getPreprHeaders(headers) as Record<string, string>),
    },
    body: JSON.stringify({ query, variables }),
  });
}

export { PREPR_GRAPHQL_URL };
