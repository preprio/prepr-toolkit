// --- Middleware --------------------------------------------------------------
export {
  preprHandle,
  getPreprHeadersFromLocals,
  PREPR_LOCALS_KEY,
  type PreprMiddlewareOptions,
  type Handle,
  type SvelteKitRequestEvent,
  type SvelteKitResolve,
} from './hooks';

// --- Server helpers (take a standard Headers) --------------------------------
export {
  getActiveSegment,
  getActiveVariant,
  getPreprHeaders,
  getPreprUUID,
  getToolbarProps,
} from './server';

// --- Token helpers (re-exported from core) -----------------------------------
export {
  validatePreprToken,
  extractAccessToken,
  PreprError,
} from '../core/server';
