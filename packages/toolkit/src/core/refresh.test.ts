import { describe, expect, it } from 'vitest';

import {
  REFRESH_MAX_PATHS,
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
  it('round-trips the time and the paths', () => {
    const raw = serializeRefresh({
      at: 1_700_000_000_000,
      paths: ['/', '/pricing'],
    });
    expect(parseRefresh(raw)).toEqual({
      at: 1_700_000_000_000,
      paths: ['/', '/pricing'],
    });
  });

  it('never throws on hostile cookies', () => {
    for (const hostile of [
      undefined,
      '',
      '~',
      'abc~/',
      '-5~/',
      '1e400~/',
      '123~//evil.com|/ok',
      '123~' + '/a|'.repeat(1000),
      '%E0%A4%A',
    ]) {
      expect(() => parseRefresh(hostile)).not.toThrow();
    }
    expect(parseRefresh('abc~/')).toEqual({ at: 0, paths: ['/'] });
    expect(parseRefresh('123~//evil.com|/ok').paths).toEqual(['/ok']);
  });

  it('keeps at most the maximum number of paths', () => {
    const many = Array.from({ length: 20 }, (_, i) => `/p${i}`);
    expect(parseRefresh(`1~${many.join('|')}`).paths).toHaveLength(
      REFRESH_MAX_PATHS,
    );
    expect(serializeRefresh({ at: 1, paths: many }).split('|')).toHaveLength(
      REFRESH_MAX_PATHS,
    );
  });

  it('drops duplicate paths', () => {
    expect(parseRefresh('1~/|/|/a').paths).toEqual(['/', '/a']);
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
