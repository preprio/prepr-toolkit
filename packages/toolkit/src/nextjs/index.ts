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

// 'use client' live preview
export {
  initLivePreview,
  PreprRefresh,
  useLive,
  type LivePreviewConfig,
  type UseLiveOptions,
} from './live';
export type { LiveFetcher } from '../core/live-preview';
