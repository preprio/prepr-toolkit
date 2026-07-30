import type { LivePath, SnapshotIndex } from './index-snapshot';

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
  value: LiveScalar
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
  markChanged: () => void
): unknown {
  // Resolve the item, bailing out if the path no longer matches the data.
  let node: unknown = root;
  for (const key of path) {
    if (node === null || typeof node !== 'object') return root;
    node = (node as Record<string | number, unknown>)[key];
  }
  if (node === null || typeof node !== 'object') return root;

  const item = node as Record<string, unknown>;
  if (!(field in item)) return root;
  if (!isPatchable(item[field])) return root;
  if (item[field] === value) return root;

  // Clone root → item along the path, then write the field.
  const newRoot = cloneNode(root);
  let cursor = newRoot;
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    const child = cloneNode(cursor[key]);
    cursor[key] = child;
    cursor = child;
  }
  cursor[field] = value;
  markChanged();
  return newRoot;
}
