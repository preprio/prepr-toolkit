import type { LiveListEntry, LiveValue } from './patch';

// Validation for editor-supplied live values. They arrive over postMessage, or
// from an HTTP request when a server applies a patch log, so every check here
// treats the input as hostile.

function isScalar(v: unknown): v is string | number | boolean {
  return (
    typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
  );
}

const MAX_DEPTH = 3;
const MAX_ENTRIES = 50;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const SAFE_URL = /^https?:\/\//i;
// Keys and field names that a site renders as a link or a media source.
const URL_KEY = /^(?:url|href|src|link)$|(?:_url|Url)$/;
// Browsers ignore tabs and newlines anywhere in a URL, and leading control
// characters and spaces, when they read its scheme.
const URL_IGNORED_ANYWHERE = /[\t\n\r]/g;
const SCRIPT_SCHEME = /^(?:javascript|vbscript|data):/i;

/**
 * Whether a string is safe as the value of a link or media field: never a
 * `javascript:`, `vbscript:` or `data:` URL. Relative links, `mailto:` and
 * other schemes pass, as they do in stored content.
 */
export function isSafeLinkValue(value: string): boolean {
  const stripped = value.replace(URL_IGNORED_ANYWHERE, '');
  let start = 0;
  while (start < stripped.length && stripped.charCodeAt(start) <= 0x20) start++;
  return !SCRIPT_SCHEME.test(stripped.slice(start));
}

/** Whether a key or field name holds a URL a site renders as a link or source. */
export function isUrlKey(key: string): boolean {
  return URL_KEY.test(key);
}

function isSafeKeyValue(key: string, value: unknown): boolean {
  if (typeof value !== 'string') return true;
  if (key === 'url') return SAFE_URL.test(value);
  return !isUrlKey(key) || isSafeLinkValue(value);
}

/**
 * Structured values (an asset swapped in the editor) arrive over postMessage
 * and end up in rendered props such as an image `src`: plain objects and
 * arrays only, bounded in size and depth, no prototype keys, any `url` must
 * be http(s), and other link keys (`href`, `src`, `link`, `…_url`) can never
 * hold a `javascript:`, `vbscript:` or `data:` URL. HTML text is passed on
 * as the editor sent it, like stored rich text: render it the way you
 * render rich text from the API.
 */
export function isLiveValue(v: unknown, depth = 0): v is LiveValue {
  if (v === null || isScalar(v)) return true;
  if (depth >= MAX_DEPTH) return false;
  if (Array.isArray(v)) {
    return (
      depth === 0 &&
      v.length <= MAX_ENTRIES &&
      v.every((entry) => isPlainRecord(entry) && isLiveValue(entry, depth + 1))
    );
  }
  if (!isPlainRecord(v)) return false;
  const keys = Object.keys(v);
  if (keys.length > MAX_ENTRIES) return false;
  return keys.every((key) => {
    if (FORBIDDEN_KEYS.has(key)) return false;
    const value = v[key];
    if (!isSafeKeyValue(key, value)) return false;
    return !Array.isArray(value) && isLiveValue(value, depth + 1);
  });
}

/**
 * Whether a `prepr:fieldChange` value is acceptable for the field it is sent
 * for: a valid live value, and no script URL in a link field
 * (`cta.url`, `button.href`).
 */
export function isLiveFieldChange(
  field: string,
  value: unknown,
): value is LiveValue {
  if (!isLiveValue(value)) return false;
  const name = field.slice(field.lastIndexOf('.') + 1);
  return typeof value !== 'string' || !isUrlKey(name) || isSafeLinkValue(value);
}

const MAX_LIST_ENTRIES = 200;

/**
 * A `prepr:listChange` entry list, or null when it is not one. Entries are
 * flat: an id, a type, and for Text the HTML and heading level, which the
 * site renders exactly like a pushed `body`.
 */
export function parseListEntries(value: unknown): LiveListEntry[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIST_ENTRIES) return null;
  const list: LiveListEntry[] = [];
  for (const raw of value) {
    if (!isPlainRecord(raw) || typeof raw._id !== 'string' || !raw._id) {
      return null;
    }
    const entry: LiveListEntry = { _id: raw._id };
    if (typeof raw.__typename === 'string') entry.__typename = raw.__typename;
    if (typeof raw.body === 'string') entry.body = raw.body;
    if (typeof raw.format === 'string' || raw.format === null) {
      entry.format = raw.format as string | null;
    }
    if (typeof raw.typeName === 'string' && raw.typeName.length <= 200) {
      entry.typeName = raw.typeName;
    }
    if (raw.fields !== undefined) {
      if (!isPlainRecord(raw.fields) || !isFieldValue(raw.fields, 0)) {
        return null;
      }
      entry.fields = raw.fields;
    }
    list.push(entry);
  }
  return list;
}

export function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return (
    v !== null &&
    typeof v === 'object' &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

const MAX_FIELD_DEPTH = 6;
const MAX_FIELD_KEYS = 100;

/**
 * The field values of a new list entry: nested records and lists of records
 * (components, assets, dynamic content), bounded in depth and size, with the
 * same key and URL rules as `isLiveValue`.
 */
function isFieldValue(v: unknown, depth: number): boolean {
  if (v === null || isScalar(v)) return true;
  if (depth >= MAX_FIELD_DEPTH) return false;
  if (Array.isArray(v)) {
    return (
      v.length <= MAX_ENTRIES &&
      v.every(
        (entry) =>
          isScalar(entry) ||
          (isPlainRecord(entry) && isFieldValue(entry, depth + 1)),
      )
    );
  }
  if (!isPlainRecord(v)) return false;
  const keys = Object.keys(v);
  if (keys.length > MAX_FIELD_KEYS) return false;
  return keys.every((key) => {
    if (FORBIDDEN_KEYS.has(key)) return false;
    const value = v[key];
    if (!isSafeKeyValue(key, value)) return false;
    return isFieldValue(value, depth + 1);
  });
}

/** The open item and a field path in the editor's id-based convention. */
export interface LiveEditTarget {
  item: string;
  field: string;
}

const MAX_EDIT_LENGTH = 1000;

/** A valid edit target from an untrusted source, or undefined. */
export function parseEditTarget(raw: unknown): LiveEditTarget | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const { item, field } = raw;
  if (typeof item !== 'string' || !item || item.length > MAX_EDIT_LENGTH) {
    return undefined;
  }
  if (typeof field !== 'string' || !field || field.length > MAX_EDIT_LENGTH) {
    return undefined;
  }
  return { item, field };
}
