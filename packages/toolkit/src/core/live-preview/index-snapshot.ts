import { createScopedLogger } from '../utils';

const debug = createScopedLogger('live-preview');

/** Path from the snapshot root to an object, e.g. ['Page', 'content', 0]. */
export type LivePath = Array<string | number>;

/** Item `_id` → every location of that item within one registered snapshot. */
export type SnapshotIndex = Map<string, LivePath[]>;

/**
 * Record where every `_id`-carrying object lives in a GraphQL result. The
 * visited set guards against cycles in malformed input.
 */
export function indexSnapshot(data: unknown): SnapshotIndex {
  const index: SnapshotIndex = new Map();
  const visited = new WeakSet<object>();
  // Mutated during the walk; copied only when an item is recorded.
  const path: LivePath = [];

  function walk(node: unknown): void {
    if (node === null || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        path.push(i);
        walk(node[i]);
        path.pop();
      }
      return;
    }

    const record = node as Record<string, unknown>;
    if (typeof record._id === 'string') {
      const paths = index.get(record._id);
      if (paths) paths.push([...path]);
      else index.set(record._id, [[...path]]);
    } else if (typeof record.__typename === 'string') {
      debug.log('item without _id will not live-update', {
        __typename: record.__typename,
      });
    }
    for (const key in record) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
      path.push(key);
      walk(record[key]);
      path.pop();
    }
  }

  walk(data);
  return index;
}
