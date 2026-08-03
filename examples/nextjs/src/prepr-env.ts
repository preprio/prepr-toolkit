/**
 * Single source for the Prepr GraphQL endpoint.
 *
 * Server-only: `PREPR_GRAPHQL_URL` carries an access token, so it must not be
 * exposed with a `NEXT_PUBLIC_` prefix. Throws rather than falling back to a
 * literal — a hardcoded token is how one ends up committed.
 */
export function preprGraphqlUrl(): string {
  const url = process.env.PREPR_GRAPHQL_URL;
  if (!url) {
    throw new Error(
      'PREPR_GRAPHQL_URL is not set. Copy .env.example to .env.local and add your ' +
        'Prepr GraphQL endpoint (Settings > Access tokens > GraphQL).',
    );
  }
  return url;
}
