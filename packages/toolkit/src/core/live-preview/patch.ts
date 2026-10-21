import { vercelStegaSplit } from '@vercel/stega';

import { fieldKeyIn } from './field-name';
import type { LivePath, SnapshotIndex } from './index-snapshot';

const INDEX_SEGMENT = /^\d+$/;
// The field path arrives over postMessage; these would reach the prototype.
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

/** Values the push leg may write. Everything else goes through refetch. */
export type LiveScalar = string | number | boolean;

/** A structured field value, such as an asset: `{ url, width, height }`. */
export interface LiveObject {
  [key: string]: LiveScalar | null | LiveObject;
}

/** Anything a `prepr:fieldChange` may carry. */
export type LiveValue = LiveScalar | null | LiveObject | LiveObject[];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Fold `incoming` into `current` without changing its shape: only keys the
 * page's query already selected are updated, so a component keeps the props
 * it was typed for. The pushed value comes from the editor, not the query.
 */
function mergeObject(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  let changed = false;
  const next: Record<string, unknown> = { ...current };
  for (const key of Object.keys(current)) {
    if (!(key in incoming) || incoming[key] === undefined) continue;
    const value =
      isPlainObject(current[key]) && isPlainObject(incoming[key])
        ? mergeObject(current[key], incoming[key])
        : incoming[key];
    if (value !== current[key]) {
      next[key] = value;
      changed = true;
    }
  }
  return changed ? next : current;
}

/** `incoming` with exactly the keys of `template`, missing ones as null. */
function shapeLike(
  template: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(template)) {
    const value = incoming[key];
    out[key] =
      value === undefined
        ? null
        : isPlainObject(template[key]) && isPlainObject(value)
          ? shapeLike(template[key], value)
          : value;
  }
  return out;
}

/**
 * New value for a structured field. Tolerates a single-value field receiving
 * a list and the reverse, since the editor and the query may disagree on
 * cardinality. An empty field takes the pushed value as-is: there is no
 * queried shape to fit it to.
 */
function mergeStructured(current: unknown, incoming: LiveValue): unknown {
  if (incoming === null || (Array.isArray(incoming) && !incoming.length)) {
    if (Array.isArray(current)) return current.length ? [] : current;
    return null;
  }
  const list = (Array.isArray(incoming) ? incoming : [incoming]) as Array<
    Record<string, unknown>
  >;
  if (current === null || current === undefined) return incoming;
  if (Array.isArray(current)) {
    const template = current.find(isPlainObject);
    return list.map((entry) => {
      const match = current.find(
        (c) => isPlainObject(c) && c._id !== undefined && c._id === entry._id,
      );
      if (isPlainObject(match)) return mergeObject(match, entry);
      // A new entry takes the queried shape, never another entry's values:
      // a key the editor did not send is null, not the first entry's value.
      return isPlainObject(template) ? shapeLike(template, entry) : entry;
    });
  }
  if (isPlainObject(current)) return mergeObject(current, list[0]);
  return current;
}

function isPatchable(current: unknown): boolean {
  return (
    current === null ||
    typeof current === 'string' ||
    typeof current === 'number' ||
    typeof current === 'boolean'
  );
}

/** Shallow-clone one container, preserving array vs object shape. */
function cloneNode(node: unknown): Record<string | number, unknown> {
  return Array.isArray(node)
    ? ([...node] as unknown as Record<number, unknown>)
    : { ...(node as Record<string, unknown>) };
}

/**
 * Write `field = value` on every indexed occurrence of `itemId`, cloning only
 * the containers along each changed path (structural sharing everywhere else).
 * Returns the original snapshot untouched when no occurrence qualifies.
 */
export function patchSnapshot(
  snapshot: unknown,
  index: SnapshotIndex,
  itemId: string,
  field: string,
  value: LiveValue,
): unknown {
  const paths = index.get(itemId);
  if (!paths?.length) return snapshot;

  let root = snapshot;
  let changed = false;

  for (const path of paths) {
    root = patchAtPath(root, path, field, value, () => {
      changed = true;
    });
  }

  return changed ? root : snapshot;
}

function patchAtPath(
  root: unknown,
  path: LivePath,
  field: string,
  value: LiveValue,
  markChanged: () => void,
): unknown {
  // `field` is a key on the item, or a dotted path below it for values with
  // no `_id` of their own: `content.3.body` is the body of the fourth entry
  // in a dynamic content field.
  const segments = field.split('.');
  if (segments.some((s) => FORBIDDEN_SEGMENTS.has(s))) return root;
  // The editor names fields by API id; the data holds them under the API id
  // or its GraphQL (snake_case) name.
  let node: unknown = root;
  for (const step of path) {
    node = (node as Record<string | number, unknown>)[step];
  }
  const fullPath: LivePath = [...path];
  for (const segment of segments) {
    let step: string | number = segment;
    if (INDEX_SEGMENT.test(segment)) {
      step = Number(segment);
    } else if (node !== null && typeof node === 'object') {
      step = fieldKeyIn(node as Record<string, unknown>, segment) ?? segment;
    }
    fullPath.push(step);
    node =
      node !== null && typeof node === 'object'
        ? (node as Record<string | number, unknown>)[step]
        : undefined;
  }
  return writeAtPath(root, fullPath, value, markChanged);
}

/**
 * Write `value` at `fullPath` from the snapshot root, under the same rules as
 * a field push: the key must already exist, scalars only replace scalars, and
 * structured values keep the queried shape. Clones only along the path.
 */
export function writeAtPath(
  root: unknown,
  fullPath: LivePath,
  value: LiveValue,
  markChanged: () => void = () => {},
): unknown {
  if (!fullPath.length) return root;
  if (fullPath.some((s) => FORBIDDEN_SEGMENTS.has(String(s)))) return root;
  const last = fullPath.length - 1;

  // Resolve the target container, bailing out if the path no longer matches
  // the data.
  let node: unknown = root;
  for (let i = 0; i < last; i++) {
    if (node === null || typeof node !== 'object') return root;
    node = (node as Record<string | number, unknown>)[fullPath[i]];
  }
  if (node === null || typeof node !== 'object') return root;

  const container = node as Record<string | number, unknown>;
  const key = fullPath[last];
  if (!(key in container)) return root;
  let next: unknown;
  if (value === null || typeof value === 'object') {
    next = mergeStructured(container[key], value);
  } else if (!isPatchable(container[key])) {
    return root;
  } else {
    next = keepEditLink(container[key], value);
  }
  if (container[key] === next) return root;

  // Clone root → container along the path, then write the value.
  const newRoot = cloneNode(root);
  let cursor = newRoot;
  for (let i = 0; i < last; i++) {
    const child = cloneNode(cursor[fullPath[i]]);
    cursor[fullPath[i]] = child;
    cursor = child;
  }
  cursor[key] = next;
  markChanged();
  return newRoot;
}

// --- List changes -----------------------------------------------------------

/** One entry of a `prepr:listChange`, in the editor's order. */
export interface LiveListEntry {
  /** Stored id, or a temporary `tmp:` id for an entry added before save. */
  _id: string;
  __typename?: string;
  /** Text entries only: the HTML and heading level the editor holds. */
  body?: string;
  format?: string | null;
  /**
   * A new entry's type as the editor names it (`Side by side`), used when
   * `__typename` is unknown; the query's own type names decide.
   */
  typeName?: string;
  /**
   * A new entry's field values, keyed by GraphQL field name and shaped as
   * the API returns them. With them, `normalizeQuery` builds the entry in
   * the shape the query selects.
   */
  fields?: Record<string, unknown>;
}

/** Builds a new list entry in the queried shape, or returns undefined. */
export type LiveEntryBuilder = (
  entry: LiveListEntry,
) => Record<string, unknown> | undefined;

function listKeysOf(entry: unknown): string[] {
  if (!isPlainObject(entry)) return [];
  const keys: string[] = [];
  if (typeof entry._id === 'string') keys.push(entry._id);
  const first = Array.isArray(entry.items) ? entry.items[0] : null;
  if (isPlainObject(first) && typeof first._id === 'string') {
    keys.push(first._id);
  }
  return keys;
}

const TAG_PATTERN = /<[^>]+>/g;

/**
 * A new Text entry, in the shape the page queried for its sibling Text
 * entries. Internal links and the hidden edit marker are missing until the
 * entry is saved and the page refreshes.
 */
function buildText(
  entry: LiveListEntry,
  template: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const body = typeof entry.body === 'string' ? entry.body : '';
  const full: Record<string, unknown> = {
    __typename: 'Text',
    _id: entry._id,
    body,
    html: body,
    text: body.replace(TAG_PATTERN, ''),
    format: entry.format ?? null,
  };
  if (!template) return full;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(template)) {
    out[key] = key in full ? full[key] : null;
  }
  return out;
}

/**
 * Rebuild one list in the editor's order. Existing entries are reused as the
 * same objects, so the page keeps their rendered output; new Text entries are
 * built; anything else new is left out and appears after save.
 *
 * Returns `current` untouched when nothing changed, when the page selected no
 * ids on these entries, or when none of the editor's ids match: ids that no
 * longer line up (for example right after a save) must not empty the list.
 * An empty `entries` does empty it: the editor removed the last entry.
 */
function syncList(
  current: unknown,
  entries: LiveListEntry[],
  build?: LiveEntryBuilder,
): unknown {
  // A list field of a component added before save holds null until its
  // first entry arrives; start it empty so that entry can be built.
  if (current === null || current === undefined) {
    const built = syncList([], entries, build) as unknown[];
    return built.length ? built : current;
  }
  if (!Array.isArray(current)) return current;
  const byKey = new Map<string, unknown>();
  const templates = new Map<string, Record<string, unknown>>();
  for (const c of current) {
    // An entry is found by its own `_id` and, for an assets entry, also by
    // its first asset's `_id`: the editor and the page may be on different
    // sides of an id change (an image swapped, a backend that just started
    // returning entry ids) and must still meet.
    for (const key of listKeysOf(c)) byKey.set(key, c);
    if (isPlainObject(c) && typeof c.__typename === 'string') {
      if (!templates.has(c.__typename)) templates.set(c.__typename, c);
    }
  }
  // The editor sends an empty list only when the last entry was removed.
  if (!entries.length) return current.length ? [] : current;
  if (current.length && !byKey.size) return current;
  if (current.length && !entries.some((e) => byKey.has(e._id))) return current;

  const next: unknown[] = [];
  for (const entry of entries) {
    const existing = byKey.get(entry._id);
    const built =
      existing === undefined && entry.fields ? build?.(entry) : undefined;
    if (existing !== undefined) {
      next.push(existing);
    } else if (built) {
      next.push(built);
    } else if (entry.__typename === 'Text') {
      next.push(buildText(entry, templates.get('Text')));
    }
  }
  const same =
    next.length === current.length && next.every((n, i) => n === current[i]);
  return same ? current : next;
}

/**
 * Apply a list change at `<owner>.<field>` on every indexed occurrence of
 * `itemId`, cloning only along the changed paths.
 */
export function syncListSnapshot(
  snapshot: unknown,
  index: SnapshotIndex,
  itemId: string,
  field: string,
  entries: LiveListEntry[],
): unknown {
  const paths = index.get(itemId);
  if (!paths?.length) return snapshot;
  const fieldPath = field.split('.');
  if (fieldPath.some((s) => FORBIDDEN_SEGMENTS.has(s))) return snapshot;

  let root = snapshot;
  for (const path of paths) {
    root = syncListAtPath(root, [...path, ...fieldPath], entries);
  }
  return root;
}

/**
 * Apply a list change to the list at `fullPath` from the snapshot root,
 * cloning only along that path. Returns `root` untouched when nothing changed.
 */
export function syncListAtPath(
  root: unknown,
  fullPath: LivePath,
  entries: LiveListEntry[],
  build?: LiveEntryBuilder,
): unknown {
  if (!fullPath.length) return root;
  if (fullPath.some((s) => FORBIDDEN_SEGMENTS.has(String(s)))) return root;
  let node: unknown = root;
  for (const key of fullPath) {
    node =
      node !== null && typeof node === 'object'
        ? (node as Record<string | number, unknown>)[key]
        : undefined;
  }
  const next = syncList(node, entries, build);
  if (next === node) return root;
  const newRoot = cloneNode(root);
  let cursor = newRoot;
  for (let i = 0; i < fullPath.length - 1; i++) {
    const child = cloneNode(cursor[fullPath[i]]);
    cursor[fullPath[i]] = child;
    cursor = child;
  }
  cursor[fullPath[fullPath.length - 1]] = next;
  return newRoot;
}

/**
 * Text the editor pushes carries no hidden edit link, while the value it
 * replaces does. Carrying the old link over keeps the element
 * click-to-edit while the editor types.
 */
export function keepEditLink(current: unknown, value: LiveValue): LiveValue {
  if (typeof current !== 'string' || typeof value !== 'string') return value;
  const { encoded } = vercelStegaSplit(current);
  if (!encoded || vercelStegaSplit(value).encoded) return value;
  return value + encoded;
}
