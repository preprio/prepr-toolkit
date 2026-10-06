// The GraphQL client lives on its own entry point because it imports the
// `graphql` package, an optional peer. Keeping it out of the main entry means
// projects that only use the toolbar never need `graphql` installed.
export {
  createPreprClient,
  type PreprClient,
  type PreprClientOptions,
  type PreprDecideOptions,
  type PreprDocument,
  type PreprQueryOptions,
  type PreprQueryResult,
  type PreprStegaMode,
} from './core/graphql';
export { isPersonalizedResponse } from './core/personalization';
// Re-exported so `instanceof` checks use the same class the client throws:
// CommonJS entry points do not share module instances.
export { PreprError } from './core/server';
export type { PreprErrorCode, PreprHeaders } from './core/types';
export {
  PREPR_DEFAULT_VARIANT,
  preprVariantProps,
  resolveVariants,
  splitStack,
  type PreprDecisions,
  type PreprStackBlock,
  type PreprVariantProps,
  type ResolveVariantsOptions,
} from './core/variants';
