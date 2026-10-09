import {
  createEventClient,
  type PreprClientOptions,
  type PreprEventClient,
} from '../core/graphql';
import type { AstroLikeContext } from './index';

/**
 * Prepr GraphQL client for Astro. Pass `Astro` (in a page or component) or
 * the endpoint or middleware context as `event`. With `personalize: true`,
 * the Prepr headers `onPreprRequest` set on the request are forwarded.
 *
 * Requires the `graphql` package, which graphql-codegen already installs.
 */
export function createPreprClient(
  options: PreprClientOptions,
): PreprEventClient<AstroLikeContext> {
  return createEventClient<AstroLikeContext>(options, {
    headers: (event) => event.request.headers,
  });
}

export { isPersonalizedResponse } from '../core/personalization';
export { PreprError } from '../core/server';
export type { AstroLikeContext } from './index';
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
