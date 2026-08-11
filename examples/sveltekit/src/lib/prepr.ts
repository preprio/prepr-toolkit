// Imported from both server load functions and `+layout.svelte`, so this module
// must stay free of server-only imports. The URL is injected at build time from
// PUBLIC_PREPR_GRAPHQL_URL — never hardcode a token here, it ships to the browser.
import { PUBLIC_PREPR_GRAPHQL_URL } from '$env/static/public';
import type { PreprFeatures } from '@preprio/toolkit';

/**
 * One config, passed to both `hooks.server.ts` and the toolbar component, so a
 * disabled feature is off everywhere: no UI, no cookies, no headers.
 *
 * Everything is on by default. Turn a feature off to remove it app-wide:
 *
 *   segments: false,
 *   abTesting: false,
 *   editMode: { enabled: false },
 */
export const preprFeatures: PreprFeatures = {};

if (!PUBLIC_PREPR_GRAPHQL_URL) {
  throw new Error(
    'PUBLIC_PREPR_GRAPHQL_URL is not set. Copy .env.example to .env and add your ' +
      'Prepr GraphQL endpoint (Settings > Access tokens > GraphQL).',
  );
}

export const PREPR_GRAPHQL_URL = PUBLIC_PREPR_GRAPHQL_URL;
