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
export {
  validatePreprToken,
  extractAccessToken,
  PreprError,
} from '../core/server';

// --- Personalization -----------------------------------------------------------
// The GraphQL client itself is on the `/graphql` subpath; this helper needs no
// `graphql` package and serves projects with their own client.
export { isPersonalizedResponse } from '../core/personalization';
