import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPreprMiddleware } from './middleware';

// React 19's act() warns unless the environment opts in explicitly.
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ORIGINAL_PREPR_ENV = process.env.PREPR_ENV;

afterEach(() => {
  process.env.PREPR_ENV = ORIGINAL_PREPR_ENV;
  vi.unstubAllGlobals();
});

/**
 * Cookie is a forbidden request header per the Fetch spec, so the NextRequest
 * constructor strips it — headers have to be set after construction (same
 * workaround as core/middleware.test.ts). Doesn't affect real middleware, which
 * receives the incoming request object rather than building one.
 */
function makeRequest(
  url: string,
  init: { headers?: Record<string, string> } = {}
): NextRequest {
  const request = new NextRequest(url);
  for (const [key, value] of Object.entries(init.headers ?? {})) {
    request.headers.set(key, value);
  }
  return request;
}

describe('createPreprMiddleware', () => {
  it('sets request headers (visible via response.headers from NextResponse.next) and __prepr_uid response cookie', () => {
    const request = makeRequest('https://example.com/');
    const response = createPreprMiddleware(request);

    // Forwarded request headers only materialise inside the Next runtime, so
    // here we assert the response cookie jar. core/middleware.test.ts covers
    // the header-forwarding itself.
    const uidCookie = response.cookies.get('__prepr_uid');
    expect(uidCookie).toBeDefined();
    expect(uidCookie?.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('reuses an existing __prepr_uid cookie from the request instead of minting one', () => {
    const request = makeRequest('https://example.com/', {
      headers: { cookie: '__prepr_uid=existing-uuid' },
    });
    const response = createPreprMiddleware(request);

    expect(response.cookies.get('__prepr_uid')).toBeUndefined();
    expect(
      response.headers.get('x-middleware-request-prepr-customer-id-created')
    ).toBeNull();
    expect(response.headers.get('x-middleware-request-prepr-customer-id')).toBe(
      'existing-uuid'
    );
  });

  it('forwards Prepr-Package on the request headers reachable from the returned response', () => {
    const request = makeRequest('https://example.com/');
    const response = createPreprMiddleware(request);

    // next() stashes forwarded request headers as an internal
    // x-middleware-override-headers / x-middleware-request-* pair.
    const overrideHeaders = response.headers.get('x-middleware-override-headers');
    expect(overrideHeaders).toContain('Prepr-Package');
    expect(response.headers.get('x-middleware-request-prepr-package')).toMatch(
      /^@preprio\/toolkit@/
    );
  });

  it('accepts a chained NextResponse as the second argument and copies request headers onto it', () => {
    const request = makeRequest('https://example.com/');
    const chained = NextResponse.redirect('https://example.com/elsewhere');

    const response = createPreprMiddleware(request, chained);

    expect(response).toBe(chained);
    expect(response.headers.get('prepr-customer-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('accepts options as the second argument when no response is chained', () => {
    const request = makeRequest('https://example.com/', {
      headers: { cookie: '__prepr_uid=fixed-uid' },
    });
    const response = createPreprMiddleware(request, { version: '9.9.9' });

    expect(response.headers.get('x-middleware-request-prepr-package')).toBe(
      '@preprio/toolkit@9.9.9'
    );
  });

  describe('preview gate (options.preview alone decides)', () => {
    it('does not enable the preview bar when options.preview is not set', () => {
      const request = makeRequest('https://example.com/');
      const response = createPreprMiddleware(request);

      expect(response.headers.get('x-middleware-request-prepr-preview-bar')).toBeNull();
    });

    it('enables the preview bar when options.preview is true', () => {
      const request = makeRequest('https://example.com/');
      const response = createPreprMiddleware(request, { preview: true });

      expect(response.headers.get('x-middleware-request-prepr-preview-bar')).toBe('true');
    });

    it('ignores PREPR_ENV entirely', () => {
      process.env.PREPR_ENV = 'production';
      const request = makeRequest('https://example.com/');
      const response = createPreprMiddleware(request, { preview: true });

      expect(response.headers.get('x-middleware-request-prepr-preview-bar')).toBe('true');
    });
  });
});

describe('server helpers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getPreprUUID/getActiveSegment/getActiveVariant read from next/headers headers()', async () => {
    vi.doMock('next/headers', () => ({
      headers: async () =>
        new Headers({
          'prepr-customer-id': 'uid-123',
          'Prepr-Segments': 'vip',
          'Prepr-ABtesting': 'B',
        }),
    }));

    const { getActiveSegment, getActiveVariant, getPreprUUID } = await import('./server');

    await expect(getPreprUUID()).resolves.toBe('uid-123');
    await expect(getActiveSegment()).resolves.toBe('vip');
    await expect(getActiveVariant()).resolves.toBe('B');
  });

  it('getPreprHeaders collects Prepr-prefixed headers via core getPreprHeadersFromHeaders', async () => {
    vi.doMock('next/headers', () => ({
      headers: async () =>
        new Headers({
          'Prepr-Segments': 'vip',
          'Prepr-ABtesting': 'A',
          'x-other': 'ignored',
        }),
    }));

    const { getPreprHeaders } = await import('./server');
    const result = await getPreprHeaders();

    expect(result).toEqual({ 'Prepr-Segments': 'vip', 'Prepr-ABtesting': 'A' });
  });

  it('supports a synchronous next/headers headers() (Next <15 compatibility)', async () => {
    vi.doMock('next/headers', () => ({
      headers: () => new Headers({ 'prepr-customer-id': 'sync-uid' }),
    }));

    const { getPreprUUID } = await import('./server');
    await expect(getPreprUUID()).resolves.toBe('sync-uid');
  });

  describe('getToolbarProps', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('is ungated — fetches regardless of PREPR_ENV, the caller decides when to call it', async () => {
      process.env.PREPR_ENV = 'production';
      vi.doMock('next/headers', () => ({
        headers: async () => new Headers({ 'Prepr-Segments': 'vip' }),
      }));
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { _Segments: [] } }), { status: 200 })
      );
      vi.stubGlobal('fetch', fetchMock);

      const { getToolbarProps } = await import('./server');
      const props = await getToolbarProps('https://graphql.prepr.io/abc123');

      expect(fetchMock).toHaveBeenCalled();
      expect(props.activeSegment).toBe('vip');
    });

    it('fetches segments and reads active segment/variant from headers', async () => {
      vi.doMock('next/headers', () => ({
        headers: async () =>
          new Headers({ 'Prepr-Segments': 'vip', 'Prepr-ABtesting': 'A' }),
      }));
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: { _Segments: [{ _id: 's1', name: 'VIP' }] } }),
          { status: 200 }
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      const { getToolbarProps } = await import('./server');
      const props = await getToolbarProps('https://graphql.prepr.io/abc123');

      expect(props).toEqual({
        activeSegment: 'vip',
        activeVariant: 'A',
        segments: [{ _id: 's1', name: 'VIP' }],
        data: [{ _id: 's1', name: 'VIP' }],
      });
    });

    it('never throws — returns empty data if the segments fetch fails', async () => {
      vi.doMock('next/headers', () => ({
        headers: async () => new Headers({ 'Prepr-Segments': 'vip' }),
      }));
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

      const { getToolbarProps } = await import('./server');
      await expect(
        getToolbarProps('https://graphql.prepr.io/abc123')
      ).resolves.toEqual({ activeSegment: 'vip', activeVariant: null, segments: [], data: [] });
    });
  });
});

describe('token helper re-exports (Fix 5 — old package exposed these from the Next entry)', () => {
  it('re-exports validatePreprToken, extractAccessToken and PreprError from ./index', async () => {
    const mod = await import('./index');

    expect(typeof mod.validatePreprToken).toBe('function');
    expect(typeof mod.extractAccessToken).toBe('function');
    expect(typeof mod.PreprError).toBe('function');

    expect(mod.extractAccessToken('https://graphql.prepr.io/abc123')).toBe('abc123');
    expect(() => mod.validatePreprToken('')).toThrow(mod.PreprError);
    expect(() =>
      mod.validatePreprToken('https://graphql.prepr.io/abc123')
    ).not.toThrow();
  });
});

describe('components', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('PreprToolbar mounts createPreprToolbar on effect and destroys it on unmount, returns null', async () => {
    const destroy = vi.fn();
    const createPreprToolbar = vi.fn().mockReturnValue({ destroy });

    vi.doMock('../core/create-toolbar', () => ({ createPreprToolbar }));
    vi.doMock('next/navigation', () => ({
      useRouter: () => ({ push: vi.fn() }),
      usePathname: () => '/blog',
    }));

    const React = await import('react');
    const { default: ReactDOMClient } = await import('react-dom/client');
    const { PreprToolbar } = await import('./components');

    const props = { activeSegment: null, activeVariant: null, data: [] };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOMClient.createRoot(container);

    await React.act(async () => {
      root.render(React.createElement(PreprToolbar, props));
    });

    expect(createPreprToolbar).toHaveBeenCalledTimes(1);
    expect(createPreprToolbar).toHaveBeenCalledWith(
      expect.objectContaining({ props })
    );

    await React.act(async () => {
      root.unmount();
    });
    expect(destroy).toHaveBeenCalledTimes(1);

    container.remove();
  });

  it('PreprTrackingPixel calls loadTrackingPixel on effect, returns null', async () => {
    const loadTrackingPixel = vi.fn();
    vi.doMock('../core/pixel', () => ({ loadTrackingPixel }));
    vi.doMock('next/navigation', () => ({
      useRouter: () => ({ push: vi.fn() }),
      usePathname: () => '/blog',
    }));

    const React = await import('react');
    const { default: ReactDOMClient } = await import('react-dom/client');
    const { PreprTrackingPixel } = await import('./components');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOMClient.createRoot(container);

    await React.act(async () => {
      root.render(React.createElement(PreprTrackingPixel, { id: 'abc123' }));
    });

    expect(loadTrackingPixel).toHaveBeenCalledWith('abc123', undefined);

    await React.act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
