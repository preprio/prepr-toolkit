// @vitest-environment node
//
// Server helpers: these read a standard `Headers` and call `fetch`, never a
// DOM. See the note in core/middleware.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PreprError,
  extractAccessToken,
  getActiveSegmentFromHeaders,
  getActiveVariantFromHeaders,
  getPreprEnvironmentSegments,
  getPreprHeadersFromHeaders,
  getPreprUUIDFromHeaders,
  getToolbarPropsFromHeaders,
  validatePreprToken,
} from './server';

function makeHeaders(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe('header extraction from synthetic Headers', () => {
  it('getPreprUUIDFromHeaders reads prepr-customer-id', () => {
    const headers = makeHeaders({ 'prepr-customer-id': 'uid-123' });
    expect(getPreprUUIDFromHeaders(headers)).toBe('uid-123');
  });

  it('getPreprUUIDFromHeaders returns null when absent', () => {
    const headers = makeHeaders({});
    expect(getPreprUUIDFromHeaders(headers)).toBeNull();
  });

  it('getActiveSegmentFromHeaders reads Prepr-Segments', () => {
    const headers = makeHeaders({ 'Prepr-Segments': 'vip' });
    expect(getActiveSegmentFromHeaders(headers)).toBe('vip');
  });

  it('getActiveSegmentFromHeaders returns null when absent', () => {
    const headers = makeHeaders({});
    expect(getActiveSegmentFromHeaders(headers)).toBeNull();
  });

  it('getActiveVariantFromHeaders reads Prepr-ABtesting', () => {
    const headers = makeHeaders({ 'Prepr-ABtesting': 'B' });
    expect(getActiveVariantFromHeaders(headers)).toBe('B');
  });

  it('getActiveVariantFromHeaders returns null when absent', () => {
    const headers = makeHeaders({});
    expect(getActiveVariantFromHeaders(headers)).toBeNull();
  });

  it('getPreprHeadersFromHeaders collects prepr-prefixed headers, case-insensitively', () => {
    const headers = makeHeaders({
      'prepr-customer-id': 'uid-123',
      'Prepr-Segments': 'vip',
      'Prepr-ABtesting': 'B',
      'x-other-header': 'ignored',
    });
    const result = getPreprHeadersFromHeaders(headers);
    expect(result).toEqual({
      'prepr-customer-id': 'uid-123',
      'Prepr-Segments': 'vip',
      'Prepr-ABtesting': 'B',
    });
    expect(result).not.toHaveProperty('x-other-header');
  });

  it('getPreprHeadersFromHeaders returns keys in the exact casing declared by PreprHeaders', () => {
    // Incoming names are wire-lowercased, as real runtimes deliver them.
    const headers = makeHeaders({
      'prepr-segments': 'vip',
      'prepr-abtesting': 'A',
      'prepr-visitor-ip': '1.2.3.4',
      'prepr-hubspot-id': 'hutk-1',
      'prepr-context-utm_source': 'google',
      'prepr-preview-bar': 'true',
      'prepr-customer-id-created': 'true',
      'prepr-context-initial_referral': 'https://google.com/',
    });
    const result = getPreprHeadersFromHeaders(headers);
    expect(Object.keys(result).sort()).toEqual(
      [
        'Prepr-Segments',
        'Prepr-ABtesting',
        'Prepr-Visitor-IP',
        'Prepr-Hubspot-Id',
        'Prepr-Context-utm_source',
        'Prepr-Preview-Bar',
        'Prepr-Customer-Id-Created',
        'Prepr-Context-initial_referral',
      ].sort()
    );
    expect(result['Prepr-Segments']).toBe('vip');
    expect(result['Prepr-ABtesting']).toBe('A');
    expect(result['Prepr-Visitor-IP']).toBe('1.2.3.4');
  });

  it('getPreprHeadersFromHeaders returns prepr-user-agent under the declared Prepr-User-Agent key', () => {
    const headers = makeHeaders({
      'prepr-user-agent': 'Mozilla/5.0 Test',
    });
    const result = getPreprHeadersFromHeaders(headers);
    expect(result).toEqual({ 'Prepr-User-Agent': 'Mozilla/5.0 Test' });
    expect(result).not.toHaveProperty('User-Agent');
    expect(result).not.toHaveProperty('prepr-user-agent');
  });
});

describe('validatePreprToken', () => {
  it('accepts a valid https://graphql.prepr.io/<token> url', () => {
    expect(() =>
      validatePreprToken('https://graphql.prepr.io/abc123')
    ).not.toThrow();
  });

  it('throws PreprError with MISSING_TOKEN when token is empty', () => {
    expect(() => validatePreprToken('')).toThrow(PreprError);
    try {
      validatePreprToken('');
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PreprError);
      expect((error as PreprError).code).toBe('MISSING_TOKEN');
    }
  });

  it('throws PreprError with INVALID_TOKEN for a non-https url', () => {
    expect(() => validatePreprToken('http://graphql.prepr.io/abc123')).toThrow(
      PreprError
    );
    try {
      validatePreprToken('http://graphql.prepr.io/abc123');
      expect.fail('should have thrown');
    } catch (error) {
      expect((error as PreprError).code).toBe('INVALID_TOKEN');
    }
  });

  it('throws PreprError with INVALID_TOKEN for garbage input', () => {
    expect(() => validatePreprToken('not-a-url')).toThrow(PreprError);
    try {
      validatePreprToken('not-a-url');
      expect.fail('should have thrown');
    } catch (error) {
      expect((error as PreprError).code).toBe('INVALID_TOKEN');
    }
  });
});

describe('extractAccessToken', () => {
  it('extracts the token segment from a valid graphql.prepr.io url', () => {
    expect(extractAccessToken('https://graphql.prepr.io/abc123')).toBe(
      'abc123'
    );
  });

  it('throws PreprError for a non graphql.prepr.io hostname', () => {
    expect(() => extractAccessToken('https://example.com/abc123')).toThrow(
      PreprError
    );
  });

  it('throws PreprError for garbage input', () => {
    expect(() => extractAccessToken('not-a-url')).toThrow(PreprError);
  });
});

describe('getPreprEnvironmentSegments', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed _Segments on a successful response, using the byte-compatible query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            _Segments: [
              { _id: 'seg-1', name: 'VIP' },
              { _id: 'seg-2', name: 'New Visitor' },
            ],
          },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const segments = await getPreprEnvironmentSegments(
      'https://graphql.prepr.io/abc123'
    );

    expect(segments).toEqual([
      { _id: 'seg-1', name: 'VIP' },
      { _id: 'seg-2', name: 'New Visitor' },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graphql.prepr.io/abc123');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body);
    expect(body.query).toBe(`{
                _Segments {
                    _id
                    name
                }
            }`);
  });

  it('throws PreprError with INVALID_TOKEN when token fails validation', async () => {
    await expect(getPreprEnvironmentSegments('')).rejects.toMatchObject({
      code: 'MISSING_TOKEN',
    });
  });

  it('throws PreprError with HTTP_ERROR on a non-ok response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 500, statusText: 'Server Error' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getPreprEnvironmentSegments('https://graphql.prepr.io/abc123')
    ).rejects.toMatchObject({ code: 'HTTP_ERROR' });
  });

  it('throws PreprError with INVALID_RESPONSE when _Segments is missing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getPreprEnvironmentSegments('https://graphql.prepr.io/abc123')
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('throws PreprError with FETCH_ERROR when fetch itself rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getPreprEnvironmentSegments('https://graphql.prepr.io/abc123')
    ).rejects.toMatchObject({ code: 'FETCH_ERROR' });
  });
});

describe('getToolbarPropsFromHeaders', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns activeSegment, activeVariant and data on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { _Segments: [{ _id: 's1', name: 'VIP' }] } }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const headers = makeHeaders({
      'Prepr-Segments': 'vip',
      'Prepr-ABtesting': 'A',
    });

    const props = await getToolbarPropsFromHeaders(
      headers,
      'https://graphql.prepr.io/abc123'
    );

    expect(props).toEqual({
      activeSegment: 'vip',
      activeVariant: 'A',
      segments: [{ _id: 's1', name: 'VIP' }],
      data: [{ _id: 's1', name: 'VIP' }],
    });
  });

  it('skips the segments fetch entirely when segments are disabled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const headers = makeHeaders({
      'Prepr-Segments': 'vip',
      'Prepr-ABtesting': 'A',
    });

    const props = await getToolbarPropsFromHeaders(
      headers,
      'https://graphql.prepr.io/abc123',
      { segments: false }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(props).toEqual({
      activeSegment: null,
      activeVariant: 'A',
      segments: [],
      data: [],
    });
  });

  it('reports no active variant when abTesting is disabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { _Segments: [] } }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const props = await getToolbarPropsFromHeaders(
      makeHeaders({ 'Prepr-Segments': 'vip', 'Prepr-ABtesting': 'B' }),
      'https://graphql.prepr.io/abc123',
      { abTesting: false }
    );

    expect(props.activeVariant).toBeNull();
    expect(props.activeSegment).toBe('vip');
  });

  it('returns empty data (without throwing) when the segments fetch fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const headers = makeHeaders({
      'Prepr-Segments': 'vip',
      'Prepr-ABtesting': 'A',
    });

    const props = await getToolbarPropsFromHeaders(
      headers,
      'https://graphql.prepr.io/abc123'
    );

    expect(props).toEqual({
      activeSegment: 'vip',
      activeVariant: 'A',
      segments: [],
      data: [],
    });
  });
});
