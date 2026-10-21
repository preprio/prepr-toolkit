'use server';

import * as nextCache from 'next/cache';
import { cookies, headers } from 'next/headers';

import { parsePatchLog } from '../core/live-preview/normalize-query';
import { isPreviewFromHeaders } from '../core/server';
import { LIVE_LOG_COOKIE, putLiveLog } from './live-log';

/**
 * Server action that re-renders the current route with the editor's unsaved
 * changes, for `normalizeQuery` to apply. Called by `PreprRefresh`.
 *
 * Anyone can call a server action on a production deployment, so it does
 * nothing unless the Prepr middleware ran with `preview: true`, and the log
 * is validated as hostile input. Requires Next.js 16 (`refresh`); on older
 * versions it is a no-op and the page updates on save only.
 */
export async function syncPreprLiveLog(log: unknown): Promise<void> {
  const refresh = (nextCache as { refresh?: () => void }).refresh;
  if (typeof refresh !== 'function') return;
  if (!isPreviewFromHeaders(await headers())) return;
  const parsed = parsePatchLog(log);
  if (!parsed.length) return;
  (await cookies()).set(LIVE_LOG_COOKIE, putLiveLog(parsed), {
    // Expired on arrival: only the re-render of this request reads it.
    maxAge: 0,
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
  });
  refresh();
}
