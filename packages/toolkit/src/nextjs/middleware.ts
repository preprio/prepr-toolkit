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
    // A chained response skipped the next() constructor above, so it never
    // picked up requestHeaders — copy them across by hand.
    requestHeaders.forEach((value, key) => {
      response.headers.set(key, value);
    });
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
