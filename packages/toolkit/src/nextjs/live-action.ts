'use server';

import * as nextCache from 'next/cache';
import { cookies, headers } from 'next/headers';

import { parsePatchLog } from '../core/live-preview/normalize-query';
import { isPreviewFromHeaders } from '../core/server';
import { LIVE_LOG_COOKIE, putLiveLog } from './live-log';

/**
 * Server action behind live preview for server components: it hands the
 * editor's unsaved changes to this request and re-renders the current route
 * with them, where `normalizeQuery` from `@preprio/toolkit/nextjs` applies
 * them. `PreprRefresh` calls it; there is no need to call it yourself.
 *
 * Inert outside preview: Next.js registers a server action in every build
 * that imports it, so anyone can call it on a production deployment. It
 * returns without reading the body, storing anything or re-rendering unless
 * the Prepr middleware handled the request with `preview: true`. The log is
 * validated as hostile input. Requires Next.js 16 or later (`refresh` from
 * `next/cache`); on older versions the call is a no-op and the page updates
 * on save only.
 */
export async function syncPreprLiveLog(log: unknown): Promise<void> {
  const refresh = (nextCache as { refresh?: () => void }).refresh;
  if (typeof refresh !== 'function') return;
  if (!isPreviewFromHeaders(await headers())) return;
  const parsed = parsePatchLog(log);
  if (!parsed.length) return;
  (await cookies()).set(LIVE_LOG_COOKIE, putLiveLog(parsed), {
    // Expired on arrival: the re-render of this request reads it, the
    // browser discards it.
    maxAge: 0,
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
  });
  refresh();
}
