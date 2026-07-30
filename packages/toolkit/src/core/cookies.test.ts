import { afterEach, describe, expect, it } from 'vitest';

import { getCookie, removeCookie, setCookie } from './cookies';

function clearAllCookies() {
  document.cookie.split(';').forEach(part => {
    const name = part.split('=')[0]?.trim();
    if (name) {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    }
  });
}

describe('cookies', () => {
  afterEach(() => {
    clearAllCookies();
  });

  it('setCookie() then getCookie() roundtrips a value', () => {
    setCookie('Prepr-Toolbar-Open', 'true');
    expect(getCookie('Prepr-Toolbar-Open')).toBe('true');
  });

  it('getCookie() returns null when the cookie is not set', () => {
    expect(getCookie('Does-Not-Exist')).toBeNull();
  });

  it('setCookie() writes path=/ so the cookie is visible site-wide', () => {
    setCookie('Prepr-Segments', 'abc');
    expect(document.cookie).toContain('Prepr-Segments=abc');
  });

  it('setCookie() accepts a maxAge in seconds', () => {
    setCookie('Prepr-ABtesting', 'A', { maxAge: 60 * 60 * 24 * 365 });
    expect(getCookie('Prepr-ABtesting')).toBe('A');
  });

  it('removeCookie() deletes a previously set cookie', () => {
    setCookie('Prepr-Preview-Mode', 'true');
    expect(getCookie('Prepr-Preview-Mode')).toBe('true');

    removeCookie('Prepr-Preview-Mode');
    expect(getCookie('Prepr-Preview-Mode')).toBeNull();
  });

  it('getCookie() distinguishes between similarly-prefixed cookie names', () => {
    setCookie('Prepr-Segments', 'seg-value');
    setCookie('Prepr-Segments-Extra', 'other-value');

    expect(getCookie('Prepr-Segments')).toBe('seg-value');
    expect(getCookie('Prepr-Segments-Extra')).toBe('other-value');
  });

  it('roundtrips values that need URI encoding', () => {
    setCookie('Prepr-Segments', 'a b;c');
    expect(getCookie('Prepr-Segments')).toBe('a b;c');
  });
});
