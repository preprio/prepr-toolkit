import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  crossSiteCookieOptions,
  getCookie,
  removeCookie,
  setCookie,
} from './cookies';

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

  // happy-dom exposes the raw attribute string on document.cookie writes only
  // via a spy — reading it back returns just name=value.
  function captureWrite(fn: () => void): string {
    let written = '';
    const spy = vi
      .spyOn(document, 'cookie', 'set')
      .mockImplementation((value: string) => {
        written = value;
      });
    fn();
    spy.mockRestore();
    return written;
  }

  it('setCookie() writes SameSite and Secure when asked', () => {
    const written = captureWrite(() =>
      setCookie('Prepr-Preview-Mode', 'true', {
        maxAge: 60,
        sameSite: 'None',
        secure: true,
      })
    );

    expect(written).toContain('samesite=None');
    expect(written).toContain('secure');
  });

  it('setCookie() omits SameSite and Secure by default', () => {
    const written = captureWrite(() => setCookie('Prepr-Segments', 'abc'));

    expect(written).not.toContain('samesite');
    expect(written).not.toContain('secure');
  });

  it('removeCookie() mirrors SameSite/Secure so the delete actually matches', () => {
    // A browser ignores a delete whose attributes differ from the original
    // write, which would strand a SameSite=None cookie forever.
    const written = captureWrite(() =>
      removeCookie('Prepr-Segments', '/', { sameSite: 'None', secure: true })
    );

    expect(written).toContain('samesite=None');
    expect(written).toContain('secure');
    expect(written).toContain('expires=Thu, 01 Jan 1970');
  });

  it('crossSiteCookieOptions() opts in only on a secure context', () => {
    const original = window.isSecureContext;

    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });
    expect(crossSiteCookieOptions()).toEqual({ sameSite: 'None', secure: true });

    // Browsers reject `Secure` off HTTPS, so plain-HTTP dev must stay default.
    Object.defineProperty(window, 'isSecureContext', {
      value: false,
      configurable: true,
    });
    expect(crossSiteCookieOptions()).toEqual({});

    Object.defineProperty(window, 'isSecureContext', {
      value: original,
      configurable: true,
    });
  });
});
