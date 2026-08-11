export { VERSION } from './version';

// --- Types ------------------------------------------------------------------
export type {
  PreprSegment,
  PreprToolbarOptions,
  PreprToolbarProps,
  PreprHeaderName,
  PreprHeaders,
  PreprVariant,
  PreprEnvironment,
  PreprEventType,
  PreprErrorCode,
} from './core/types';
export type { ToolbarState, ToolbarStore } from './core/store';

// --- Toolbar mount controller + UI ------------------------------------------
export {
  createPreprToolbar,
  type PreprNavigationAdapter,
  type CreatePreprToolbarOptions,
  type PreprToolbarController,
} from './core/create-toolbar';
export {
  PreprToolbarElement,
  definePreprToolbar,
} from './core/ui/toolbar-element';
export { createToolbarStore } from './core/store';

// --- Scroll sync (toolbar-free) ---------------------------------------------
export {
  createPreprScrollSync,
  type PreprScrollSync,
} from './core/scroll-sync';
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
