export interface CookieOptions {
  /** Max age in seconds. Omit for a session cookie. */
  maxAge?: number;
  /** Defaults to '/'. */
  path?: string;
}

// These touch `document.cookie` directly, so they belong to the side-effect
// layer (toolbar-change-handler.ts), never to the pure store in ./store.ts.
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${name}=`));
  if (!match) return null;

  const value = match.slice(name.length + 1);
  return decodeURIComponent(value);
}

export function setCookie(
  name: string,
  value: string,
  options: CookieOptions = {}
): void {
  if (typeof document === 'undefined') return;

  const { maxAge, path = '/' } = options;
  let cookie = `${name}=${encodeURIComponent(value)};path=${path}`;

  if (typeof maxAge === 'number') {
    cookie += `;max-age=${maxAge}`;
  }

  document.cookie = cookie;
}

export function removeCookie(name: string, path: string = '/'): void {
  if (typeof document === 'undefined') return;

  document.cookie = `${name}=;path=${path};expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
