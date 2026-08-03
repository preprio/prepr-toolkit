import {
  processPreprRequest,
  serializeCookie,
  type PreprMiddlewareOptions,
} from '../core/middleware';

export type { PreprMiddlewareOptions };

/**
 * Structural stand-in for SvelteKit's `RequestEvent`, so this package needs no
 * build-time dependency on `@sveltejs/kit`. Only the fields `preprHandle` uses.
 */
export interface SvelteKitRequestEvent {
  request: Request;
  /**
   * Request-scoped bag shared across `handle` → `load`. `preprHandle` mirrors
   * the computed Prepr headers here for load functions that prefer an explicit
   * read over `request.headers` (see `getPreprHeadersFromLocals`). Optional —
   * hand-built events (tests, non-page endpoints) may omit it.
   */
  locals?: Record<string, unknown>;
}

/** Key under which `preprHandle` mirrors the forwarded Prepr `Headers`. */
export const PREPR_LOCALS_KEY = 'prepr';

/** SvelteKit's `resolve(event)` — produces the downstream `Response`. */
export type SvelteKitResolve = (event: SvelteKitRequestEvent) => Promise<Response>;

/** Structural match for SvelteKit's `Handle`. */
export type Handle = (input: {
  event: SvelteKitRequestEvent;
  resolve: SvelteKitResolve;
}) => Promise<Response>;

/**
 * Builds the SvelteKit `Handle` for `src/hooks.server.ts`.
 *
 * The computed Prepr headers are set on `event.request.headers` in place, which
 * load functions do see: SvelteKit shallow-spreads the event before `handle`
 * (`respond.js`) and again before `load` (`load_data.js`), so `request` is
 * carried by reference and never reconstructed — same mechanism as the Astro
 * wrapper's `onPreprRequest`. Verified against @sveltejs/kit 2.70.1. The same
 * `Headers` are mirrored onto `event.locals` for callers who prefer reading
 * them explicitly (`getPreprHeadersFromLocals`). Cookies are appended to the
 * resolved response.
 */
export function preprHandle(options?: PreprMiddlewareOptions): Handle {
  return async ({ event, resolve }) => {
    const { requestHeaders, responseCookies } = processPreprRequest(event.request, options);

    requestHeaders.forEach((value, key) => {
      event.request.headers.set(key, value);
    });

    if (event.locals) {
      event.locals[PREPR_LOCALS_KEY] = requestHeaders;
    }

    const response = await resolve(event);

    // `.append`, not `.set` — each cookie needs its own Set-Cookie header.
    for (const cookie of responseCookies) {
      response.headers.append('Set-Cookie', serializeCookie(cookie));
    }

    return response;
  };
}

/**
 * Personalization headers to forward to your GraphQL fetch, for use in load
 * functions. Equivalent to reading `event.request.headers` — `preprHandle`
 * writes both. Empty `Headers` if `preprHandle` did not run, so the result is
 * always safe to spread.
 */
export function getPreprHeadersFromLocals(locals: Record<string, unknown>): Headers {
  const headers = locals[PREPR_LOCALS_KEY];
  return headers instanceof Headers ? headers : new Headers();
}
