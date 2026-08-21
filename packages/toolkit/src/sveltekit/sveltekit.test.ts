// @vitest-environment node
//
// `preprHandle` is server-side middleware — no DOM, and it runs on the
// runtime's own `Headers`. See the note in core/middleware.test.ts.
import { describe, expect, it } from 'vitest';

import { preprHandle, getPreprHeadersFromLocals } from './hooks';

// The `Request` constructor drops `Cookie` (forbidden header per Fetch), so
// headers have to be set after construction.
function makeRequest(
  url: string,
  init: { headers?: Record<string, string> } = {},
): Request {
  const request = new Request(url);
  for (const [key, value] of Object.entries(init.headers ?? {})) {
    request.headers.set(key, value);
  }
  return request;
}

describe('preprHandle', () => {
  it('stashes computed Prepr headers on event.locals so load fns can read them', async () => {
    const request = makeRequest('https://example.com/');
    const event = { request, locals: {} as Record<string, unknown> };

    let seenDuringResolve: string | null = null;
    const resolve = async (): Promise<Response> => {
      // Must already be set by the time resolve() runs, not after.
      seenDuringResolve = getPreprHeadersFromLocals(event.locals).get(
        'prepr-customer-id',
      );
      return new Response('ok');
    };

    await preprHandle()({ event, resolve });

    expect(seenDuringResolve).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(
      getPreprHeadersFromLocals(event.locals).get('Prepr-Package'),
    ).toMatch(/^@preprio\/toolkit@/);
  });

  it('getPreprHeadersFromLocals returns an empty Headers when preprHandle did not run', () => {
    expect([...getPreprHeadersFromLocals({}).keys()]).toEqual([]);
  });

  // SvelteKit threads the same `Request` instance from `handle` into `load`
  // (both hops shallow-spread the event), so mutating headers in place is the
  // primary channel — `locals` only mirrors it. Verified vs @sveltejs/kit 2.70.1.
  it('also mutates event.request.headers in place, mirroring the locals copy', async () => {
    const request = makeRequest('https://example.com/');
    const event = { request, locals: {} as Record<string, unknown> };
    const resolve = async (): Promise<Response> => new Response('ok');

    await preprHandle()({ event, resolve });

    // The spread SvelteKit performs before calling `load` copies by reference.
    const loadEvent = { ...event };
    expect(loadEvent.request).toBe(request);
    expect(loadEvent.request.headers.get('prepr-customer-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // Both channels agree.
    expect(
      getPreprHeadersFromLocals(event.locals).get('prepr-customer-id'),
    ).toBe(loadEvent.request.headers.get('prepr-customer-id'));
  });

  it('works when the event has no locals (non-page endpoints, hand-built events)', async () => {
    const request = makeRequest('https://example.com/');
    const resolve = async (): Promise<Response> => new Response('ok');

    await preprHandle()({ event: { request }, resolve });

    expect(request.headers.get('prepr-customer-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('appends a Set-Cookie header for each responseCookies entry', async () => {
    const request = makeRequest('https://example.com/');
    const resolve = async (): Promise<Response> => new Response('ok');

    const response = await preprHandle()({
      event: { request, locals: {} },
      resolve,
    });

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toMatch(/^__prepr_uid=[0-9a-f-]{36}/);
    expect(setCookie).toMatch(/Max-Age=31536000/);
    expect(setCookie).toMatch(/Path=\//);
  });

  it('appends independent Set-Cookie headers for every entry (multi-cookie preview)', async () => {
    const request = makeRequest(
      'https://example.com/?prepr_preview_segment=seg-1&prepr_preview_ab=B',
    );
    const resolve = async (): Promise<Response> => new Response('ok');

    const response = await preprHandle({ preview: true })({
      event: { request, locals: {} },
      resolve,
    });

    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(4);
    expect(setCookies.some((c) => /^__prepr_uid=[0-9a-f-]{36}/.test(c))).toBe(
      true,
    );
    expect(setCookies.some((c) => c.startsWith('Prepr-Segments=seg-1'))).toBe(
      true,
    );
    expect(setCookies.some((c) => c.startsWith('Prepr-ABtesting=B'))).toBe(
      true,
    );
    for (const cookie of setCookies) {
      expect(cookie).toMatch(/Max-Age=31536000/);
      expect(cookie).toMatch(/Path=\//);
    }
  });

  it('does not overwrite an existing __prepr_uid cookie', async () => {
    const request = makeRequest('https://example.com/', {
      headers: { cookie: '__prepr_uid=existing-uuid' },
    });
    const resolve = async (): Promise<Response> => new Response('ok');

    const event = { request, locals: {} as Record<string, unknown> };
    const response = await preprHandle()({ event, resolve });

    expect(response.headers.get('set-cookie')).toBeNull();
    // Existing uid is still forwarded via locals.
    expect(
      getPreprHeadersFromLocals(event.locals).get('Prepr-Customer-Id'),
    ).toBe('existing-uuid');
  });

  it('returns the exact Response produced by resolve(), with cookies appended', async () => {
    const request = makeRequest('https://example.com/', {
      headers: { cookie: '__prepr_uid=existing-uuid' },
    });
    const resolved = new Response('body', { status: 201 });
    const resolve = async (): Promise<Response> => resolved;

    const response = await preprHandle()({
      event: { request, locals: {} },
      resolve,
    });

    expect(response).toBe(resolved);
    expect(response.status).toBe(201);
  });

  describe('preview gate (options.preview alone decides)', () => {
    it('no preview bar when options.preview unset', async () => {
      const request = makeRequest('https://example.com/');
      const event = { request, locals: {} as Record<string, unknown> };
      const resolve = async (): Promise<Response> => new Response('ok');

      await preprHandle()({ event, resolve });

      expect(
        getPreprHeadersFromLocals(event.locals).get('Prepr-Preview-Bar'),
      ).toBeNull();
    });

    it('enables preview bar when options.preview is true', async () => {
      const request = makeRequest('https://example.com/');
      const event = { request, locals: {} as Record<string, unknown> };
      const resolve = async (): Promise<Response> => new Response('ok');

      await preprHandle({ preview: true })({ event, resolve });

      expect(
        getPreprHeadersFromLocals(event.locals).get('Prepr-Preview-Bar'),
      ).toBe('true');
    });

    it('ignores PREPR_ENV entirely', async () => {
      process.env.PREPR_ENV = 'production';
      const request = makeRequest('https://example.com/');
      const event = { request, locals: {} as Record<string, unknown> };
      const resolve = async (): Promise<Response> => new Response('ok');

      await preprHandle({ preview: true })({ event, resolve });

      expect(
        getPreprHeadersFromLocals(event.locals).get('Prepr-Preview-Bar'),
      ).toBe('true');
      delete process.env.PREPR_ENV;
    });
  });
});

describe('server helpers (SvelteKit re-exports)', () => {
  it('read from a standard Headers object', async () => {
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

  it('getToolbarProps delegates to core — ungated', async () => {
    const { getToolbarProps } = await import('./index');
    const headers = new Headers({ 'Prepr-Segments': 'vip' });

    const fetchMock = async (): Promise<Response> =>
      new Response(
        JSON.stringify({ data: { _Segments: [{ _id: 's1', name: 'VIP' }] } }),
        { status: 200 },
      );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const props = await getToolbarProps(
        headers,
        'https://graphql.prepr.io/abc123',
      );
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
