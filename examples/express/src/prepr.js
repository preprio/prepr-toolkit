// Everything a plain-JS (non-Next/Astro) app needs to wire in @preprio/toolkit.
// The toolkit core is runtime-neutral: it works off a WHATWG `Request` and hands
// back the headers to forward to Prepr plus the cookies to persist. This module
// is the small adapter every Express consumer writes — translate Express's
// req/res to/from those neutral shapes.
import {
  processPreprRequest,
  getPreprHeadersFromHeaders,
  getToolbarPropsFromHeaders,
  extractAccessToken,
} from '@preprio/toolkit';
import { GetPageBySlug } from './queries.js';

export { extractAccessToken };

/** Build a WHATWG Request from an Express request (URL + headers only). */
function toWebRequest(req) {
  const url = new URL(req.originalUrl, `http://${req.headers.host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value != null) headers.set(key, value);
  }
  return new Request(url, { headers });
}

/**
 * Express middleware. Runs the toolkit's request processing, persists the
 * resulting cookies on the response, and exposes the forward-headers to
 * downstream handlers as `res.locals.preprHeaders`.
 */
export function preprMiddleware({ preview, features } = {}) {
  return (req, res, next) => {
    const { requestHeaders, responseCookies } = processPreprRequest(
      toWebRequest(req),
      {
        preview,
        features,
      },
    );
    for (const cookie of responseCookies) {
      res.cookie(cookie.name, cookie.value, {
        maxAge: cookie.maxAge * 1000,
        path: cookie.path,
      });
    }
    res.locals.preprHeaders = requestHeaders;
    next();
  };
}

/** Fetch a page by slug, forwarding the Prepr headers the middleware computed. */
export async function fetchPage(slug, preprHeaders, graphqlUrl) {
  const res = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getPreprHeadersFromHeaders(preprHeaders),
    },
    body: JSON.stringify({ query: GetPageBySlug, variables: { slug } }),
  });
  const { data } = await res.json();
  return data?.Page ?? null;
}

/** Preview-only: resolve the toolbar props, or null (logged) on failure. */
export async function getToolbarProps(preprHeaders, graphqlUrl, features) {
  try {
    return await getToolbarPropsFromHeaders(preprHeaders, graphqlUrl, features);
  } catch (err) {
    console.error('toolbar props failed:', err);
    return null;
  }
}
