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

/**
 * Structured values (an asset swapped in the editor) arrive over postMessage
 * and end up in rendered props such as an image `src`: plain objects and
 * arrays only, bounded in size and depth, no prototype keys, and any `url`
 * must be http(s) so a `javascript:` or `data:` URL never reaches the page.
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
    if (key === 'url' && typeof value === 'string' && !SAFE_URL.test(value)) {
      return false;
    }
    return !Array.isArray(value) && isLiveValue(value, depth + 1);
  });
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
      v.every((entry) => isPlainRecord(entry) && isFieldValue(entry, depth + 1))
    );
  }
  if (!isPlainRecord(v)) return false;
  const keys = Object.keys(v);
  if (keys.length > MAX_FIELD_KEYS) return false;
  return keys.every((key) => {
    if (FORBIDDEN_KEYS.has(key)) return false;
    const value = v[key];
    if (key === 'url' && typeof value === 'string' && !SAFE_URL.test(value)) {
      return false;
    }
    return isFieldValue(value, depth + 1);
  });
}
