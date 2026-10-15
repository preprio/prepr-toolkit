export {
  createPreprMiddleware,
  type PreprMiddlewareOptions,
} from './middleware';

export {
  getActiveSegment,
  getActiveVariant,
  getPreprHeaders,
  getPreprUUID,
  getToolbarProps,
} from './server';

// The GraphQL client is on `@preprio/toolkit/nextjs/graphql`; this helper
// needs no `graphql` package and serves projects with their own client.
export { isPersonalizedResponse } from '../core/personalization';

export {
  resolvePreprBucket,
  PREPR_BUCKET_COOKIE,
  type PreprBucket,
  type ResolvePreprBucketOptions,
} from './bucket';

export {
  createPreprDraftRoute,
  preprDraftRedirect,
  type PreprDraftOptions,
} from './draft';

export { createPreprWebhookRoute, type PreprWebhookOptions } from './webhook';

export {
  validatePreprToken,
  extractAccessToken,
  PreprError,
} from '../core/server';

// 'use client' components
export {
  PreprPersonalizationSwitch,
  PreprToolbar,
  PreprTrackingPixel,
  type PreprTrackingPixelProps,
} from './components';
