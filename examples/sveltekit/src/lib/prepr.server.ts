import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import {
  createPreprClient,
  type PreprEventClient,
  type PreprSvelteKitEvent,
} from '@preprio/toolkit/sveltekit/graphql';
import { preprGraphqlUrl } from './prepr';

// The `.server.ts` suffix keeps `$env/dynamic/private` out of the client bundle —
// SvelteKit fails the build if this module is ever reached from browser code.

/** GraphQL endpoint, overridable per deployment. */
export const graphqlUrl = () => env.PREPR_GRAPHQL_URL || preprGraphqlUrl();

let client: PreprEventClient<PreprSvelteKitEvent> | undefined;

/**
 * Created on first use, so builds without a `.env` still succeed. `preview`
 * matches `preprHandle`'s flag (hooks.server.ts): it keeps stega markers in
 * text so the toolbar's click-to-edit works.
 */
export function prepr(): PreprEventClient<PreprSvelteKitEvent> {
  return (client ??= createPreprClient({ url: graphqlUrl(), preview: dev }));
}
