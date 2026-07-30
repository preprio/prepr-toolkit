import { VERSION } from '../version';
import type {
  PreprErrorCode,
  PreprHeaders,
  PreprSegment,
  PreprToolbarProps,
} from './types';

/** Error thrown by the token helpers and the segments fetch. */
export class PreprError extends Error {
  constructor(
    message: string,
    public readonly code: PreprErrorCode,
    public readonly context?: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'PreprError';
  }
}

/** Prepr Customer ID, or null if the middleware did not run for this request. */
export function getPreprUUIDFromHeaders(headers: Headers): string | null {
  return headers.get('prepr-customer-id');
}

/** Active segment ID, or null when no segment is selected. */
export function getActiveSegmentFromHeaders(headers: Headers): string | null {
  return headers.get('Prepr-Segments');
}

/** Active A/B variant (`'A'`/`'B'`), or null when no test is running. */
export function getActiveVariantFromHeaders(headers: Headers): string | null {
  return headers.get('Prepr-ABtesting');
}

// Mirrors `PreprHeaders` in types.ts, casing included — consumers index the
// result by the declared casing (e.g. `result['Prepr-Segments']`).
const PREPR_HEADER_KEYS: readonly (keyof PreprHeaders)[] = [
  'prepr-customer-id',
  'Prepr-Segments',
  'Prepr-ABtesting',
  'Prepr-Preview-Bar',
  'Prepr-Context-utm_source',
  'Prepr-Context-utm_medium',
  'Prepr-Context-utm_term',
  'Prepr-Context-utm_content',
  'Prepr-Context-utm_campaign',
  'Prepr-Context-initial_referral',
  'Prepr-Visitor-IP',
  'Prepr-Hubspot-Id',
  'Prepr-Customer-Id-Created',
  'Prepr-User-Agent',
];

/**
 * Collect the Prepr headers into a `PreprHeaders`. Lookups are case-insensitive
 * per the Fetch spec, but the returned keys use the declared casing.
 */
export function getPreprHeadersFromHeaders(headers: Headers): PreprHeaders {
  const preprHeaders: {
    -readonly [K in keyof PreprHeaders]?: PreprHeaders[K];
  } = {};

  const copy = <K extends keyof PreprHeaders>(key: K): void => {
    const value = headers.get(key);
    if (value !== null) {
      // Header values arrive as plain strings; the interface narrows some of
      // them (Prepr-ABtesting to 'A' | 'B'), hence the cast.
      preprHeaders[key] = value as PreprHeaders[K];
    }
  };

  for (const key of PREPR_HEADER_KEYS) {
    copy(key);
  }

  return preprHeaders;
}

/**
 * Asserts `token` is the full `https://graphql.prepr.io/<token>` URL.
 * @throws PreprError if the token is missing or not an HTTPS URL.
 */
export function validatePreprToken(token: string): void {
  if (!token) {
    throw new PreprError('Token is required', 'MISSING_TOKEN', 'validatePreprToken');
  }
  if (!token.startsWith('https://')) {
    throw new PreprError(
      'Token must be a valid HTTPS URL',
      'INVALID_TOKEN',
      'validatePreprToken'
    );
  }
}

/**
 * Pulls the access token out of a GraphQL URL: `https://graphql.prepr.io/abc123`
 * -> `abc123`.
 * @throws PreprError if the URL is not a valid `graphql.prepr.io` URL.
 */
export function extractAccessToken(graphqlUrl: string): string {
  let url: URL;
  try {
    url = new URL(graphqlUrl);
  } catch (error) {
    throw new PreprError(
      'Token must be a valid URL',
      'INVALID_TOKEN',
      'extractAccessToken',
      error instanceof Error ? error : new Error(String(error))
    );
  }

  if (url.hostname !== 'graphql.prepr.io') {
    throw new PreprError(
      'Token must be a graphql.prepr.io URL',
      'INVALID_TOKEN',
      'extractAccessToken'
    );
  }

  const pathParts = url.pathname.split('/');
  const token = pathParts[pathParts.length - 1];

  if (!token) {
    throw new PreprError(
      'Token URL is missing an access token segment',
      'INVALID_TOKEN',
      'extractAccessToken'
    );
  }

  return token;
}

/**
 * Fetches the environment's segments from the Prepr API.
 *
 * `token` must be a Prepr GraphQL URL with scope 'segments'.
 * @throws PreprError if the token is invalid or the request fails.
 */
export async function getPreprEnvironmentSegments(
  token: string
): Promise<PreprSegment[]> {
  validatePreprToken(token);

  try {
    const response = await fetch(token, {
      headers: {
        'User-Agent': `Prepr-Preview-Bar/${VERSION}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({
        query: `{
                _Segments {
                    _id
                    name
                }
            }`,
      }),
    });

    if (!response.ok) {
      throw new PreprError(
        `HTTP ${response.status}: ${response.statusText}`,
        'HTTP_ERROR',
        'getPreprEnvironmentSegments'
      );
    }

    const json = await response.json();

    if (!json || !json.data || !json.data._Segments) {
      throw new PreprError(
        'Invalid response format from Prepr API',
        'INVALID_RESPONSE',
        'getPreprEnvironmentSegments'
      );
    }

    return json.data._Segments as PreprSegment[];
  } catch (error) {
    if (error instanceof PreprError) {
      throw error;
    }
    throw new PreprError(
      'Failed to fetch segments from Prepr API',
      'FETCH_ERROR',
      'getPreprEnvironmentSegments',
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

/**
 * Never throws: a failed segments fetch yields an empty list so the toolbar
 * still renders. The list is returned under both `segments` and the deprecated
 * `data` alias.
 */
export async function getToolbarPropsFromHeaders(
  headers: Headers,
  token: string
): Promise<PreprToolbarProps> {
  let segments: PreprSegment[] = [];

  try {
    segments = await getPreprEnvironmentSegments(token);
  } catch {
    segments = [];
  }

  return {
    activeSegment: getActiveSegmentFromHeaders(headers),
    activeVariant: getActiveVariantFromHeaders(headers),
    segments,
    data: segments,
  };
}
