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
export {
  previewAttrs,
  type PreviewAttrsOptions,
  type PreviewAttrsTarget,
} from './core/preview-attrs';

// --- Live preview ---------------------------------------------------------
export {
  normalizeQuery,
  parsePatchLog,
  type LivePatch,
  type NormalizeQueryOptions,
} from './core/live-preview/normalize-query';
export type { QueryInput } from './core/live-preview/query-document';
export {
  startHtmlLivePreview,
  type HtmlLivePreview,
  type HtmlLivePreviewOptions,
} from './core/live-preview/html-live';
export { readLiveLogFromRequest } from './core/live-preview/live-request';
export {
  applyPatchLogToDom,
  type DomPatchResult,
} from './core/live-preview/dom-patch';

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
