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

// Marks the request a live-preview page re-render sends with the editor's
// unsaved changes in its body.
export const HEADER_LIVE_RENDER = 'x-prepr-live';

// DOM contract with consumer markup and the Prepr editor: `previewAttrs` and
// the stega scanner write these attributes, the visual editor reads them.
export const ATTR_ENCODED = 'data-prepr-encoded';
export const ATTR_ID = 'data-prepr-id';
export const ATTR_FIELD = 'data-prepr-field';
export const ATTR_LOCALE = 'data-prepr-locale';
export const ATTR_HREF = 'data-prepr-href';
export const ENCODED_SELECTOR = `[${ATTR_ENCODED}]`;

export const TOOLBAR_TAG = 'prepr-toolbar';

// The synthetic segment the toolbar lists first; the API never returns it.
export const SEGMENT_ALL_OTHER_USERS = 'all_other_users';

// Messages the Prepr editor posts into its preview iframe.
export const EVENT_INIT = 'prepr:initVE';
export const EVENT_REFERENCES = 'prepr:references';
export const EVENT_GET_SCROLL_POSITION = 'prepr:getScrollPosition';
export const EVENT_SCROLL_TO_FIELD = 'prepr:scrollToField';
export const EVENT_ALLOW_NAVIGATION = 'prepr:allowNavigation';
export const EVENT_ITEM_CHANGED = 'prepr:itemChanged';
export const EVENT_FIELD_CHANGE = 'prepr:fieldChange';
export const EVENT_LIST_CHANGE = 'prepr:listChange';
