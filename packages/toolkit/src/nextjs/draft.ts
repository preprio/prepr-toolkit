import { cookies, draftMode } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse, type NextRequest } from 'next/server';

// Set by Next.js while draft mode is on.
const DRAFT_COOKIE = '__prerender_bypass';
// Marks the trip back from the draft route, so a browser that refuses the
// draft cookie (third-party cookies blocked in the editor iframe) gets the
// page without draft mode instead of a redirect loop.
const RETURN_PARAM = 'prepr_draft';
const DEFAULT_ROUTE = '/api/prepr/draft';

export interface PreprDraftOptions {
  /** Whether this deployment serves preview content. Outside it, both helpers do nothing. */
  preview: boolean;
  /** Path of the route handler made with `createPreprDraftRoute`. Default `/api/prepr/draft`. */
  route?: string;
}

/**
 * In preview, sends a visitor without draft mode through the draft route once,
 * from middleware (`proxy.ts`). Returns the redirect to send, or `null` to
 * carry on.
 *
 * Draft mode is what keeps preview fresh with Cache Components: Next.js then
 * renders every page per request and skips `'use cache'` entries and the Data
 * Cache, so an edit shows on the next load without a publish webhook.
 *
 * Call it first in the proxy, before `createPreprMiddleware`.
 *
 * @example
 * const draft = preprDraftRedirect(request, { preview });
 * if (draft) return draft;
 */
export function preprDraftRedirect(
  request: NextRequest,
  options: PreprDraftOptions,
): NextResponse | null {
  if (!options.preview) return null;
  // Form posts and server actions cannot follow a redirect with their body.
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;

  const url = request.nextUrl;
  if (url.pathname === (options.route ?? DEFAULT_ROUTE)) return null;

  if (request.cookies.has(DRAFT_COOKIE)) {
    if (!url.searchParams.has(RETURN_PARAM)) return null;
    // Back from the draft route with the cookie: drop the marker from the URL.
    const clean = url.clone();
    clean.searchParams.delete(RETURN_PARAM);
    return NextResponse.redirect(clean, 307);
  }
  if (url.searchParams.has(RETURN_PARAM)) return null;

  const target = new URL(options.route ?? DEFAULT_ROUTE, request.url);
  target.searchParams.set('to', url.pathname + url.search);
  return NextResponse.redirect(target, 307);
}

/**
 * The route handler `preprDraftRedirect` sends preview visitors to: turns on
 * draft mode and redirects back to the page. Answers 404 outside preview.
 * Only same-origin paths are followed, so it cannot be used as an open
 * redirect.
 *
 * @example
 * // app/api/prepr/draft/route.ts
 * export const GET = createPreprDraftRoute({
 *   preview: process.env.PREPR_ENV === 'preview',
 * });
 */
export function createPreprDraftRoute(
  options: Pick<PreprDraftOptions, 'preview'>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (!options.preview) return new Response('Not found', { status: 404 });
    (await draftMode()).enable();

    const self = new URL(request.url);
    // Inside the Prepr editor the site is a cross-site iframe, where browsers
    // that block third-party cookies still accept partitioned ones. Same
    // name and value, so Next.js recognizes it either way.
    if (self.protocol === 'https:') {
      const jar = await cookies();
      const draft = jar.get(DRAFT_COOKIE);
      if (draft) {
        jar.set({
          name: DRAFT_COOKIE,
          value: draft.value,
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'none',
          partitioned: true,
        });
      }
    }
    let to = new URL(self.searchParams.get('to') ?? '/', self);
    if (to.origin !== self.origin) to = new URL('/', self);
    to.searchParams.set(RETURN_PARAM, '1');
    redirect(to.pathname + to.search);
  };
}
