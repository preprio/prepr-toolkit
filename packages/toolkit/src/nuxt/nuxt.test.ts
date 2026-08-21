// @vitest-environment node
//
// `handlePreprRequest` is Nitro server middleware — no DOM, and it runs on the
// runtime's own `Headers`. See the note in core/middleware.test.ts.
import { describe, expect, it } from 'vitest';

import {
  handlePreprRequest,
  getPreprHeadersFromEvent,
  type H3EventLike,
} from './middleware';

function makeEvent(
  url = '/',
  headers: Record<string, string | string[]> = {}
): H3EventLike & { setCookies: string[] } {
  const setCookies: string[] = [];
  return {
    node: {
      req: { url, headers: { host: 'example.com', ...headers } },
      res: {
        appendHeader(name: string, value: string) {
          if (name.toLowerCase() === 'set-cookie') setCookies.push(value);
        },
      },
    },
    context: {},
    setCookies,
  };
}

describe('handlePreprRequest', () => {
  it('folds computed Prepr headers back onto the raw Node request, lowercased', () => {
    const event = makeEvent();

    handlePreprRequest(event);

    expect(event.node.req.headers['prepr-customer-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(event.node.req.headers['prepr-package']).toMatch(/^@preprio\/toolkit@/);
  });

  it('mirrors the same Headers onto event.context.prepr', () => {
    const event = makeEvent();

    handlePreprRequest(event);

    const headers = getPreprHeadersFromEvent(event);
    expect(headers.get('prepr-customer-id')).toBe(
      event.node.req.headers['prepr-customer-id']
    );
  });

  it('getPreprHeadersFromEvent returns empty Headers when the middleware did not run', () => {
    expect([...getPreprHeadersFromEvent({ context: {} }).keys()]).toEqual([]);
  });

  it('appends a Set-Cookie header for the generated uid', () => {
    const event = makeEvent();

    handlePreprRequest(event);

    expect(event.setCookies).toHaveLength(1);
    expect(event.setCookies[0]).toMatch(/^__prepr_uid=[0-9a-f-]{36}/);
    expect(event.setCookies[0]).toMatch(/Max-Age=31536000/);
    expect(event.setCookies[0]).toMatch(/Path=\//);
  });

  it('appends independent Set-Cookie headers for every entry (multi-cookie preview)', () => {
    const event = makeEvent('/?prepr_preview_segment=seg-1&prepr_preview_ab=B');

    handlePreprRequest(event, { preview: true });

    expect(event.setCookies).toHaveLength(4);
    expect(event.setCookies.some(c => /^__prepr_uid=[0-9a-f-]{36}/.test(c))).toBe(true);
    expect(event.setCookies.some(c => c.startsWith('Prepr-Segments=seg-1'))).toBe(true);
    expect(event.setCookies.some(c => c.startsWith('Prepr-ABtesting=B'))).toBe(true);
  });

  it('does not overwrite an existing __prepr_uid cookie', () => {
    const event = makeEvent('/', { cookie: '__prepr_uid=existing-uuid' });

    handlePreprRequest(event);

    expect(event.setCookies).toHaveLength(0);
    expect(event.node.req.headers['prepr-customer-id']).toBe('existing-uuid');
  });

  it('joins multi-value Node headers before forwarding them', () => {
    const event = makeEvent('/', { 'x-real-ip': ['1.2.3.4', '5.6.7.8'] });

    handlePreprRequest(event);

    expect(event.node.req.headers['prepr-visitor-ip']).toBe('1.2.3.4, 5.6.7.8');
  });

  describe('preview gate (options.preview alone decides)', () => {
    it('no preview bar when options.preview unset', () => {
      const event = makeEvent();

      handlePreprRequest(event);

      expect(event.node.req.headers['prepr-preview-bar']).toBeUndefined();
    });

    it('enables preview bar when options.preview is true', () => {
      const event = makeEvent();

      handlePreprRequest(event, { preview: true });

      expect(event.node.req.headers['prepr-preview-bar']).toBe('true');
    });
  });
});

describe('server helpers (Nuxt re-exports)', () => {
  it('read from a standard Headers object', async () => {
    const { getActiveSegment, getActiveVariant, getPreprHeaders, getPreprUUID } =
      await import('./index');

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
