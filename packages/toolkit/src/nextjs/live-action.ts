'use server';

import * as nextCache from 'next/cache';
import { cookies } from 'next/headers';

import { parsePatchLog } from '../core/live-preview/normalize-query';
import { LIVE_LOG_COOKIE, putLiveLog } from './live-log';

/**
 * Server action behind live preview for server components: it hands the
 * editor's unsaved changes to this request and re-renders the current route
 * with them, where `normalizeQuery` from `@preprio/toolkit/nextjs` applies
 * them. `PreprRefresh` calls it; there is no need to call it yourself.
 *
 * Safe to ship in a production build: it only ever changes the response to
 * the request that called it, and a render applies the changes only when
 * the site passes `enabled: true` to `normalizeQuery`. The log is validated
 * as hostile input. Requires Next.js 16 or later (`refresh` from
 * `next/cache`); on older versions the call is a no-op and the page updates
 * on save only.
 */
export async function syncPreprLiveLog(log: unknown): Promise<void> {
  const refresh = (nextCache as { refresh?: () => void }).refresh;
  if (typeof refresh !== 'function') return;
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
