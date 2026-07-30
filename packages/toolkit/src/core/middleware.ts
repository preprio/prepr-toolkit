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
}

export interface PreprMiddlewareResult {
  requestHeaders: Headers;
  responseCookies: CookieSpec[];
}

export interface PreprMiddlewareOptions {
  /** Enable preview-mode headers (segment/AB overrides, preview bar). */
  preview?: boolean;
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
    cookies.set(name, decodeURIComponent(value));
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
  opts?: PreprMiddlewareOptions
): PreprMiddlewareResult {
  const requestHeaders = new Headers(request.headers);
  const responseCookies: CookieSpec[] = [];
  const requestCookies = parseCookies(request);
  const searchParams = new URL(request.url).searchParams;

  for (const key of UTM_PARAMS) {
    const value = searchParams.get(key);
    if (value !== null) {
      requestHeaders.set(`Prepr-Context-${key}`, value);
    }
  }

  const referer = request.headers.get('referer');
  if (referer) {
    requestHeaders.set('Prepr-Context-initial_referral', referer);
  }

  // The API does device detection off this.
  const userAgent = request.headers.get('user-agent');
  if (userAgent) {
    requestHeaders.set('Prepr-User-Agent', userAgent);
  }

  requestHeaders.set('Prepr-Package', `@preprio/toolkit@${opts?.version ?? VERSION}`);

  // Cf-Connecting-Ip wins over x-real-ip.
  const ip = request.headers.get('Cf-Connecting-Ip') ?? request.headers.get('x-real-ip');
  if (ip) {
    requestHeaders.set('Prepr-Visitor-IP', ip);
  }

  const hutkCookie = requestCookies.get(COOKIE_HUBSPOT);
  if (hutkCookie) {
    requestHeaders.set('Prepr-Hubspot-Id', hutkCookie);
  }

  let uid = requestCookies.get(COOKIE_UID);
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

  // Preview query params outrank the cookie: the CMS dashboard iframes the site
  // and drives segments purely via params, whatever the browser cookie says.
  const hasPreviewParams =
    searchParams.has(PARAM_SEGMENT) || searchParams.has(PARAM_VARIANT);

  if (!hasPreviewParams) {
    const previewModeCookie = requestCookies.get(COOKIE_PREVIEW_MODE);
    const previewModeEnabled = previewModeCookie !== 'false';
    if (!previewModeEnabled) {
      return { requestHeaders, responseCookies };
    }
  }

  requestHeaders.set('Prepr-Preview-Bar', 'true');

  // prepr_hide_bar=true means we're in the live preview iframe, where cookies
  // must be ignored entirely — segments/variants come only from query params.
  const isLivePreview = searchParams.get(PARAM_HIDE_BAR) === 'true';

  if (!isLivePreview) {
    const segmentCookie = requestCookies.get(COOKIE_SEGMENT);
    if (segmentCookie) {
      requestHeaders.set('Prepr-Segments', segmentCookie);
    }

    const abCookie = requestCookies.get(COOKIE_VARIANT);
    if (abCookie) {
      requestHeaders.set('Prepr-ABtesting', abCookie);
    }
  }

  const previewAb = searchParams.get(PARAM_VARIANT);
  if (previewAb !== null) {
    requestHeaders.set('Prepr-ABtesting', previewAb);
    if (!isLivePreview) {
      responseCookies.push({
        name: COOKIE_VARIANT,
        value: previewAb,
        maxAge: ONE_YEAR_SECONDS,
        path: '/',
      });
    }
  }

  const previewSegment = searchParams.get(PARAM_SEGMENT);
  if (previewSegment !== null) {
    requestHeaders.set('Prepr-Segments', previewSegment);
    if (!isLivePreview) {
      responseCookies.push({
        name: COOKIE_SEGMENT,
        value: previewSegment,
        maxAge: ONE_YEAR_SECONDS,
        path: '/',
      });
    }
  }

  return { requestHeaders, responseCookies };
}
