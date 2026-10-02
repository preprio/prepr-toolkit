import { createPreprClient } from '@preprio/toolkit/astro/graphql';

const PREPR_GRAPHQL_URL = import.meta.env.PREPR_GRAPHQL_URL;

if (!PREPR_GRAPHQL_URL) {
  throw new Error(
    'PREPR_GRAPHQL_URL is not set. Copy .env.example to .env and add your Prepr ' +
      'GraphQL endpoint (Settings > Access tokens > GraphQL).',
  );
}

// One client for the whole site. Pass `{ personalize: true, event: Astro }`
// per query to forward this visitor's segment / A-B headers.
export const prepr = createPreprClient({ url: PREPR_GRAPHQL_URL });

export { PREPR_GRAPHQL_URL };
