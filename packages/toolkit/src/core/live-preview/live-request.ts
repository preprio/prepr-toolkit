import { HEADER_LIVE_RENDER } from '../constants';
import { parsePatchLog, type LivePatch } from './normalize-query';

// Matches the cap `parsePatchLog` applies to log text.
const MAX_BODY_BYTES = 1_000_000;

/**
 * The editor's unsaved changes carried by a live-preview re-render request
 * (sent by `startHtmlLivePreview`), or an empty list for any other request.
 *
 * Accepted only from a same-origin `POST` with the live-preview header and a
 * JSON body, so a link, a form on another site or a cacheable `GET` can never
 * inject changes. Call it only when the site runs in preview, and mark the
 * response uncacheable (`Cache-Control: private, no-store`) whenever it
 * returns changes. Never throws.
 */
export async function readLiveLogFromRequest(
  request: Request,
): Promise<LivePatch[]> {
  try {
    if (request.method !== 'POST') return [];
    if (request.headers.get(HEADER_LIVE_RENDER) !== '1') return [];
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) return [];
    const type = request.headers.get('content-type') ?? '';
    if (!type.toLowerCase().startsWith('application/json')) return [];
    const length = Number(request.headers.get('content-length') ?? '0');
    if (length > MAX_BODY_BYTES) return [];
    const text = await request.clone().text();
    if (text.length > MAX_BODY_BYTES) return [];
    const body = JSON.parse(text) as { log?: unknown };
    return parsePatchLog(body?.log);
  } catch {
    return [];
  }
}
