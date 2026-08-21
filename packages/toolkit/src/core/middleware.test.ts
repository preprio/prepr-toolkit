// @vitest-environment node
//
// Server-side code: `processPreprRequest` runs on the runtime's own `Headers`
// (undici under Node, workerd on the edge), never in a browser. The suite-wide
// happy-dom default is wrong here — its `Headers` accepts values undici
// rejects, so header-validation bugs pass silently under it. See
// vitest.config.ts.
import { describe, expect, it } from 'vitest';

import { VERSION } from '../index';
import { processPreprRequest } from './middleware';

function makeRequest(
  url: string,
  init: { headers?: Record<string, string> } = {},
): Request {
  // Headers are set after construction, not passed to it: `Cookie` is a
  // forbidden request header per the Fetch spec, so it is dropped when passed
  // via the constructor's init. Real runtimes hand middleware the incoming
  // request directly, so the Cookie header is present there regardless.
  const request = new Request(url);
  for (const [key, value] of Object.entries(init.headers ?? {})) {
    request.headers.set(key, value);
  }
  return request;
}

describe('processPreprRequest', () => {
  describe('__prepr_uid / Prepr-Customer-Id', () => {
    it('generates a new uuid when no __prepr_uid cookie is present', () => {
      const request = makeRequest('https://example.com/');
      const result = processPreprRequest(request);

      const customerId = result.requestHeaders.get('Prepr-Customer-Id');
      expect(customerId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(result.requestHeaders.get('Prepr-Customer-Id-Created')).toBe(
        'true',
      );
    });

    it('writes the generated uuid back as a response cookie with 1y maxAge and path /', () => {
      const request = makeRequest('https://example.com/');
      const result = processPreprRequest(request);

      const uidCookie = result.responseCookies.find(
        (c) => c.name === '__prepr_uid',
      );
      expect(uidCookie).toBeDefined();
      expect(uidCookie?.maxAge).toBe(60 * 60 * 24 * 365);
      expect(uidCookie?.path).toBe('/');
      expect(uidCookie?.value).toBe(
        result.requestHeaders.get('Prepr-Customer-Id'),
      );
    });

    it('reuses an existing __prepr_uid cookie instead of generating a new one', () => {
      const request = makeRequest('https://example.com/', {
        headers: { cookie: '__prepr_uid=existing-uuid-value' },
      });
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-Customer-Id')).toBe(
        'existing-uuid-value',
      );
      expect(result.requestHeaders.has('Prepr-Customer-Id-Created')).toBe(
        false,
      );
      expect(
        result.responseCookies.find((c) => c.name === '__prepr_uid'),
      ).toBeUndefined();
    });
  });

  describe('UTM params', () => {
    it('maps utm_* query params to Prepr-Context-utm_* headers', () => {
      const request = makeRequest(
        'https://example.com/?utm_source=google&utm_medium=cpc&utm_term=shoes&utm_content=ad1&utm_campaign=summer',
      );
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-Context-utm_source')).toBe(
        'google',
      );
      expect(result.requestHeaders.get('Prepr-Context-utm_medium')).toBe('cpc');
      expect(result.requestHeaders.get('Prepr-Context-utm_term')).toBe('shoes');
      expect(result.requestHeaders.get('Prepr-Context-utm_content')).toBe(
        'ad1',
      );
      expect(result.requestHeaders.get('Prepr-Context-utm_campaign')).toBe(
        'summer',
      );
    });

    it('does not set utm headers when params are absent', () => {
      const request = makeRequest('https://example.com/');
      const result = processPreprRequest(request);

      expect(result.requestHeaders.has('Prepr-Context-utm_source')).toBe(false);
    });
  });

  describe('referral, user-agent, package, ip, hubspot', () => {
    it('forwards referer as Prepr-Context-initial_referral', () => {
      const request = makeRequest('https://example.com/', {
        headers: { referer: 'https://google.com/search' },
      });
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-Context-initial_referral')).toBe(
        'https://google.com/search',
      );
    });

    it('forwards user-agent as Prepr-User-Agent', () => {
      const request = makeRequest('https://example.com/', {
        headers: { 'user-agent': 'Mozilla/5.0 Test' },
      });
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-User-Agent')).toBe(
        'Mozilla/5.0 Test',
      );
    });

    it('sets Prepr-Package to @preprio/toolkit@<version>', () => {
      const request = makeRequest('https://example.com/');
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-Package')).toBe(
        `@preprio/toolkit@${VERSION}`,
      );
    });

    it('allows overriding the version via opts.version', () => {
      const request = makeRequest('https://example.com/');
      const result = processPreprRequest(request, { version: '9.9.9' });

      expect(result.requestHeaders.get('Prepr-Package')).toBe(
        '@preprio/toolkit@9.9.9',
      );
    });

    it('prefers Cf-Connecting-Ip over x-real-ip for Prepr-Visitor-IP', () => {
      const request = makeRequest('https://example.com/', {
        headers: { 'Cf-Connecting-Ip': '1.2.3.4', 'x-real-ip': '5.6.7.8' },
      });
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-Visitor-IP')).toBe('1.2.3.4');
    });

    it('falls back to x-real-ip when Cf-Connecting-Ip is absent', () => {
      const request = makeRequest('https://example.com/', {
        headers: { 'x-real-ip': '5.6.7.8' },
      });
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-Visitor-IP')).toBe('5.6.7.8');
    });

    it('does not set Prepr-Visitor-IP when no ip header is present', () => {
      const request = makeRequest('https://example.com/');
      const result = processPreprRequest(request);

      expect(result.requestHeaders.has('Prepr-Visitor-IP')).toBe(false);
    });

    it('forwards the hubspotutk cookie as Prepr-Hubspot-Id', () => {
      const request = makeRequest('https://example.com/', {
        headers: { cookie: 'hubspotutk=hutk-value-123' },
      });
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-Hubspot-Id')).toBe(
        'hutk-value-123',
      );
    });

    it('does not set Prepr-Hubspot-Id when hubspotutk cookie is absent', () => {
      const request = makeRequest('https://example.com/');
      const result = processPreprRequest(request);

      expect(result.requestHeaders.has('Prepr-Hubspot-Id')).toBe(false);
    });
  });

  describe('preview mode', () => {
    it('does not set Prepr-Preview-Bar when preview option is not set', () => {
      const request = makeRequest(
        'https://example.com/?prepr_preview_segment=vip',
      );
      const result = processPreprRequest(request);

      expect(result.requestHeaders.has('Prepr-Preview-Bar')).toBe(false);
      expect(result.requestHeaders.has('Prepr-Segments')).toBe(false);
    });

    it('sets Prepr-Preview-Bar: true when preview is enabled', () => {
      const request = makeRequest('https://example.com/');
      const result = processPreprRequest(request, { preview: true });

      expect(result.requestHeaders.get('Prepr-Preview-Bar')).toBe('true');
    });

    it('respects the Prepr-Preview-Mode=false cookie to suppress the preview bar', () => {
      const request = makeRequest('https://example.com/', {
        headers: { cookie: 'Prepr-Preview-Mode=false' },
      });
      const result = processPreprRequest(request, { preview: true });

      expect(result.requestHeaders.has('Prepr-Preview-Bar')).toBe(false);
    });

    // Regression: the Prepr editor iframes the site cross-site, where the
    // browser drops the toolbar's own Lax Prepr-Preview-Mode write. The
    // toolbar then remounted as previewMode:false, the editor's prepr:initVE
    // set it true, and that transition triggered a reload — endlessly.
    it('seeds Prepr-Preview-Mode=true so the toolbar mounts already in preview', () => {
      const request = makeRequest('https://example.com/');
      const result = processPreprRequest(request, { preview: true });

      const cookie = result.responseCookies.find(
        (c) => c.name === 'Prepr-Preview-Mode',
      );
      expect(cookie?.value).toBe('true');
      expect(cookie?.sameSite).toBe('None');
      expect(cookie?.secure).toBe(true);
    });

    it('does not seed Prepr-Preview-Mode when the request already carries it', () => {
      const request = makeRequest('https://example.com/', {
        headers: { cookie: 'Prepr-Preview-Mode=true' },
      });
      const result = processPreprRequest(request, { preview: true });

      expect(
        result.responseCookies.some((c) => c.name === 'Prepr-Preview-Mode'),
      ).toBe(false);
    });

    it('does not seed Prepr-Preview-Mode in the live preview iframe', () => {
      // prepr_hide_bar=true means no toolbar mounts, so there is no loop to
      // break and no cookie to write.
      const request = makeRequest('https://example.com/?prepr_hide_bar=true');
      const result = processPreprRequest(request, { preview: true });

      expect(
        result.responseCookies.some((c) => c.name === 'Prepr-Preview-Mode'),
      ).toBe(false);
    });

    it('leaves preview cookies attribute-free over plain HTTP', () => {
      // Browsers reject `Secure` off HTTPS, so setting it would drop the
      // cookie entirely and break plain-HTTP local dev.
      const request = makeRequest(
        'http://localhost:3000/?prepr_preview_segment=vip',
      );
      const result = processPreprRequest(request, { preview: true });

      for (const cookie of result.responseCookies) {
        expect(cookie.sameSite).toBeUndefined();
        expect(cookie.secure).toBeUndefined();
      }
    });

    it('treats x-forwarded-proto=https as secure behind a TLS proxy', () => {
      const request = makeRequest(
        'http://internal:3000/?prepr_preview_segment=vip',
        { headers: { 'x-forwarded-proto': 'https, http' } },
      );
      const result = processPreprRequest(request, { preview: true });

      const cookie = result.responseCookies.find(
        (c) => c.name === 'Prepr-Segments',
      );
      expect(cookie?.sameSite).toBe('None');
      expect(cookie?.secure).toBe(true);
    });

    it('query params take priority over the Prepr-Preview-Mode=false cookie', () => {
      const request = makeRequest(
        'https://example.com/?prepr_preview_segment=vip',
        { headers: { cookie: 'Prepr-Preview-Mode=false' } },
      );
      const result = processPreprRequest(request, { preview: true });

      expect(result.requestHeaders.get('Prepr-Preview-Bar')).toBe('true');
      expect(result.requestHeaders.get('Prepr-Segments')).toBe('vip');
    });

    it('sets Prepr-Segments/Prepr-ABtesting from query params and writes cookies back', () => {
      const request = makeRequest(
        'https://example.com/?prepr_preview_segment=vip&prepr_preview_ab=B',
      );
      const result = processPreprRequest(request, { preview: true });

      expect(result.requestHeaders.get('Prepr-Segments')).toBe('vip');
      expect(result.requestHeaders.get('Prepr-ABtesting')).toBe('B');

      const segCookie = result.responseCookies.find(
        (c) => c.name === 'Prepr-Segments',
      );
      const abCookie = result.responseCookies.find(
        (c) => c.name === 'Prepr-ABtesting',
      );
      expect(segCookie).toMatchObject({
        value: 'vip',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      });
      expect(abCookie).toMatchObject({
        value: 'B',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      });
    });

    it('falls back to cookies for segment/ab when no query params are present', () => {
      const request = makeRequest('https://example.com/', {
        headers: {
          cookie: 'Prepr-Segments=vip; Prepr-ABtesting=A',
        },
      });
      const result = processPreprRequest(request, { preview: true });

      expect(result.requestHeaders.get('Prepr-Segments')).toBe('vip');
      expect(result.requestHeaders.get('Prepr-ABtesting')).toBe('A');
      expect(
        result.responseCookies.find((c) => c.name === 'Prepr-Segments'),
      ).toBeUndefined();
    });

    it('query params override cookies for segment/ab', () => {
      const request = makeRequest(
        'https://example.com/?prepr_preview_segment=new-seg',
        { headers: { cookie: 'Prepr-Segments=old-seg' } },
      );
      const result = processPreprRequest(request, { preview: true });

      expect(result.requestHeaders.get('Prepr-Segments')).toBe('new-seg');
    });

    it('ignores cookies and does not write them back in live preview (prepr_hide_bar=true)', () => {
      const request = makeRequest(
        'https://example.com/?prepr_hide_bar=true&prepr_preview_ab=B',
        { headers: { cookie: 'Prepr-Segments=vip; Prepr-ABtesting=A' } },
      );
      const result = processPreprRequest(request, { preview: true });

      // cookie-sourced segment must not leak through in live preview
      expect(result.requestHeaders.has('Prepr-Segments')).toBe(false);
      // the query param still applies, but must not be written back to cookies
      expect(result.requestHeaders.get('Prepr-ABtesting')).toBe('B');
      expect(
        result.responseCookies.find((c) => c.name === 'Prepr-ABtesting'),
      ).toBeUndefined();
    });
  });

  describe('disabled features', () => {
    it('injects no Prepr-ABtesting from cookie or query param when abTesting is off', () => {
      const request = makeRequest('https://example.com/?prepr_preview_ab=B', {
        headers: { cookie: 'Prepr-ABtesting=A; Prepr-Segments=vip' },
      });
      const result = processPreprRequest(request, {
        preview: true,
        features: { abTesting: false },
      });

      expect(result.requestHeaders.has('Prepr-ABtesting')).toBe(false);
      expect(
        result.responseCookies.find((c) => c.name === 'Prepr-ABtesting'),
      ).toBeUndefined();
      // The enabled feature is untouched.
      expect(result.requestHeaders.get('Prepr-Segments')).toBe('vip');
    });

    it('injects no Prepr-Segments from cookie or query param when segments are off', () => {
      const request = makeRequest(
        'https://example.com/?prepr_preview_segment=new-seg',
        { headers: { cookie: 'Prepr-Segments=vip; Prepr-ABtesting=A' } },
      );
      const result = processPreprRequest(request, {
        preview: true,
        features: { segments: false },
      });

      expect(result.requestHeaders.has('Prepr-Segments')).toBe(false);
      expect(
        result.responseCookies.find((c) => c.name === 'Prepr-Segments'),
      ).toBeUndefined();
      expect(result.requestHeaders.get('Prepr-ABtesting')).toBe('A');
    });

    it("a disabled feature's query param does not override the preview-off cookie", () => {
      const request = makeRequest(
        'https://example.com/?prepr_preview_segment=new-seg',
        { headers: { cookie: 'Prepr-Preview-Mode=false' } },
      );
      const result = processPreprRequest(request, {
        preview: true,
        features: { segments: false },
      });

      expect(result.requestHeaders.has('Prepr-Preview-Bar')).toBe(false);
    });

    it('leaves preview mode itself alone — it is the master switch, not a feature', () => {
      const request = makeRequest('https://example.com/');
      const result = processPreprRequest(request, {
        preview: true,
        features: { segments: false, abTesting: false, editMode: false },
      });

      expect(result.requestHeaders.get('Prepr-Preview-Bar')).toBe('true');
    });
  });

  // Regression: every one of these values reaches a `Headers.set()` call. The
  // runtime `Headers` rejects CR/LF outright (undici throws `TypeError`), so an
  // unsanitized value took the whole request down with a 500 — reachable by any
  // visitor via a crafted URL, on every framework wrapper. Values must be
  // stripped, never forwarded raw and never thrown on.
  describe('hostile input in forwarded values', () => {
    const CRLF = 'a\r\nX-Injected: 1';

    it('does not throw on CRLF in any forwarded query param', () => {
      const params = [
        'utm_source',
        'utm_medium',
        'utm_term',
        'utm_content',
        'utm_campaign',
        'prepr_preview_segment',
        'prepr_preview_ab',
      ];

      for (const param of params) {
        const request = makeRequest(
          `https://example.com/?${param}=${encodeURIComponent(CRLF)}`,
        );
        expect(() =>
          processPreprRequest(request, { preview: true }),
        ).not.toThrow();
      }
    });

    it('strips CR/LF out of forwarded UTM values', () => {
      const request = makeRequest(
        `https://example.com/?utm_source=${encodeURIComponent(CRLF)}`,
      );
      const result = processPreprRequest(request);

      const value = result.requestHeaders.get('Prepr-Context-utm_source');
      expect(value).not.toMatch(/[\r\n]/);
      expect(result.requestHeaders.get('X-Injected')).toBeNull();
    });

    it('strips CR/LF out of the preview segment and variant', () => {
      const request = makeRequest(
        `https://example.com/?prepr_preview_segment=${encodeURIComponent(CRLF)}`,
      );
      const result = processPreprRequest(request, { preview: true });

      expect(result.requestHeaders.get('Prepr-Segments')).not.toMatch(/[\r\n]/);
      expect(result.requestHeaders.get('X-Injected')).toBeNull();
    });

    it('truncates absurdly long forwarded values', () => {
      const huge = 'x'.repeat(40_000);
      const request = makeRequest(`https://example.com/?utm_source=${huge}`);
      const result = processPreprRequest(request);

      const value = result.requestHeaders.get('Prepr-Context-utm_source');
      expect(value!.length).toBeLessThanOrEqual(2048);
    });

    it('does not throw on malformed percent-encoding in any cookie', () => {
      // Another vendor's cookie on the same domain is enough to hit the parser.
      const request = makeRequest('https://example.com/', {
        headers: { cookie: 'vendor=%zz%E0; __prepr_uid=ok-uid' },
      });

      let result!: ReturnType<typeof processPreprRequest>;
      expect(() => {
        result = processPreprRequest(request, { preview: true });
      }).not.toThrow();
      expect(result.requestHeaders.get('Prepr-Customer-Id')).toBe('ok-uid');
    });

    it('strips CR/LF out of a hostile __prepr_uid cookie instead of throwing', () => {
      const request = makeRequest('https://example.com/', {
        headers: { cookie: `__prepr_uid=${encodeURIComponent(CRLF)}` },
      });

      let result!: ReturnType<typeof processPreprRequest>;
      expect(() => {
        result = processPreprRequest(request);
      }).not.toThrow();
      expect(result.requestHeaders.get('Prepr-Customer-Id')).not.toMatch(
        /[\r\n]/,
      );
      expect(result.requestHeaders.get('X-Injected')).toBeNull();
    });

    it('mints a fresh uuid when the __prepr_uid cookie is only control characters', () => {
      const request = makeRequest('https://example.com/', {
        headers: { cookie: '__prepr_uid=%0D%0A' },
      });
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-Customer-Id')).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(result.requestHeaders.get('Prepr-Customer-Id-Created')).toBe(
        'true',
      );
    });
  });

  // The middleware is the sole authority on `Prepr-*`. A client that sends its
  // own must not have it reach the Prepr API: spoofing Prepr-Visitor-IP poisons
  // analytics, and spoofing Prepr-Segments / Prepr-Preview-Bar selects
  // personalization behind the back of the `features` gate the consumer
  // configured.
  describe('inbound Prepr-* headers are not trusted', () => {
    it('drops client-supplied Prepr-* headers', () => {
      const request = makeRequest('https://example.com/', {
        headers: {
          'Prepr-Segments': 'spoofed-segment',
          'Prepr-ABtesting': 'B',
          'Prepr-Visitor-IP': '1.2.3.4',
          'Prepr-Preview-Bar': 'true',
          'Prepr-Customer-Id': 'attacker-uid',
          'Prepr-Hubspot-Id': 'spoofed-hutk',
          'Prepr-Context-utm_source': 'spoofed-source',
        },
      });
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-Segments')).toBeNull();
      expect(result.requestHeaders.get('Prepr-ABtesting')).toBeNull();
      expect(result.requestHeaders.get('Prepr-Visitor-IP')).toBeNull();
      expect(result.requestHeaders.get('Prepr-Preview-Bar')).toBeNull();
      expect(result.requestHeaders.get('Prepr-Hubspot-Id')).toBeNull();
      expect(result.requestHeaders.get('Prepr-Context-utm_source')).toBeNull();
      // Recomputed from the uid cookie, never taken from the client.
      expect(result.requestHeaders.get('Prepr-Customer-Id')).not.toBe(
        'attacker-uid',
      );
    });

    it('still forwards values the middleware itself derives', () => {
      const request = makeRequest('https://example.com/?utm_source=real', {
        headers: {
          'Prepr-Context-utm_source': 'spoofed',
          'Cf-Connecting-Ip': '9.9.9.9',
          referer: 'https://ref.example.com/',
        },
      });
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-Context-utm_source')).toBe(
        'real',
      );
      expect(result.requestHeaders.get('Prepr-Visitor-IP')).toBe('9.9.9.9');
      expect(result.requestHeaders.get('Prepr-Context-initial_referral')).toBe(
        'https://ref.example.com/',
      );
    });

    it('does not disturb non-Prepr headers', () => {
      const request = makeRequest('https://example.com/', {
        headers: { 'x-custom': 'keep-me', accept: 'text/html' },
      });
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('x-custom')).toBe('keep-me');
      expect(result.requestHeaders.get('accept')).toBe('text/html');
    });
  });
});
