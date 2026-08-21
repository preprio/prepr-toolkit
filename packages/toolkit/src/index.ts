export { VERSION } from './version';

// --- Types ------------------------------------------------------------------
export type {
  PreprSegment,
  PreprToolbarOptions,
  PreprPreviewOptions,
  PreprToolbarProps,
  PreprToolbarComponentProps,
  PreprFeatureConfig,
  PreprFeatures,
  ResolvedPreprFeatures,
  PreprHeaderName,
  PreprHeaders,
  PreprVariant,
  PreprEnvironment,
  PreprEventType,
  PreprErrorCode,
} from './core/types';
export { resolveFeatures } from './core/features';
export type { ToolbarState, ToolbarStore } from './core/store';

// --- Preview runtime + UI ---------------------------------------------------
export {
  createPreprPreview,
  type PreprNavigationAdapter,
  type CreatePreprPreviewOptions,
  type PreprPreviewController,
} from './core/create-preview';
export {
  PreprToolbarElement,
  definePreprToolbar,
} from './core/ui/toolbar-element';
export { createToolbarStore } from './core/store';

export type { IframeBridgeOptions } from './core/iframe-bridge';

// --- Stega ------------------------------------------------------------------
export { stegaClean } from './core/stega';

// --- Server -----------------------------------------------------------------
export {
  PreprError,
  getPreprUUIDFromHeaders,
  getActiveSegmentFromHeaders,
  getActiveVariantFromHeaders,
  getPreprHeadersFromHeaders,
  validatePreprToken,
  extractAccessToken,
  getPreprEnvironmentSegments,
  getToolbarPropsFromHeaders,
} from './core/server';

// --- Middleware -------------------------------------------------------------
export {
  processPreprRequest,
  type CookieSpec,
  type PreprMiddlewareResult,
  type PreprMiddlewareOptions,
} from './core/middleware';

// --- Pixel ------------------------------------------------------------------
export {
  loadTrackingPixel,
  trackEvent,
  setTrackingParam,
  type PreprPixelConfig,
} from './core/pixel';
