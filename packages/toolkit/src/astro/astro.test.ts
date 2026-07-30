import { afterEach, describe, expect, it } from 'vitest';

import { onPreprRequest } from './index';

const ORIGINAL_PREPR_ENV = process.env.PREPR_ENV;

afterEach(() => {
  process.env.PREPR_ENV = ORIGINAL_PREPR_ENV;
});

/**
 * `Request`'s constructor strips the `Cookie` header (forbidden request
 * header per the Fetch spec) — same reason `core/middleware.test.ts` and
 * `nextjs/nextjs.test.ts` build requests via `new Request(url)` +
 * `headers.set()` after construction rather than passing `headers` to the
 * constructor.
 */
function makeRequest(
  url: string,
  init: { headers?: Record<string, string> } = {}
): Request {
  const request = new Request(url);
  for (const [key, value] of Object.entries(init.headers ?? {})) {
    request.headers.set(key, value);
  }
  return request;
}

describe('onPreprRequest', () => {
  it('mutates context.request.headers in place so downstream Astro.request.headers sees Prepr headers', async () => {
    const request = makeRequest('https://example.com/');
    const context = { request };

    let seenDuringNext: string | null = null;
    const next = async (): Promise<Response> => {
      // Astro's documented middleware pattern: context.request is the same
      // object instance seen by downstream middleware/pages, so mutating
      // its headers in place (rather than constructing a new Request) is
      // what makes the values visible via Astro.request.headers.
      seenDuringNext = context.request.headers.get('prepr-customer-id');
      return new Response('ok');
    };

    await onPreprRequest(context, next);

    expect(seenDuringNext).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    // The mutation persists after the call too.
    expect(context.request.headers.get('Prepr-Package')).toMatch(
      /^@preprio\/toolkit@/
    );
  });

  it('appends a Set-Cookie header to the response for each responseCookies entry', async () => {
    const request = makeRequest('https://example.com/');
    const next = async (): Promise<Response> => new Response('ok');

    const response = await onPreprRequest({ request }, next);

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toMatch(/^__prepr_uid=[0-9a-f-]{36}/);
    expect(setCookie).toMatch(/Max-Age=31536000/);
    expect(setCookie).toMatch(/Path=\//);
  });

  it('appends independent Set-Cookie headers for every responseCookies entry (multi-cookie preview scenario)', async () => {
    // A preview navigation that sets BOTH a segment and an A/B variant, with
    // no existing __prepr_uid cookie, produces three response cookies:
    // __prepr_uid + Prepr-Segments + Prepr-ABtesting. This proves the
    // `.append` mechanism keeps them as separate Set-Cookie headers rather
    // than collapsing them into one (which `.set` would have done).
    const request = makeRequest(
      'https://example.com/?prepr_preview_segment=seg-1&prepr_preview_ab=B'
    );
    const next = async (): Promise<Response> => new Response('ok');

    const response = await onPreprRequest({ request }, next, { preview: true });

    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(3);
    expect(setCookies.some(c => /^__prepr_uid=[0-9a-f-]{36}/.test(c))).toBe(true);
    expect(setCookies.some(c => c.startsWith('Prepr-Segments=seg-1'))).toBe(true);
    expect(setCookies.some(c => c.startsWith('Prepr-ABtesting=B'))).toBe(true);
    // Every cookie carries the standard attributes independently.
    for (const cookie of setCookies) {
      expect(cookie).toMatch(/Max-Age=31536000/);
      expect(cookie).toMatch(/Path=\//);
    }
  });

  it('does not overwrite an existing __prepr_uid cookie with a new Set-Cookie', async () => {
    const request = makeRequest('https://example.com/', {
      headers: { cookie: '__prepr_uid=existing-uuid' },
    });
    const next = async (): Promise<Response> => new Response('ok');

    const response = await onPreprRequest({ request }, next);

    expect(response.headers.get('set-cookie')).toBeNull();
    expect(request.headers.get('Prepr-Customer-Id')).toBe('existing-uuid');
  });

  it('returns the exact Response instance produced by next(), with cookies appended', async () => {
    const request = makeRequest('https://example.com/', {
      headers: { cookie: '__prepr_uid=existing-uuid' },
    });
    const nextResponse = new Response('body', { status: 201 });
    const next = async (): Promise<Response> => nextResponse;

    const response = await onPreprRequest({ request }, next);

    expect(response).toBe(nextResponse);
    expect(response.status).toBe(201);
  });

  describe('preview gate (options.preview alone decides)', () => {
    it('does not enable the preview bar when options.preview is not set', async () => {
      const request = makeRequest('https://example.com/');
      const context = { request };
      const next = async (): Promise<Response> => new Response('ok');

      await onPreprRequest(context, next);

      expect(context.request.headers.get('Prepr-Preview-Bar')).toBeNull();
    });

    it('enables the preview bar when options.preview is true', async () => {
      const request = makeRequest('https://example.com/');
      const context = { request };
      const next = async (): Promise<Response> => new Response('ok');

      await onPreprRequest(context, next, { preview: true });

      expect(context.request.headers.get('Prepr-Preview-Bar')).toBe('true');
    });

    it('ignores PREPR_ENV entirely', async () => {
      process.env.PREPR_ENV = 'production';
      const request = makeRequest('https://example.com/');
      const context = { request };
      const next = async (): Promise<Response> => new Response('ok');

      await onPreprRequest(context, next, { preview: true });

      expect(context.request.headers.get('Prepr-Preview-Bar')).toBe('true');
      delete process.env.PREPR_ENV;
    });
  });
});

describe('server helpers (Astro-friendly re-exports)', () => {
  it('getToolbarProps/getPreprHeaders/getActiveSegment/getActiveVariant/getPreprUUID read from a standard Headers object', async () => {
    const {
      getActiveSegment,
      getActiveVariant,
      getPreprHeaders,
      getPreprUUID,
    } = await import('./index');

    const headers = new Headers({
      'prepr-customer-id': 'uid-123',
      'Prepr-Segments': 'vip',
      'Prepr-ABtesting': 'B',
    });

    expect(getPreprUUID(headers)).toBe('uid-123');
    expect(getActiveSegment(headers)).toBe('vip');
    expect(getActiveVariant(headers)).toBe('B');
    expect(getPreprHeaders(headers)).toEqual({
      'prepr-customer-id': 'uid-123',
      'Prepr-Segments': 'vip',
      'Prepr-ABtesting': 'B',
    });
  });

  it('getToolbarProps delegates to core getToolbarPropsFromHeaders', async () => {
    const { getToolbarProps } = await import('./index');
    const headers = new Headers({ 'Prepr-Segments': 'vip' });

    const fetchMock = async (): Promise<Response> =>
      new Response(
        JSON.stringify({ data: { _Segments: [{ _id: 's1', name: 'VIP' }] } }),
        { status: 200 }
      );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const props = await getToolbarProps(headers, 'https://graphql.prepr.io/abc123');
      expect(props).toEqual({
        activeSegment: 'vip',
        activeVariant: null,
        segments: [{ _id: 's1', name: 'VIP' }],
        data: [{ _id: 's1', name: 'VIP' }],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('getToolbarProps is ungated — gating is the consumer\'s job', async () => {
    // getToolbarProps reads no env vars: it fetches whenever called. The
    // consumer decides when that is (import.meta.env.DEV in the layout, etc.).
    process.env.PREPR_ENV = 'production';
    const { getToolbarProps } = await import('./index');
    const headers = new Headers({ 'Prepr-Segments': 'vip' });

    const fetchMock = async (): Promise<Response> =>
      new Response(
        JSON.stringify({ data: { _Segments: [{ _id: 's1', name: 'VIP' }] } }),
        { status: 200 }
      );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const props = await getToolbarProps(headers, 'https://graphql.prepr.io/abc123');
      expect(props).toEqual({
        activeSegment: 'vip',
        activeVariant: null,
        segments: [{ _id: 's1', name: 'VIP' }],
        data: [{ _id: 's1', name: 'VIP' }],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
