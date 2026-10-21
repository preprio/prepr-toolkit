import type { LivePath, SnapshotIndex } from './index-snapshot';

const INDEX_SEGMENT = /^\d+$/;
// The field path arrives over postMessage; these would reach the prototype.
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

/** Values the push leg may write. Everything else goes through refetch. */
export type LiveScalar = string | number | boolean;

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
  value: LiveScalar,
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
  value: LiveScalar,
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
  if (!isPatchable(container[key])) return root;
  if (container[key] === value) return root;

  // Clone root → container along the path, then write the value.
  const newRoot = cloneNode(root);
  let cursor = newRoot;
  for (let i = 0; i < last; i++) {
    const child = cloneNode(cursor[fullPath[i]]);
    cursor[fullPath[i]] = child;
    cursor = child;
  }
  cursor[key] = value;
  markChanged();
  return newRoot;
}
