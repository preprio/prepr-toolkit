import { env } from '$env/dynamic/private';
import { getPreprHeaders } from '@preprio/toolkit/sveltekit';
import { PREPR_GRAPHQL_URL } from './prepr';

// The `.server.ts` suffix keeps `$env/dynamic/private` out of the client bundle —
// SvelteKit fails the build if this module is ever reached from browser code.

/** GraphQL endpoint, overridable per deployment. */
export const graphqlUrl = () => env.PREPR_GRAPHQL_URL || PREPR_GRAPHQL_URL;

// Forward the Prepr request headers (segments / A-B variant / customer id) so
// the GraphQL response is personalized for this request.
export async function Prepr(
  query: string,
  variables: Record<string, unknown>,
  headers: Headers
): Promise<Response> {
  return fetch(graphqlUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getPreprHeaders(headers) as Record<string, string>),
    },
    body: JSON.stringify({ query, variables }),
  });
}
