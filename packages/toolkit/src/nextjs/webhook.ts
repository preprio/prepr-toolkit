import { revalidateTag } from 'next/cache';

import {
  PREPR_ANY_ITEM_TAG,
  preprItemTag,
  preprModelTag,
} from '../core/graphql/cache-tags';

// Events after which list pages may show a different set of items.
const MODEL_EVENTS = new Set([
  'content_item.published',
  'content_item.unpublished',
  'content_item.deleted',
]);
// Prepr signs a fresh timestamp into every delivery, retries included, so an
// older one is a replayed request.
const MAX_AGE_MS = 5 * 60 * 1000;
const SIGNATURE = /^[0-9a-f]{64}$/i;
// Keeps every tag within Next.js's 256-character limit.
const MAX_ID_LENGTH = 200;

export interface PreprWebhookOptions {
  /**
   * The webhook's ID, shown in Prepr under Settings → Webhooks. Prepr signs
   * each request with it (HMAC-SHA256 of the body, in the `Prepr-Signature`
   * header). Keep it in an environment variable.
   */
  secret: string | undefined;
}

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function verify(
  secret: string,
  signature: string,
  body: ArrayBuffer,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  // subtle.verify compares in constant time.
  return crypto.subtle.verify('HMAC', key, hexToBytes(signature), body);
}

function parse(body: ArrayBuffer): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(body));
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Unix seconds (what Prepr sends) or an ISO date; NaN when neither. */
function eventTime(value: unknown): number {
  if (typeof value === 'number') return value * 1000;
  if (typeof value === 'string') return Date.parse(value);
  return NaN;
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

const usable = (value: unknown): value is string =>
  typeof value === 'string' && value !== '' && value.length <= MAX_ID_LENGTH;

/**
 * Route handler for a Prepr webhook that refreshes only the cached pages
 * showing the changed item: those tagged with `preprCacheTags` (or
 * `query(..., { tagItems: true })`). On publish, unpublish and delete it also
 * revalidates the item's `preprModelTag`, so list pages pick up new and
 * removed items. Every event revalidates `PREPR_ANY_ITEM_TAG`.
 *
 * Requests without a valid `Prepr-Signature` or older than five minutes get
 * 401; without `secret` every request gets 500. Uses
 * `revalidateTag(tag, 'max')`: the next visit gets the cached page while a
 * fresh one renders.
 *
 * @example
 * // app/api/prepr/webhook/route.ts
 * export const POST = createPreprWebhookRoute({
 *   secret: process.env.PREPR_WEBHOOK_SECRET,
 * });
 */
export function createPreprWebhookRoute(
  options: PreprWebhookOptions,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const { secret } = options;
    // An empty key would let anyone compute a valid signature.
    if (!secret) return text('Webhook secret not configured', 500);

    const signature = request.headers.get('prepr-signature') ?? '';
    let body: ArrayBuffer;
    try {
      body = await request.arrayBuffer();
    } catch {
      return text('Unreadable body', 400);
    }
    if (
      !SIGNATURE.test(signature) ||
      !(await verify(secret, signature, body))
    ) {
      return text('Invalid signature', 401);
    }

    const event = parse(body);
    if (!event) return text('Invalid body', 400);
    const sentAt = eventTime(event.created_on);
    if (Number.isFinite(sentAt) && Math.abs(Date.now() - sentAt) > MAX_AGE_MS) {
      return text('Expired', 401);
    }

    const tags = [PREPR_ANY_ITEM_TAG];
    const id = field(event.payload, 'id');
    if (usable(id)) tags.push(preprItemTag(id));
    const model = field(field(event.payload, 'model'), 'body_singular');
    if (typeof event.event === 'string' && MODEL_EVENTS.has(event.event)) {
      if (usable(model)) tags.push(preprModelTag(model));
    }

    for (const tag of tags) revalidateTag(tag, 'max');
    return Response.json({ revalidated: tags });
  };
}
