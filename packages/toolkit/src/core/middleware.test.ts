import { describe, expect, it } from 'vitest';

import { VERSION } from '../index';
import { processPreprRequest } from './middleware';

function makeRequest(
  url: string,
  init: { headers?: Record<string, string> } = {}
): Request {
  // Headers are set after construction, not passed to it: `Cookie` is a
  // forbidden request header per the Fetch spec and happy-dom strips it at
  // construction time. Real runtimes hand middleware the incoming request
  // directly, so the Cookie header is present there regardless.
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
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(result.requestHeaders.get('Prepr-Customer-Id-Created')).toBe(
        'true'
      );
    });

    it('writes the generated uuid back as a response cookie with 1y maxAge and path /', () => {
      const request = makeRequest('https://example.com/');
      const result = processPreprRequest(request);

      const uidCookie = result.responseCookies.find(
        c => c.name === '__prepr_uid'
      );
      expect(uidCookie).toBeDefined();
      expect(uidCookie?.maxAge).toBe(60 * 60 * 24 * 365);
      expect(uidCookie?.path).toBe('/');
      expect(uidCookie?.value).toBe(
        result.requestHeaders.get('Prepr-Customer-Id')
      );
    });

    it('reuses an existing __prepr_uid cookie instead of generating a new one', () => {
      const request = makeRequest('https://example.com/', {
        headers: { cookie: '__prepr_uid=existing-uuid-value' },
      });
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-Customer-Id')).toBe(
        'existing-uuid-value'
      );
      expect(result.requestHeaders.has('Prepr-Customer-Id-Created')).toBe(
        false
      );
      expect(
        result.responseCookies.find(c => c.name === '__prepr_uid')
      ).toBeUndefined();
    });
  });

  describe('UTM params', () => {
    it('maps utm_* query params to Prepr-Context-utm_* headers', () => {
      const request = makeRequest(
        'https://example.com/?utm_source=google&utm_medium=cpc&utm_term=shoes&utm_content=ad1&utm_campaign=summer'
      );
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-Context-utm_source')).toBe(
        'google'
      );
      expect(result.requestHeaders.get('Prepr-Context-utm_medium')).toBe(
        'cpc'
      );
      expect(result.requestHeaders.get('Prepr-Context-utm_term')).toBe(
        'shoes'
      );
      expect(result.requestHeaders.get('Prepr-Context-utm_content')).toBe(
        'ad1'
      );
      expect(result.requestHeaders.get('Prepr-Context-utm_campaign')).toBe(
        'summer'
      );
    });

    it('does not set utm headers when params are absent', () => {
      const request = makeRequest('https://example.com/');
      const result = processPreprRequest(request);

      expect(result.requestHeaders.has('Prepr-Context-utm_source')).toBe(
        false
      );
    });
  });

  describe('referral, user-agent, package, ip, hubspot', () => {
    it('forwards referer as Prepr-Context-initial_referral', () => {
      const request = makeRequest('https://example.com/', {
        headers: { referer: 'https://google.com/search' },
      });
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-Context-initial_referral')).toBe(
        'https://google.com/search'
      );
    });

    it('forwards user-agent as Prepr-User-Agent', () => {
      const request = makeRequest('https://example.com/', {
        headers: { 'user-agent': 'Mozilla/5.0 Test' },
      });
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-User-Agent')).toBe(
        'Mozilla/5.0 Test'
      );
    });

    it('sets Prepr-Package to @preprio/toolkit@<version>', () => {
      const request = makeRequest('https://example.com/');
      const result = processPreprRequest(request);

      expect(result.requestHeaders.get('Prepr-Package')).toBe(
        `@preprio/toolkit@${VERSION}`
      );
    });

    it('allows overriding the version via opts.version', () => {
      const request = makeRequest('https://example.com/');
      const result = processPreprRequest(request, { version: '9.9.9' });

      expect(result.requestHeaders.get('Prepr-Package')).toBe(
        '@preprio/toolkit@9.9.9'
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
        'hutk-value-123'
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
        'https://example.com/?prepr_preview_segment=vip'
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

    it('query params take priority over the Prepr-Preview-Mode=false cookie', () => {
      const request = makeRequest(
        'https://example.com/?prepr_preview_segment=vip',
        { headers: { cookie: 'Prepr-Preview-Mode=false' } }
      );
      const result = processPreprRequest(request, { preview: true });

      expect(result.requestHeaders.get('Prepr-Preview-Bar')).toBe('true');
      expect(result.requestHeaders.get('Prepr-Segments')).toBe('vip');
    });

    it('sets Prepr-Segments/Prepr-ABtesting from query params and writes cookies back', () => {
      const request = makeRequest(
        'https://example.com/?prepr_preview_segment=vip&prepr_preview_ab=B'
      );
      const result = processPreprRequest(request, { preview: true });

      expect(result.requestHeaders.get('Prepr-Segments')).toBe('vip');
      expect(result.requestHeaders.get('Prepr-ABtesting')).toBe('B');

      const segCookie = result.responseCookies.find(
        c => c.name === 'Prepr-Segments'
      );
      const abCookie = result.responseCookies.find(
        c => c.name === 'Prepr-ABtesting'
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
        result.responseCookies.find(c => c.name === 'Prepr-Segments')
      ).toBeUndefined();
    });

    it('query params override cookies for segment/ab', () => {
      const request = makeRequest(
        'https://example.com/?prepr_preview_segment=new-seg',
        { headers: { cookie: 'Prepr-Segments=old-seg' } }
      );
      const result = processPreprRequest(request, { preview: true });

      expect(result.requestHeaders.get('Prepr-Segments')).toBe('new-seg');
    });

    it('ignores cookies and does not write them back in live preview (prepr_hide_bar=true)', () => {
      const request = makeRequest(
        'https://example.com/?prepr_hide_bar=true&prepr_preview_ab=B',
        { headers: { cookie: 'Prepr-Segments=vip; Prepr-ABtesting=A' } }
      );
      const result = processPreprRequest(request, { preview: true });

      // cookie-sourced segment must not leak through in live preview
      expect(result.requestHeaders.has('Prepr-Segments')).toBe(false);
      // the query param still applies, but must not be written back to cookies
      expect(result.requestHeaders.get('Prepr-ABtesting')).toBe('B');
      expect(
        result.responseCookies.find(c => c.name === 'Prepr-ABtesting')
      ).toBeUndefined();
    });
  });
});
