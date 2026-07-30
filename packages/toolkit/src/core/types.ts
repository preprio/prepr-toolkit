import type { Locale } from './i18n';

export interface PreprSegment {
  readonly _id: string;
  readonly name: string;
}

export interface PreprToolbarOptions {
  debug?: boolean;
  locale?: Locale;
}

export interface PreprToolbarProps {
  readonly activeSegment: string | null;
  readonly activeVariant: string | null;
  /** Available segments to personalize on. */
  readonly segments?: readonly PreprSegment[];
  /** @deprecated Alias for `segments`. */
  readonly data?: readonly PreprSegment[];
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
