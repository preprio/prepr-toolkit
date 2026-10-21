import { createScopedLogger } from '../utils';
import { indexSnapshot, type SnapshotIndex } from './index-snapshot';
import type { LivePatch } from './normalize-query';
import type { LiveEditTarget } from './validate';
import {
  patchSnapshot,
  syncListSnapshot,
  type LiveListEntry,
  type LiveValue,
} from './patch';

const debug = createScopedLogger('live-preview');

/** Executes a registered query. `query` is opaque — string or DocumentNode. */
export interface LiveFetcher {
  (query: unknown, variables?: Record<string, unknown>): Promise<unknown>;
}

export interface LiveRegistrationOptions {
  query?: unknown;
  variables?: Record<string, unknown>;
  fetcher?: LiveFetcher;
}

export interface LiveRegistration {
  getSnapshot(): unknown;
  subscribe(fn: () => void): () => void;
  unregister(): void;
}

export interface LiveStore {
  register(data: unknown, opts?: LiveRegistrationOptions): LiveRegistration;
  pushPatch(
    itemId: string,
    field: string,
    value: LiveValue,
    edit?: LiveEditTarget,
  ): void;
  pushList(itemId: string, field: string, list: LiveListEntry[]): void;
  invalidate(itemId: string): void;
  setFetcher(fetcher: LiveFetcher): void;
  /** Fires on every accepted `invalidate`, before refetches settle. */
  onInvalidate(fn: (itemId: string) => void): () => void;
  /**
   * Unsaved changes since the last save, oldest first: what a server render
   * passes to `normalizeQuery` to show the same changes.
   */
  getLog(): LivePatch[];
  onLogChange(fn: (log: LivePatch[]) => void): () => void;
}

const INVALIDATE_DEBOUNCE_MS = 150;
const MAX_LOG_ENTRIES = 500;

interface Entry {
  snapshot: unknown;
  index: SnapshotIndex;
  opts: LiveRegistrationOptions;
  listeners: Set<() => void>;
  fetchToken: number;
}

/**
 * The log with `patch` recorded, replacing an older change to the same field
 * so the log stays short while an editor types. A field path can hold a list
 * position (`content.3.body`), so the older change is kept when a list
 * change recorded since could have moved what it addressed.
 */
function withPatch(log: LivePatch[], patch: LivePatch): LivePatch[] {
  let previous = -1;
  for (let i = log.length - 1; i >= 0; i--) {
    const p = log[i];
    if (
      p.type === patch.type &&
      p.itemId === patch.itemId &&
      p.field === patch.field
    ) {
      previous = i;
      break;
    }
  }
  if (previous === -1) return [...log, patch];
  const since = log.slice(previous + 1);
  const listPrefix = `${patch.field}.`;
  const dependsOnPosition = since.some(
    (p) =>
      p.type === 'list' ||
      (patch.type === 'list' &&
        p.itemId === patch.itemId &&
        p.field.startsWith(listPrefix)),
  );
  if (dependsOnPosition) return [...log, patch];
  return [...log.slice(0, previous), ...since, patch];
}

/**
 * Holds every registered query result. Pushes apply synchronously by `_id`;
 * invalidations debounce per item and refetch only registrations holding it.
 */
export function createLiveStore(): LiveStore {
  const entries = new Set<Entry>();
  const invalidateListeners = new Set<(itemId: string) => void>();
  const pendingInvalidates = new Map<string, ReturnType<typeof setTimeout>>();
  let defaultFetcher: LiveFetcher | null = null;
  let log: LivePatch[] = [];
  const logListeners = new Set<(log: LivePatch[]) => void>();

  function record(patch: LivePatch): void {
    log = withPatch(log, patch).slice(-MAX_LOG_ENTRIES);
    logListeners.forEach((fn) => fn(log));
  }

  function notify(entry: Entry): void {
    entry.listeners.forEach((fn) => fn());
  }

  async function refetch(entry: Entry): Promise<void> {
    const fetcher = entry.opts.fetcher ?? defaultFetcher;
    if (!fetcher || entry.opts.query == null) return;
    const token = ++entry.fetchToken;
    try {
      const result = await fetcher(entry.opts.query, entry.opts.variables);
      if (token !== entry.fetchToken || !entries.has(entry)) return; // stale
      entry.snapshot = result;
      entry.index = indexSnapshot(result);
      notify(entry);
    } catch (error) {
      debug.log('refetch failed, keeping previous snapshot', error as object);
    }
  }

  function runInvalidate(itemId: string): void {
    pendingInvalidates.delete(itemId);
    invalidateListeners.forEach((fn) => fn(itemId));
    for (const entry of entries) {
      if (entry.index.has(itemId)) void refetch(entry);
    }
  }

  return {
    register(data, opts = {}) {
      const entry: Entry = {
        snapshot: data,
        index: indexSnapshot(data),
        opts,
        listeners: new Set(),
        fetchToken: 0,
      };
      // Data registered after the editor made changes starts from stored
      // content: replay the log. Replaying onto data that has them is a no-op.
      for (const patch of log) {
        if (patch.type === 'field') {
          entry.snapshot = patchSnapshot(
            entry.snapshot,
            entry.index,
            patch.itemId,
            patch.field,
            patch.value,
          );
        } else {
          const next = syncListSnapshot(
            entry.snapshot,
            entry.index,
            patch.itemId,
            patch.field,
            patch.entries,
          );
          if (next !== entry.snapshot) {
            entry.snapshot = next;
            entry.index = indexSnapshot(next);
          }
        }
      }
      entries.add(entry);
      return {
        getSnapshot: () => entry.snapshot,
        subscribe(fn) {
          entry.listeners.add(fn);
          return () => entry.listeners.delete(fn);
        },
        unregister() {
          entry.listeners.clear();
          entries.delete(entry);
        },
      };
    },

    pushPatch(itemId, field, value, edit) {
      // Recorded even when no registration holds the item: a server render
      // may still show it.
      record(
        edit
          ? { type: 'field', itemId, field, value, edit }
          : { type: 'field', itemId, field, value },
      );
      for (const entry of entries) {
        const next = patchSnapshot(
          entry.snapshot,
          entry.index,
          itemId,
          field,
          value,
        );
        if (next !== entry.snapshot) {
          entry.snapshot = next;
          notify(entry);
        }
      }
    },

    pushList(itemId, field, list) {
      record({ type: 'list', itemId, field, entries: list });
      for (const entry of entries) {
        const next = syncListSnapshot(
          entry.snapshot,
          entry.index,
          itemId,
          field,
          list,
        );
        if (next !== entry.snapshot) {
          entry.snapshot = next;
          // Entries moved, so the old index paths are stale.
          entry.index = indexSnapshot(next);
          notify(entry);
        }
      }
    },

    invalidate(itemId) {
      // After a save, replaying the log would resurrect stale values.
      if (log.length) {
        log = [];
        logListeners.forEach((fn) => fn(log));
      }
      const pending = pendingInvalidates.get(itemId);
      if (pending) clearTimeout(pending);
      pendingInvalidates.set(
        itemId,
        setTimeout(() => runInvalidate(itemId), INVALIDATE_DEBOUNCE_MS),
      );
    },

    setFetcher(fetcher) {
      defaultFetcher = fetcher;
    },

    onInvalidate(fn) {
      invalidateListeners.add(fn);
      return () => invalidateListeners.delete(fn);
    },

    getLog: () => log,

    onLogChange(fn) {
      logListeners.add(fn);
      return () => logListeners.delete(fn);
    },
  };
}
