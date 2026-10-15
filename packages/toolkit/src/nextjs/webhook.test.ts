// @vitest-environment node
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag }));

const { createPreprWebhookRoute } = await import('./webhook');

const SECRET = 'webhook-id';
const NOW = { expire: 0 };
const route = createPreprWebhookRoute({ secret: SECRET });

const sign = (body: string, secret = SECRET) =>
  createHmac('sha256', secret).update(body).digest('hex');

function event(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 'event',
    created_on: Math.floor(Date.now() / 1000),
    event: 'content_item.published',
    payload: {
      id: 'item',
      model: { id: 'model-id', body_singular: 'Post' },
    },
    ...overrides,
  });
}

function post(body: string, signature: string | null = sign(body)) {
  return new Request('https://site.test/api/prepr/webhook', {
    method: 'POST',
    headers: signature === null ? {} : { 'Prepr-Signature': signature },
    body,
  });
}

beforeEach(() => revalidateTag.mockClear());

describe('createPreprWebhookRoute', () => {
  it('revalidates the published item and its model, at once', async () => {
    const response = await route(post(event()));
    expect(response.status).toBe(200);
    expect(revalidateTag.mock.calls).toEqual([
      ['prepr:any', NOW],
      ['prepr:item', NOW],
      ['prepr:model:post', NOW],
    ]);
  });

  it('revalidates an invalidated item without its model', async () => {
    await route(post(event({ event: 'content_item.invalidated' })));
    expect(revalidateTag.mock.calls).toEqual([
      ['prepr:any', NOW],
      ['prepr:item', NOW],
    ]);
  });

  it.each([
    'content_item.created',
    'content_item.changed',
    'asset.created',
    'person.changed',
    'segment.changed',
  ])('acknowledges %s without revalidating anything', async (name) => {
    const response = await route(post(event({ event: name })));
    expect(response.status).toBe(200);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('revalidates a changed asset, which shows without a publish', async () => {
    await route(post(event({ event: 'asset.changed', payload: { id: 'a' } })));
    expect(revalidateTag.mock.calls).toEqual([
      ['prepr:any', NOW],
      ['prepr:a', NOW],
    ]);
  });

  it('refreshes the schema on schema.changed', async () => {
    await route(post(event({ event: 'schema.changed', payload: {} })));
    expect(revalidateTag.mock.calls).toEqual([['prepr:schema', NOW]]);
  });

  it('passes the profile option to revalidateTag', async () => {
    const lazy = createPreprWebhookRoute({ secret: SECRET, profile: 'max' });
    await lazy(post(event()));
    expect(revalidateTag).toHaveBeenCalledWith('prepr:item', 'max');
  });

  it('accepts hex, base64 and sha256=-prefixed signatures', async () => {
    const body = event();
    const base64 = createHmac('sha256', SECRET).update(body).digest('base64');
    for (const signature of [sign(body), base64, `sha256=${sign(body)}`]) {
      expect((await route(post(body, signature))).status).toBe(200);
    }
  });

  it('also revalidates the model on publish, unpublish and delete', async () => {
    for (const name of [
      'content_item.published',
      'content_item.unpublished',
      'content_item.deleted',
    ]) {
      revalidateTag.mockClear();
      await route(post(event({ event: name })));
      expect(revalidateTag).toHaveBeenCalledWith('prepr:model:post', NOW);
    }
  });

  it('verifies the signature over the exact body bytes Prepr sent', async () => {
    // PHP's json_encode escapes slashes and non-ASCII; re-encoding would differ.
    const now = Math.floor(Date.now() / 1000);
    const body = `{"created_on":${now},"event":"content_item.published","payload":{"id":"a\\/b","label":"\\u00e9"}}`;
    expect((await route(post(body))).status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith('prepr:a/b', NOW);
  });

  it('rejects a missing, malformed or wrong signature with 401', async () => {
    const body = event();
    for (const signature of [
      null,
      '',
      'not-hex',
      sign(body).slice(0, 63),
      sign(body, 'other-secret'),
      sign(body + ' '),
    ]) {
      expect((await route(post(body, signature))).status).toBe(401);
    }
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects a replayed request older than five minutes', async () => {
    const body = event({ created_on: Math.floor(Date.now() / 1000) - 600 });
    expect((await route(post(body))).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('answers 500 without a secret instead of accepting an empty key', async () => {
    const body = event();
    const open = createPreprWebhookRoute({ secret: undefined });
    expect((await open(post(body, sign(body, '')))).status).toBe(500);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  describe('hostile bodies', () => {
    it.each([
      ['not JSON', '{"id":'],
      ['an array', '[1,2]'],
      ['null', 'null'],
      ['a string', '"x"'],
    ])('answers 400 for a signed body that is %s', async (_, body) => {
      expect((await route(post(body))).status).toBe(400);
      expect(revalidateTag).not.toHaveBeenCalled();
    });

    it.each([
      ['no payload', { payload: undefined }],
      ['a null payload', { payload: null }],
      ['a numeric id', { payload: { id: 42 } }],
      ['an oversized id', { payload: { id: 'x'.repeat(1000) } }],
      [
        'a non-object model',
        { event: 'content_item.published', payload: { model: 'Post' } },
      ],
    ])('revalidates only what is valid with %s', async (_, overrides) => {
      const response = await route(post(event(overrides)));
      expect(response.status).toBe(200);
      expect(revalidateTag.mock.calls).toEqual([['prepr:any', NOW]]);
    });

    it('revalidates nothing for a non-string event', async () => {
      const response = await route(post(event({ event: 7 })));
      expect(response.status).toBe(200);
      expect(revalidateTag).not.toHaveBeenCalled();
    });
  });
});
