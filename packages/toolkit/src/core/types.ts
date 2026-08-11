import type { Locale } from './i18n';

export interface PreprSegment {
  readonly _id: string;
  readonly name: string;
}

/**
 * Per-feature config. `false` is shorthand for `{ enabled: false }`; the object
 * form leaves room for per-feature options later without a breaking change.
 */
export type PreprFeatureConfig = boolean | { enabled?: boolean };

/** Toolkit features a consumer can turn off. Omitted keys stay enabled. */
export interface PreprFeatures {
  /** Segment picker, `Prepr-Segments` header and its cookie/query param. */
  segments?: PreprFeatureConfig;
  /** A/B variant switch, `Prepr-ABtesting` header and its cookie/query param. */
  abTesting?: PreprFeatureConfig;
  /**
   * The site's own click-to-edit: the toolbar's Edit mode control, the stega
   * tooltip/overlay and the close-edit pill.
   *
   * NOT a security control, and NOT the Prepr editor's live preview. When the
   * site is framed by the editor, `prepr:initVE` still activates edit mode —
   * that is the CMS operating inside its own iframe, not an affordance offered
   * to visitors. See iframe-bridge.ts.
   */
  editMode?: PreprFeatureConfig;
}

/** `PreprFeatures` with every key resolved to a boolean. */
export interface ResolvedPreprFeatures {
  readonly segments: boolean;
  readonly abTesting: boolean;
  readonly editMode: boolean;
}

export interface PreprToolbarOptions {
  debug?: boolean;
  locale?: Locale;
  /** Disable features app-wide. Pass the same object to the middleware. */
  features?: PreprFeatures;
}

export interface PreprToolbarProps {
  readonly activeSegment: string | null;
  readonly activeVariant: string | null;
  /** Available segments to personalize on. */
  readonly segments?: readonly PreprSegment[];
  /** @deprecated Alias for `segments`. */
  readonly data?: readonly PreprSegment[];
}

/**
 * Prop type for the framework `<PreprToolbar>` components: the toolbar data
 * plus the options bag core `createPreprToolbar` accepts.
 */
export interface PreprToolbarComponentProps extends PreprToolbarProps {
  options?: PreprToolbarOptions;
}

// Header names the Prepr API expects — casing must match exactly.
export type PreprHeaderName =
  | 'prepr-customer-id'
  | 'Prepr-Segments'
  | 'Prepr-ABtesting'
  | 'Prepr-User-Agent';

export type PreprVariant = 'A' | 'B';

export type PreprEnvironment = 'preview' | 'production';

// Wire protocol shared with the Prepr editor. The mixed snake_case/camelCase is
// frozen — renaming any member breaks the editor integration.
export type PreprEventType =
  | 'segment_changed'
  | 'variant_changed'
  | 'edit_mode_toggled'
  | 'preview_mode_toggled'
  | 'getScrollPosition'
  | 'loaded'
  | 'field_edit_requested';

export interface PreprHeaders {
  readonly 'prepr-customer-id'?: string;
  readonly 'Prepr-Segments'?: string;
  readonly 'Prepr-ABtesting'?: PreprVariant;
  readonly 'Prepr-Preview-Bar'?: 'true';
  readonly 'Prepr-Context-utm_source'?: string;
  readonly 'Prepr-Context-utm_medium'?: string;
  readonly 'Prepr-Context-utm_term'?: string;
  readonly 'Prepr-Context-utm_content'?: string;
  readonly 'Prepr-Context-utm_campaign'?: string;
  readonly 'Prepr-Context-initial_referral'?: string;
  readonly 'Prepr-Visitor-IP'?: string;
  readonly 'Prepr-Hubspot-Id'?: string;
  readonly 'Prepr-Customer-Id-Created'?: 'true';
  readonly 'Prepr-User-Agent'?: string;
}

export type PreprErrorCode =
  | 'INVALID_TOKEN'
  | 'MISSING_TOKEN'
  | 'HTTP_ERROR'
  | 'FETCH_ERROR'
  | 'INVALID_RESPONSE'
  | 'CONTEXT_ERROR';
