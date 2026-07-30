// Frozen wire protocol: the toolbar writes these cookies/params in the browser
// and the middleware reads them on the server. Renaming any of them breaks both
// the client↔server handshake and the Prepr editor integration.

export const COOKIE_PREVIEW_MODE = 'Prepr-Preview-Mode';
export const COOKIE_TOOLBAR_OPEN = 'Prepr-Toolbar-Open';
export const COOKIE_SEGMENT = 'Prepr-Segments';
export const COOKIE_VARIANT = 'Prepr-ABtesting';
export const COOKIE_UID = '__prepr_uid';
// HubSpot's own tracking cookie, passed through to the Prepr API.
export const COOKIE_HUBSPOT = 'hubspotutk';

export const PARAM_SEGMENT = 'prepr_preview_segment';
export const PARAM_VARIANT = 'prepr_preview_ab';
// Always present when the page loads inside the Prepr live preview iframe.
export const PARAM_HIDE_BAR = 'prepr_hide_bar';

// maxAge for all Prepr cookies.
export const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
