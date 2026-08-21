import { NextRequest, NextResponse } from 'next/server';

import { processPreprRequest, type PreprMiddlewareOptions } from '../core/middleware';

export type { PreprMiddlewareOptions };

/**
 * Next.js middleware entry point. Despite the `create` prefix this runs
 * per-request — it does not return a handler. Pass an existing `NextResponse`
 * as the second argument to chain with other middleware.
 */
export function createPreprMiddleware(
  request: NextRequest,
  options?: PreprMiddlewareOptions
): NextResponse;

export function createPreprMiddleware(
  request: NextRequest,
  response: NextResponse,
  options?: PreprMiddlewareOptions
): NextResponse;

export function createPreprMiddleware(
  request: NextRequest,
  responseOrOptions?: NextResponse | PreprMiddlewareOptions,
  maybeOptions?: PreprMiddlewareOptions
): NextResponse {
  let chainedResponse: NextResponse | undefined;
  let options: PreprMiddlewareOptions | undefined;

  if (responseOrOptions instanceof NextResponse) {
    chainedResponse = responseOrOptions;
    options = maybeOptions;
  } else {
    options = responseOrOptions;
  }

  const { requestHeaders, responseCookies } = processPreprRequest(request, options);

  // NextResponse.next({ request: { headers } }) is the only way to make
  // middleware-set request headers visible to downstream Server Components and
  // Route Handlers via `headers()`.
  const response =
    chainedResponse ?? NextResponse.next({ request: { headers: requestHeaders } });

  if (chainedResponse) {
    // A chained response skipped the next() constructor above. Writing
    // requestHeaders onto response.headers would echo them (cookie included)
    // to the browser and never reach Server Components — request-header
    // forwarding only works via Next's override protocol, the same
    // x-middleware-override-headers / x-middleware-request-* pair that
    // NextResponse.next({ request }) writes internally. Union with any
    // overrides a prior middleware in the chain already set.
    const existing = response.headers.get('x-middleware-override-headers');
    const names = new Set(
      existing ? existing.split(',').map((name) => name.trim()).filter(Boolean) : []
    );
    requestHeaders.forEach((value, key) => {
      names.add(key);
      response.headers.set(`x-middleware-request-${key}`, value);
    });
    response.headers.set('x-middleware-override-headers', [...names].join(','));
  }

  for (const cookie of responseCookies) {
    response.cookies.set(cookie.name, cookie.value, {
      maxAge: cookie.maxAge,
      path: cookie.path,
      // Lower-cased: Next's cookie API expects 'none' | 'lax' | 'strict'.
      ...(cookie.sameSite
        ? { sameSite: cookie.sameSite.toLowerCase() as 'none' | 'lax' | 'strict' }
        : {}),
      ...(cookie.secure ? { secure: true } : {}),
    });
  }

  return response;
}
