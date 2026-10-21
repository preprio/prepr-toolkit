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
      const match =
        current.find(
          (c) => isPlainObject(c) && c._id !== undefined && c._id === entry._id,
        ) ?? template;
      return isPlainObject(match) ? mergeObject(match, entry) : entry;
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
