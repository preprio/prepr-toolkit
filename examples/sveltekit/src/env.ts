import { defineEnvVars } from '@sveltejs/kit/env';

// Explicit environment variables (SvelteKit 3), imported via `$app/env/private`
// and `$app/env/public`. Both are dynamic (read at runtime, not inlined) and
// optional, so `build` and `typecheck` work without a local `.env` — the
// missing-endpoint error is thrown lazily by `preprGraphqlUrl()` instead.
export const variables = defineEnvVars({
  PREPR_GRAPHQL_URL: {
    description: 'Server-only GraphQL endpoint override.',
    schema: (value) => value,
  },
  PUBLIC_PREPR_GRAPHQL_URL: {
    description: 'Prepr GraphQL endpoint, including the access token.',
    public: true,
    schema: (value) => value,
  },
});
