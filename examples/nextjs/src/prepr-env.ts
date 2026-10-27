/**
 * The preview flag: gates the middleware, the toolbar and live preview. The
 * toolkit reads no env vars of its own — you decide what "preview" means.
 * This starter uses NODE_ENV; on Vercel `process.env.VERCEL_ENV !== 'production'`
 * is the usual choice, or use your own flag.
 */
export const isPreview = process.env.NODE_ENV !== 'production';

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
