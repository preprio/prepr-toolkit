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
  validatePreprToken,
  extractAccessToken,
  PreprError,
} from '../core/server';

// 'use client' components
export {
  PreprToolbar,
  PreprTrackingPixel,
  type PreprTrackingPixelProps,
} from './components';
