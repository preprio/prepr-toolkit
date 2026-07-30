// --- Middleware --------------------------------------------------------------
export {
  handlePreprRequest,
  getPreprHeadersFromEvent,
  PREPR_CONTEXT_KEY,
  type PreprMiddlewareOptions,
  type H3EventLike,
} from './middleware';

// --- Server helpers (take a standard Headers) --------------------------------
export {
  getActiveSegment,
  getActiveVariant,
  getPreprHeaders,
  getPreprUUID,
  getToolbarProps,
} from './server';

// --- Token helpers (re-exported from core) -----------------------------------
export { validatePreprToken, extractAccessToken, PreprError } from '../core/server';
