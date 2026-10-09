import {
  createEventClient,
  type PreprClientOptions,
  type PreprEventClient,
} from '../core/graphql';
import { getPreprHeadersFromEvent, type H3EventLike } from './middleware';

/** The part of an h3 event the client reads. */
export type PreprNuxtEvent = Pick<H3EventLike, 'context'>;

/**
 * Prepr GraphQL client for Nuxt. Pass the h3 event as `event` together with
 * `personalize: true` to forward the visitor's Prepr headers.
 *
 * Run personalized queries where the event exists, such as server routes.
 * During client-side navigation there is no event, and `personalize: true`
 * throws `CONTEXT_ERROR` instead of silently returning the default variant.
 *
 * Requires the `graphql` package, which graphql-codegen already installs.
 */
export function createPreprClient(
  options: PreprClientOptions,
): PreprEventClient<PreprNuxtEvent> {
  return createEventClient<PreprNuxtEvent>(options, {
    headers: getPreprHeadersFromEvent,
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
  preprVariantProps,
  decisionsFrom,
  resolveVariants,
  toDecisionQuery,
  toVariantsQuery,
  type PreprSchema,
  splitStack,
  type PreprDecisions,
  type PreprStackBlock,
  type PreprVariantProps,
  type ResolveVariantsOptions,
} from '../core/variants';
export { loadPreprSchema } from '../core/graphql';
