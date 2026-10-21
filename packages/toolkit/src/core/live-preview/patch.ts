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
  const fieldPath: LivePath = field
    .split('.')
    .map((segment) =>
      INDEX_SEGMENT.test(segment) ? Number(segment) : segment,
    );
  if (fieldPath.some((s) => FORBIDDEN_SEGMENTS.has(String(s)))) return root;
  const fullPath = [...path, ...fieldPath];
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
  let next: unknown = value;
  if (value === null || typeof value === 'object') {
    next = mergeStructured(container[key], value);
  } else if (!isPatchable(container[key])) {
    return root;
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
}

/**
 * The key an entry is known by on both sides: its `_id`, or for an assets
 * entry (which has no `_id` of its own) its first asset's `_id`.
 */
function listKeyOf(entry: unknown): string | null {
  if (!isPlainObject(entry)) return null;
  if (typeof entry._id === 'string') return entry._id;
  const first = Array.isArray(entry.items) ? entry.items[0] : null;
  return isPlainObject(first) && typeof first._id === 'string'
    ? first._id
    : null;
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
 */
function syncList(current: unknown, entries: LiveListEntry[]): unknown {
  if (!Array.isArray(current)) return current;
  const byKey = new Map<string, unknown>();
  const templates = new Map<string, Record<string, unknown>>();
  for (const c of current) {
    const key = listKeyOf(c);
    if (key) byKey.set(key, c);
    if (isPlainObject(c) && typeof c.__typename === 'string') {
      if (!templates.has(c.__typename)) templates.set(c.__typename, c);
    }
  }
  if (current.length && !byKey.size) return current;
  if (current.length && !entries.some((e) => byKey.has(e._id))) return current;

  const next: unknown[] = [];
  for (const entry of entries) {
    const existing = byKey.get(entry._id);
    if (existing !== undefined) {
      next.push(existing);
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
    const full = [...path, ...fieldPath];
    let node: unknown = root;
    for (const key of full) {
      node =
        node !== null && typeof node === 'object'
          ? (node as Record<string | number, unknown>)[key]
          : undefined;
    }
    const next = syncList(node, entries);
    if (next === node) continue;
    const newRoot = cloneNode(root);
    let cursor = newRoot;
    for (let i = 0; i < full.length - 1; i++) {
      const child = cloneNode(cursor[full[i]]);
      cursor[full[i]] = child;
      cursor = child;
    }
    cursor[full[full.length - 1]] = next;
    root = newRoot;
  }
  return root;
}
