import {
  createEventClient,
  type PreprClientOptions,
  type PreprEventClient,
} from '../core/graphql';
import { getPreprHeadersFromLocals } from './hooks';

/**
 * The part of a SvelteKit `RequestEvent` or load event the client reads.
 * `locals` is typed `object` so SvelteKit's `App.Locals` interface fits.
 */
export interface PreprSvelteKitEvent {
  request: Request;
  locals?: object;
  fetch?: typeof fetch;
}

/**
 * Prepr GraphQL client for SvelteKit. Pass the load or endpoint event as
 * `event`: its `fetch` is used for every request, so SvelteKit can dedupe
 * and serialize it. With `personalize: true`, the Prepr headers
 * `preprHandle` computed are forwarded.
 *
 * Requires the `graphql` package, which graphql-codegen already installs.
 */
export function createPreprClient(
  options: PreprClientOptions,
): PreprEventClient<PreprSvelteKitEvent> {
  return createEventClient<PreprSvelteKitEvent>(options, {
    headers: (event) => {
      const fromLocals = getPreprHeadersFromLocals(
        (event.locals ?? {}) as Record<string, unknown>,
      );
      // Empty means preprHandle did not mirror into locals; the forwarded
      // headers are still on the request itself.
      return [...fromLocals.keys()].length > 0
        ? fromLocals
        : event.request.headers;
    },
    fetch: (event) => event.fetch,
  });
}

export { isPersonalizedResponse } from '../core/personalization';
export { PreprError } from '../core/server';
export type {
  PreprClientOptions,
  PreprDecideOptions,
  PreprDocument,
  PreprEventClient,
  PreprEventQueryOptions,
  PreprQueryResult,
  PreprStegaMode,
} from '../core/graphql';
export {
  PREPR_DEFAULT_VARIANT,
  resolveVariants,
  splitStack,
  type PreprDecisions,
  type PreprStackBlock,
  type ResolveVariantsOptions,
} from '../core/variants';
