import { VERSION } from '../version';
import {
  COOKIE_HUBSPOT,
  COOKIE_PREVIEW_MODE,
  COOKIE_SEGMENT,
  COOKIE_UID,
  COOKIE_VARIANT,
  ONE_YEAR_SECONDS,
  PARAM_HIDE_BAR,
  PARAM_SEGMENT,
  PARAM_VARIANT,
} from './constants';
import { resolveFeatures } from './features';
import type { PreprFeatures } from './types';

const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_term',
  'utm_content',
  'utm_campaign',
] as const;

export interface CookieSpec {
  name: string;
  value: string;
  maxAge: number;
  path: string;
  /**
   * Set to `'None'` for cookies that must survive the Prepr editor's
   * cross-site preview iframe — browsers drop the browser-default `Lax`
   * cookies there. Always paired with `secure`, which browsers require for
   * `SameSite=None`.
   */
  sameSite?: 'Strict' | 'Lax' | 'None';
  /** Adds `Secure`. Required by browsers alongside `SameSite=None`. */
  secure?: boolean;
}

/** Hard cap on a forwarded header value, matched to common proxy limits. */
const MAX_HEADER_VALUE_LENGTH = 2048;

/**
 * Make a request-derived value safe to hand to `Headers.set()`.
 *
 * Every value forwarded to the Prepr API comes from the visitor — query params,
 * cookies and inbound headers. The runtime `Headers` (undici under Node,
 * workerd on the edge) rejects CR/LF with a `TypeError` rather than sanitizing,
 * so passing one through took down the whole request with a 500 that any
 * visitor could trigger with a crafted URL.
 *
 * Control characters are stripped rather than escaped: these are Prepr context
 * values (UTM tags, segment ids, a referrer), and none has a legitimate reason
 * to contain one. Over-long values are truncated so an outsized param cannot
 * push the upstream request past a proxy's header limit.
 *
 * Note this is not defence against header injection on its own — an HTTP parser
 * would never deliver a bare CR/LF inside a single header value. It keeps a
 * hostile *URL*, which is entirely attacker-controlled, from crashing the
 * middleware.
 */
function sanitizeHeaderValue(value: string): string {
  // Stripping control characters is the entire point of this function.
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\u0000-\u001f\u007f]/g, '');
  return stripped.length > MAX_HEADER_VALUE_LENGTH
    ? stripped.slice(0, MAX_HEADER_VALUE_LENGTH)
    : stripped;
}

export interface PreprMiddlewareResult {
  requestHeaders: Headers;
  responseCookies: CookieSpec[];
}

/**
 * Serialize a `CookieSpec` into a `Set-Cookie` header value.
 *
 * Shared by every framework wrapper that writes the header itself (Astro,
 * SvelteKit, Nuxt), so the attribute set stays identical across them.
 */
export function serializeCookie(cookie: CookieSpec): string {
  const parts = [
    `${cookie.name}=${encodeURIComponent(cookie.value)}`,
    `Max-Age=${cookie.maxAge}`,
    `Path=${cookie.path}`,
  ];

  if (cookie.sameSite) {
    parts.push(`SameSite=${cookie.sameSite}`);
  }

  if (cookie.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export interface PreprMiddlewareOptions {
  /** Enable preview-mode headers (segment/AB overrides, preview bar). */
  preview?: boolean;
  /**
   * Disable features app-wide. Pass the same object you give the toolbar: a
   * disabled feature injects no header and persists no cookie, whatever the
   * request carries.
   */
  features?: PreprFeatures;
  /** Override the version reported in Prepr-Package (mainly for tests). */
  version?: string;
}

// Works off the standard `Headers` object so no framework cookie jar is needed.
function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  const header = request.headers.get('cookie');
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name) continue;
    // Malformed percent-encoding (e.g. `%zz` from another vendor's cookie on
    // the same domain) must not turn into a visitor-triggerable 500 — same
    // crash class `sanitizeHeaderValue` guards for header values.
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, value);
    }
  }

  return cookies;
}

/**
 * Compute the headers to forward to the Prepr API and the cookies to persist,
 * from a standard `Request` alone. Pure and framework-free — the Next.js/Astro
 * wrappers apply `requestHeaders`/`responseCookies` to their own objects.
 */
export function processPreprRequest(
  request: Request,
  opts?: PreprMiddlewareOptions,
): PreprMiddlewareResult {
  const requestHeaders = new Headers(request.headers);
  const responseCookies: CookieSpec[] = [];

  // The middleware is the only authority on `Prepr-*`. Everything below is
  // derived from the request's cookies, query params and connection headers, so
  // anything a client sent under this prefix is dropped first — otherwise a
  // visitor could spoof `Prepr-Visitor-IP` to poison analytics, or set
  // `Prepr-Segments` / `Prepr-Preview-Bar` to select personalization behind the
  // back of the `features` gate the consumer configured.
  //
  // Collected before deleting: mutating a `Headers` mid-iteration is not safe.
  const inboundPreprHeaders: string[] = [];
  requestHeaders.forEach((_value, key) => {
    if (key.toLowerCase().startsWith('prepr-')) {
      inboundPreprHeaders.push(key);
    }
  });
  for (const key of inboundPreprHeaders) {
    requestHeaders.delete(key);
  }
  const requestCookies = parseCookies(request);
  const url = new URL(request.url);
  const searchParams = url.searchParams;

  // Preview cookies have to survive the editor's cross-site iframe, which
  // needs `SameSite=None; Secure` — and browsers reject `Secure` off HTTPS.
  // Behind a proxy the origin request is often plain HTTP, so trust
  // `x-forwarded-proto` when it is present.
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim();
  const isSecure = forwardedProto
    ? forwardedProto === 'https'
    : url.protocol === 'https:';
  const crossSite: Pick<CookieSpec, 'sameSite' | 'secure'> = isSecure
    ? { sameSite: 'None', secure: true }
    : {};

  for (const key of UTM_PARAMS) {
    const value = searchParams.get(key);
    if (value !== null) {
      requestHeaders.set(`Prepr-Context-${key}`, sanitizeHeaderValue(value));
    }
  }

  const referer = request.headers.get('referer');
  if (referer) {
    requestHeaders.set(
      'Prepr-Context-initial_referral',
      sanitizeHeaderValue(referer),
    );
  }

  // The API does device detection off this.
  const userAgent = request.headers.get('user-agent');
  if (userAgent) {
    requestHeaders.set('Prepr-User-Agent', sanitizeHeaderValue(userAgent));
  }

  requestHeaders.set(
    'Prepr-Package',
    `@preprio/toolkit@${opts?.version ?? VERSION}`,
  );

  // Cf-Connecting-Ip wins over x-real-ip.
  const ip =
    request.headers.get('Cf-Connecting-Ip') ?? request.headers.get('x-real-ip');
  if (ip) {
    requestHeaders.set('Prepr-Visitor-IP', sanitizeHeaderValue(ip));
  }

  const hutkCookie = requestCookies.get(COOKIE_HUBSPOT);
  if (hutkCookie) {
    requestHeaders.set('Prepr-Hubspot-Id', sanitizeHeaderValue(hutkCookie));
  }

  // Cookie-sourced, so visitor-controlled: without sanitizing, a CR/LF smuggled
  // into the cookie value makes `Headers.set` throw and 500s the request.
  let uid = sanitizeHeaderValue(requestCookies.get(COOKIE_UID) ?? '');
  if (!uid) {
    uid = crypto.randomUUID();
    responseCookies.push({
      name: COOKIE_UID,
      value: uid,
      maxAge: ONE_YEAR_SECONDS,
      path: '/',
    });
    requestHeaders.set('Prepr-Customer-Id-Created', 'true');
  }
  requestHeaders.set('Prepr-Customer-Id', uid);

  if (!opts?.preview) {
    return { requestHeaders, responseCookies };
  }

  const features = resolveFeatures(opts?.features);

  // Preview query params outrank the cookie: the CMS dashboard iframes the site
  // and drives segments purely via params, whatever the browser cookie says.
  // A disabled feature's param does not count — it is ignored below, so letting
  // it override the preview cookie would enable preview for nothing.
  const hasPreviewParams =
    (features.segments && searchParams.has(PARAM_SEGMENT)) ||
    (features.abTesting && searchParams.has(PARAM_VARIANT));

  if (!hasPreviewParams) {
    const previewModeCookie = requestCookies.get(COOKIE_PREVIEW_MODE);
    const previewModeEnabled = previewModeCookie !== 'false';
    if (!previewModeEnabled) {
      return { requestHeaders, responseCookies };
    }
  }

  requestHeaders.set('Prepr-Preview-Bar', 'true');

  // prepr_hide_bar=true means the page runs in the live preview iframe, where cookies
  // must be ignored entirely — segments/variants come only from query params.
  const isLivePreview = searchParams.get(PARAM_HIDE_BAR) === 'true';

  // Seed Prepr-Preview-Mode server-side when it is absent.
  //
  // The toolbar writes this cookie itself, but only as a side effect of a
  // previewMode *transition*. Inside the editor's cross-site iframe that write
  // used to be dropped by the browser, so the toolbar remounted as
  // previewMode:false, the editor's `prepr:initVE` flipped it to true, and the
  // resulting transition triggered a reload — over and over. Writing it here
  // means the toolbar mounts already in preview mode and initVE is a no-op.
  if (!isLivePreview && !requestCookies.has(COOKIE_PREVIEW_MODE)) {
    responseCookies.push({
      name: COOKIE_PREVIEW_MODE,
      value: 'true',
      maxAge: ONE_YEAR_SECONDS,
      path: '/',
      ...crossSite,
    });
  }

  if (!isLivePreview) {
    const segmentCookie = features.segments
      ? requestCookies.get(COOKIE_SEGMENT)
      : undefined;
    if (segmentCookie) {
      requestHeaders.set('Prepr-Segments', sanitizeHeaderValue(segmentCookie));
    }

    const abCookie = features.abTesting
      ? requestCookies.get(COOKIE_VARIANT)
      : undefined;
    if (abCookie) {
      requestHeaders.set('Prepr-ABtesting', sanitizeHeaderValue(abCookie));
    }
  }

  const previewAb = features.abTesting ? searchParams.get(PARAM_VARIANT) : null;
  if (previewAb !== null) {
    requestHeaders.set('Prepr-ABtesting', sanitizeHeaderValue(previewAb));
    if (!isLivePreview) {
      responseCookies.push({
        name: COOKIE_VARIANT,
        value: previewAb,
        maxAge: ONE_YEAR_SECONDS,
        path: '/',
        ...crossSite,
      });
    }
  }

  const previewSegment = features.segments
    ? searchParams.get(PARAM_SEGMENT)
    : null;
  if (previewSegment !== null) {
    requestHeaders.set('Prepr-Segments', sanitizeHeaderValue(previewSegment));
    if (!isLivePreview) {
      responseCookies.push({
        name: COOKIE_SEGMENT,
        value: previewSegment,
        maxAge: ONE_YEAR_SECONDS,
        path: '/',
        ...crossSite,
      });
    }
  }

  return { requestHeaders, responseCookies };
}
