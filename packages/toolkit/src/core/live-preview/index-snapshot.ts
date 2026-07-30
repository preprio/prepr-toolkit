import { createScopedLogger } from '../utils';

const debug = createScopedLogger('live-preview');

/** Path from the snapshot root to an object, e.g. ['Page', 'content', 0]. */
export type LivePath = Array<string | number>;

/** Item `_id` → every location of that item within one registered snapshot. */
export type SnapshotIndex = Map<string, LivePath[]>;

/**
 * Deep-walk a GraphQL result and record where every `_id`-carrying object
 * lives. GraphQL responses are JSON trees; the visited set is purely a
 * cycle guard so a malformed input can't hang the walk.
 */
export function indexSnapshot(data: unknown): SnapshotIndex {
  const index: SnapshotIndex = new Map();
  const visited = new WeakSet<object>();

  function walk(node: unknown, path: LivePath): void {
    if (node === null || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, [...path, i]));
      return;
    }

    const record = node as Record<string, unknown>;
    if (typeof record._id === 'string') {
      const paths = index.get(record._id) ?? [];
      paths.push(path);
      index.set(record._id, paths);
    } else if (typeof record.__typename === 'string') {
      // Live-update requirement: items must select `_id` (debug-only warning,
      // same visibility rules as every other scoped log).
      debug.log(
        `item with __typename "${record.__typename}" has no _id — it will not live-update`
      );
    }
    for (const [key, value] of Object.entries(record)) {
      walk(value, [...path, key]);
    }
  }

  walk(data, []);
  return index;
}
