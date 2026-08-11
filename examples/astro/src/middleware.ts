import { onPreprRequest } from '@preprio/toolkit/astro';
import type { MiddlewareHandler } from 'astro';
import { preprFeatures } from './lib/prepr-features';

// `astro dev` loads .env into `import.meta.env` (Vite) only — NOT process.env.
// The toolkit no longer reads env vars, so only the GraphQL URL needs bridging
// for server code that reads it from process.env. `??=` never clobbers a real
// value set by the deployment host.
process.env.PREPR_GRAPHQL_URL ??= import.meta.env.PREPR_GRAPHQL_URL;

// Astro's middleware signature is `(context, next)`. `onPreprRequest` takes
// exactly that plus options, so we can forward straight through.
//
// `preview` is the only gate — the toolkit reads no env vars of its own. This
// starter uses Vite's built-in DEV flag; use whatever signal your deployment
// already has. When on, request headers (Prepr-Segments, etc.) are forwarded
// downstream and preview cookies set on the response.
export const onRequest: MiddlewareHandler = (context, next) =>
  onPreprRequest(context, next, {
    preview: import.meta.env.DEV,
    features: preprFeatures,
  });
