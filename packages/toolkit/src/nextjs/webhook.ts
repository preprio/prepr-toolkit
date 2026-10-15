import { revalidateTag } from 'next/cache';

import {
  PREPR_ANY_ITEM_TAG,
  PREPR_SCHEMA_TAG,
  preprItemTag,
  preprModelTag,
} from '../core/graphql/cache-tags';

// Events that change what visitors see. `content_item.changed` and
// `.created` fire on draft edits, and visitor and segment events change no
// page, so those revalidate nothing. Asset edits show without a publish.
const CONTENT_EVENTS = new Set([
  'content_item.published',
  'content_item.unpublished',
  'content_item.deleted',
  'content_item.invalidated',
  'asset.changed',
  'asset.deleted',
]);
// Events after which list pages may show a different set of items.
const MODEL_EVENTS = new Set([
  'content_item.published',
  'content_item.unpublished',
  'content_item.deleted',
]);
// Prepr signs a fresh timestamp into every delivery, retries included, so an
// older one is a replayed request.
const MAX_AGE_MS = 5 * 60 * 1000;
// Hex or base64 HMAC-SHA256, optionally prefixed `sha256=`.
const HEX_SIGNATURE = /^[0-9a-f]{64}$/i;
const BASE64_SIGNATURE = /^[A-Za-z0-9+/]{43}=$/;
const SIGNATURE_PREFIX = /^sha256=/i;
// Keeps every tag within Next.js's 256-character limit.
const MAX_ID_LENGTH = 200;

/** How a revalidated page refreshes, as Next.js's `revalidateTag` takes it. */
export type PreprRevalidateProfile = string | { expire?: number };

export interface PreprWebhookOptions {
  /**
   * The webhook's ID, shown in Prepr under Settings → Webhooks. Prepr signs
   * each request with it (HMAC-SHA256 of the body, in the `Prepr-Signature`
   * header). Keep it in an environment variable.
   */
  secret: string | undefined;
  /**
   * Passed to `revalidateTag`. The default `{ expire: 0 }` shows a publish
   * on the very next request; `'max'` serves the old page once more while
   * the new one renders in the background.
   */
  profile?: PreprRevalidateProfile;
}

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });

/** The signature's bytes, or null when the header holds no HMAC-SHA256. */
function signatureBytes(header: string): Uint8Array<ArrayBuffer> | null {
  const value = header.trim().replace(SIGNATURE_PREFIX, '');
  if (HEX_SIGNATURE.test(value)) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  if (BASE64_SIGNATURE.test(value)) {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  }
  return null;
}

async function verify(
  secret: string,
  signature: Uint8Array<ArrayBuffer>,
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
  return crypto.subtle.verify('HMAC', key, signature, body);
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

/** Unix seconds or an ISO date (what Prepr sends); NaN when neither. */
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

/** The tags one verified event revalidates; empty for events that change no page. */
function tagsFor(event: Record<string, unknown>): string[] {
  const name = event.event;
  if (name === 'schema.changed') return [PREPR_SCHEMA_TAG];
  if (typeof name !== 'string' || !CONTENT_EVENTS.has(name)) return [];

  const tags = [PREPR_ANY_ITEM_TAG];
  const id = field(event.payload, 'id');
  if (usable(id)) tags.push(preprItemTag(id));
  const model = field(field(event.payload, 'model'), 'body_singular');
  if (MODEL_EVENTS.has(name) && usable(model)) tags.push(preprModelTag(model));
  return tags;
}

/**
 * Route handler for a Prepr webhook that refreshes only the cached pages
 * showing the changed item: those tagged by `query(..., { tagItems: true })`
 * or `preprCacheTags`. On publish, unpublish and delete it also revalidates
 * the item's `preprModelTag`, so list pages and lookups that found nothing
 * pick up new and removed items. `schema.changed` refreshes the schema the
 * client rewrites queries with.
 *
 * Other events (draft edits, new assets, visitors, segments) are
 * acknowledged and revalidate nothing, so the webhook can subscribe to
 * everything.
 *
 * Requests without a valid `Prepr-Signature` or older than five minutes get
 * 401; without `secret` every request gets 500.
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
  const { profile = { expire: 0 } } = options;
  return async (request) => {
    const { secret } = options;
    // An empty key would let anyone compute a valid signature.
    if (!secret) return text('Webhook secret not configured', 500);

    const signature = signatureBytes(
      request.headers.get('prepr-signature') ?? '',
    );
    let body: ArrayBuffer;
    try {
      body = await request.arrayBuffer();
    } catch {
      return text('Unreadable body', 400);
    }
    if (!signature || !(await verify(secret, signature, body))) {
      return text('Invalid signature', 401);
    }

    const event = parse(body);
    if (!event) return text('Invalid body', 400);
    const sentAt = eventTime(event.created_on);
    if (Number.isFinite(sentAt) && Math.abs(Date.now() - sentAt) > MAX_AGE_MS) {
      return text('Expired', 401);
    }

    const tags = tagsFor(event);
    for (const tag of tags) revalidateTag(tag, profile);
    return Response.json({ revalidated: tags });
  };
}
