export interface CookieOptions {
  /** Max age in seconds. Omit for a session cookie. */
  maxAge?: number;
  /** Defaults to '/'. */
  path?: string;
  /**
   * Omit for the browser default (`Lax`). Use `'None'` when the cookie must
   * survive a cross-site iframe — browsers drop `Lax` cookies there, which is
   * what the Prepr editor's preview iframe is.
   *
   * `'None'` is only honoured alongside `Secure`, so pass `secure: true` with
   * it (see `crossSiteCookieOptions`).
   */
  sameSite?: 'Strict' | 'Lax' | 'None';
  /** Adds `Secure`. Required by browsers for `SameSite=None`. */
  secure?: boolean;
}

// These touch `document.cookie` directly, so they belong to the side-effect
// layer (toolbar-change-handler.ts), never to the pure store in ./store.ts.
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  if (!match) return null;

  const value = match.slice(name.length + 1);
  return decodeURIComponent(value);
}

export function setCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
): void {
  if (typeof document === 'undefined') return;

  const { maxAge, path = '/', sameSite, secure } = options;
  let cookie = `${name}=${encodeURIComponent(value)};path=${path}`;

  if (typeof maxAge === 'number') {
    cookie += `;max-age=${maxAge}`;
  }

  if (sameSite) {
    cookie += `;samesite=${sameSite}`;
  }

  if (secure) {
    cookie += ';secure';
  }

  document.cookie = cookie;
}

export function removeCookie(
  name: string,
  path: string = '/',
  options: Pick<CookieOptions, 'sameSite' | 'secure'> = {},
): void {
  if (typeof document === 'undefined') return;

  // A cookie is only overwritten by a write whose SameSite/Secure attributes
  // match — deleting a SameSite=None cookie with default attributes silently
  // leaves the original in place.
  const { sameSite, secure } = options;
  let cookie = `${name}=;path=${path};expires=Thu, 01 Jan 1970 00:00:00 GMT`;

  if (sameSite) {
    cookie += `;samesite=${sameSite}`;
  }

  if (secure) {
    cookie += ';secure';
  }

  document.cookie = cookie;
}

/**
 * Cookie attributes that survive a cross-site iframe.
 *
 * `SameSite=None; Secure` is required for the Prepr editor's preview iframe;
 * `Secure` means HTTPS only, so insecure origins (plain-HTTP local dev) keep
 * the browser default — there is no cross-site iframe to support there, and
 * the browser would reject the cookie outright.
 */
export function crossSiteCookieOptions(): Pick<
  CookieOptions,
  'sameSite' | 'secure'
> {
  if (typeof window === 'undefined' || !window.isSecureContext) return {};
  return { sameSite: 'None', secure: true };
}
