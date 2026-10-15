// @vitest-environment node
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag }));

const { createPreprWebhookRoute } = await import('./webhook');

const SECRET = 'webhook-id';
const route = createPreprWebhookRoute({ secret: SECRET });

const sign = (body: string, secret = SECRET) =>
  createHmac('sha256', secret).update(body).digest('hex');

function event(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 'event',
    created_on: Math.floor(Date.now() / 1000),
    event: 'content_item.changed',
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
  it('revalidates the changed item', async () => {
    const response = await route(post(event()));
    expect(response.status).toBe(200);
    expect(revalidateTag.mock.calls).toEqual([
      ['prepr:any', 'max'],
      ['prepr:item', 'max'],
    ]);
  });

  it('also revalidates the model on publish, unpublish and delete', async () => {
    for (const name of [
      'content_item.published',
      'content_item.unpublished',
      'content_item.deleted',
    ]) {
      revalidateTag.mockClear();
      await route(post(event({ event: name })));
      expect(revalidateTag).toHaveBeenCalledWith('prepr:model:Post', 'max');
    }
  });

  it('verifies the signature over the exact body bytes Prepr sent', async () => {
    // PHP's json_encode escapes slashes and non-ASCII; re-encoding would differ.
    const now = Math.floor(Date.now() / 1000);
    const body = `{"created_on":${now},"payload":{"id":"a\\/b","label":"\\u00e9"}}`;
    expect((await route(post(body))).status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith('prepr:a/b', 'max');
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
      ['a non-string event', { event: 7, payload: { model: 'Post' } }],
      [
        'a non-object model',
        { event: 'content_item.published', payload: { model: 'Post' } },
      ],
    ])('revalidates only what is valid with %s', async (_, overrides) => {
      const response = await route(post(event(overrides)));
      expect(response.status).toBe(200);
      expect(revalidateTag.mock.calls).toEqual([['prepr:any', 'max']]);
    });
  });
});
