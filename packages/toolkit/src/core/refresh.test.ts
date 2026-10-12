import { describe, expect, it } from 'vitest';

import {
  REFRESH_MAX_PATHS,
  isFresh,
  parseRefresh,
  parseRefreshPaths,
  safePath,
  serializeRefresh,
} from './refresh';

describe('safePath', () => {
  it('accepts same-site paths', () => {
    expect(safePath('/')).toBe('/');
    expect(safePath('/pricing')).toBe('/pricing');
    expect(safePath('/blog/a-post_1.html')).toBe('/blog/a-post_1.html');
    expect(safePath('/caf%C3%A9')).toBe('/caf%C3%A9');
  });

  it('rejects anything a fetch could take to another origin', () => {
    for (const hostile of [
      '//evil.com',
      '/\\evil.com',
      'https://evil.com',
      'evil.com',
      '',
      ' /pricing',
    ]) {
      expect(safePath(hostile)).toBeUndefined();
    }
  });

  it('rejects separators, control characters and oversized paths', () => {
    for (const hostile of [
      '/a|b',
      '/a~b',
      '/a;b',
      '/a\r\nSet-Cookie: x=1',
      '/a\u0000',
      `/${'a'.repeat(300)}`,
    ]) {
      expect(safePath(hostile)).toBeUndefined();
    }
  });
});

describe('parseRefresh', () => {
  it('round-trips a decision time per page, most recent first', () => {
    const raw = serializeRefresh([
      { path: '/', at: 2_000 },
      { path: '/pricing', at: 1_000 },
    ]);
    expect(raw).toBe('/~2000|/pricing~1000');
    expect(parseRefresh(raw)).toEqual([
      { path: '/', at: 2_000 },
      { path: '/pricing', at: 1_000 },
    ]);
  });

  it('never throws on hostile cookies', () => {
    for (const hostile of [
      undefined,
      '',
      '~',
      '/~abc',
      '/~-5',
      '/~1e400',
      '//evil.com~1|/ok~1',
      '/a~1|'.repeat(1000),
      '%E0%A4%A',
    ]) {
      expect(() => parseRefresh(hostile)).not.toThrow();
    }
    expect(parseRefresh('/~abc')).toEqual([{ path: '/', at: 0 }]);
    expect(parseRefresh('//evil.com~1|/ok~1')).toEqual([
      { path: '/ok', at: 1 },
    ]);
  });

  it('keeps the newest entry per page, at most the maximum number of pages', () => {
    expect(parseRefresh('/~3|/~1|/a~2')).toEqual([
      { path: '/', at: 3 },
      { path: '/a', at: 2 },
    ]);
    const many = Array.from({ length: 20 }, (_, i) => ({
      path: `/p${i}`,
      at: i,
    }));
    expect(parseRefresh(serializeRefresh(many))).toHaveLength(
      REFRESH_MAX_PATHS,
    );
  });
});

describe('isFresh', () => {
  it('is fresh only inside the window, and never for a time in the future', () => {
    expect(isFresh(1_000, 10_000, 5_000)).toBe(true);
    expect(isFresh(1_000, 10_000, 11_000)).toBe(false);
    expect(isFresh(0, 10_000, 5_000)).toBe(false);
    // A tampered or clock-skewed time must not read as fresh forever.
    expect(isFresh(9_999_999, 10_000, 5_000)).toBe(false);
  });
});

describe('parseRefreshPaths', () => {
  it('reads the header the refresh request sends', () => {
    expect(parseRefreshPaths('/|/pricing')).toEqual(['/', '/pricing']);
  });

  it('drops hostile entries and never throws', () => {
    expect(parseRefreshPaths(null)).toEqual([]);
    expect(parseRefreshPaths('//evil.com|/ok|\r\n')).toEqual(['/ok']);
    expect(
      parseRefreshPaths(
        Array.from({ length: 50 }, (_, i) => `/p${i}`).join('|'),
      ),
    ).toHaveLength(REFRESH_MAX_PATHS);
  });
});
