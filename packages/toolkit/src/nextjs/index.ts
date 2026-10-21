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
  normalizeQuery,
  type NextNormalizeQueryOptions,
} from './server';

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

// Live preview's client side lives only in `@preprio/toolkit/nextjs/live`:
// re-exporting it here would put its server action into every build that
// imports this entry point, live preview or not.
export type {
  LivePreviewConfig,
  PreprRefreshProps,
  UseLiveOptions,
} from './live';
export type { LiveFetcher } from '../core/live-preview';
