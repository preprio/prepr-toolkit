import { processPreprRequest, type PreprMiddlewareOptions } from '../core/middleware';

export type { PreprMiddlewareOptions };

/**
 * Structural stand-in for h3's `H3Event`, so this package needs no build-time
 * dependency on `h3`/`nuxt`. Only the fields `handlePreprRequest` uses.
 *
 * `node` ties this to Nitro's Node.js preset (the Nuxt default). Edge presets
 * expose no raw Node request/response to fold headers back onto.
 */
export interface H3EventLike {
  node: {
    req: {
      url?: string;
      headers: Record<string, string | string[] | undefined>;
    };
    res: {
      /** Node's `ServerResponse.appendHeader` (Node >= 18.3). */
      appendHeader(name: string, value: string): unknown;
    };
  };
  /** Request-scoped bag shared with route handlers and Vue via `useRequestEvent`. */
  context: Record<string, unknown>;
}

/** Key under which `handlePreprRequest` mirrors the forwarded Prepr `Headers`. */
export const PREPR_CONTEXT_KEY = 'prepr';

/**
 * Nuxt server middleware entry point — call it inside `defineEventHandler` in
 * `server/middleware/prepr.ts`:
 *
 * ```ts
 * export default defineEventHandler(event => {
 *   handlePreprRequest(event, { preview: import.meta.dev });
 * });
 * ```
 *
 * The computed Prepr headers are folded back onto the raw Node request
 * (lowercased, as Node stores them), which is what `useRequestHeaders()` and
 * downstream handlers read. The same `Headers` are mirrored onto
 * `event.context.prepr` for callers who prefer an explicit read
 * (`getPreprHeadersFromEvent`). Cookies are appended to the response.
 */
export function handlePreprRequest(event: H3EventLike, options?: PreprMiddlewareOptions): void {
  const req = event.node.req;

  // Rebuild a standard Request so the framework-free core can run unchanged.
  // Host/protocol only matter for parsing the query string out of the URL.
  const host = typeof req.headers.host === 'string' ? req.headers.host : 'localhost';
  const request = new Request(`http://${host}${req.url ?? '/'}`);
  // Set after construction — the Request constructor drops `Cookie` (forbidden
  // header per Fetch) when passed via init.
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      request.headers.set(key, value);
    } else if (Array.isArray(value)) {
      request.headers.set(key, value.join(', '));
    }
  }

  const { requestHeaders, responseCookies } = processPreprRequest(request, options);

  requestHeaders.forEach((value, key) => {
    req.headers[key.toLowerCase()] = value;
  });
  event.context[PREPR_CONTEXT_KEY] = requestHeaders;

  // appendHeader, not setHeader — each cookie needs its own Set-Cookie header.
  for (const cookie of responseCookies) {
    const parts = [
      `${cookie.name}=${encodeURIComponent(cookie.value)}`,
      `Max-Age=${cookie.maxAge}`,
      `Path=${cookie.path}`,
    ];
    event.node.res.appendHeader('Set-Cookie', parts.join('; '));
  }
}

/**
 * Personalization headers to forward to your GraphQL fetch, from the h3 event.
 * Empty `Headers` if `handlePreprRequest` did not run, so the result is always
 * safe to spread.
 */
export function getPreprHeadersFromEvent(event: Pick<H3EventLike, 'context'>): Headers {
  const headers = event.context[PREPR_CONTEXT_KEY];
  return headers instanceof Headers ? headers : new Headers();
}
