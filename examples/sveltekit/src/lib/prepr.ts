// Imported from both server load functions and `+layout.svelte`, so this module
// must stay free of server-only imports. Never hardcode a token here — this
// value ships to the browser, so use a scoped read-only token with only the
// "Enable edit mode" / GraphQL read permissions.
//
// `$env/dynamic/public` rather than `$env/static/public`: the static form only
// generates a typed export for variables that exist at build time, so a build
// or typecheck without a local `.env` fails to compile. The dynamic form reads
// at runtime and always typechecks, which is what CI needs.
import { env } from '$env/dynamic/public';
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

/**
 * Prepr GraphQL endpoint. Throws when unset — lazily, so importing this module
 * (during typecheck, build, or SSR of a page that never calls it) does not.
 */
export function preprGraphqlUrl(): string {
  const url = env.PUBLIC_PREPR_GRAPHQL_URL;
  if (!url) {
    throw new Error(
      'PUBLIC_PREPR_GRAPHQL_URL is not set. Copy .env.example to .env and add ' +
        'your Prepr GraphQL endpoint (Settings > Access tokens > GraphQL).',
    );
  }
  return url;
}
