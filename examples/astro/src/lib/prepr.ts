import { getPreprHeaders } from '@preprio/toolkit/astro';

const PREPR_GRAPHQL_URL = import.meta.env.PREPR_GRAPHQL_URL;

if (!PREPR_GRAPHQL_URL) {
  throw new Error(
    'PREPR_GRAPHQL_URL is not set. Copy .env.example to .env and add your Prepr ' +
      'GraphQL endpoint (Settings > Access tokens > GraphQL).',
  );
}

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
