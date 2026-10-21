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
  /** Reorder, remove and add entries of a list field (`prepr:listChange`). */
  pushList(itemId: string, field: string, list: LiveListEntry[]): void;
  invalidate(itemId: string): void;
  setFetcher(fetcher: LiveFetcher): void;
  /** Fires on every accepted `invalidate`, before refetches settle. */
  onInvalidate(fn: (itemId: string) => void): () => void;
  /**
   * Every unsaved change received since the last save, oldest first, one
   * entry per item and field (a newer value replaces the older entry). This
   * is what a server render needs to show the same changes: pass it to
   * `normalizeQuery`. Cleared when the editor saves.
   */
  getLog(): LivePatch[];
  /** Fires whenever the log changes, including when it is cleared. */
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
 * Holds every registered query result. Push patches apply synchronously by
 * `_id`; invalidations debounce per item and refetch only registrations whose
 * index contains that item. Pure data + subscribers — postMessage wiring lives
 * in bridge-events.ts, framework reactivity in the adapters.
 */
export function createLiveStore(): LiveStore {
  const entries = new Set<Entry>();
  const invalidateListeners = new Set<(itemId: string) => void>();
  const pendingInvalidates = new Map<string, ReturnType<typeof setTimeout>>();
  let defaultFetcher: LiveFetcher | null = null;
  let log: LivePatch[] = [];
  const logListeners = new Set<(log: LivePatch[]) => void>();

  function record(patch: LivePatch): void {
    const next = log.filter(
      (p) =>
        p.type !== patch.type ||
        p.itemId !== patch.itemId ||
        p.field !== patch.field,
    );
    next.push(patch);
    log = next.slice(-MAX_LOG_ENTRIES);
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
      // Data that arrives after the editor made changes (a server re-render,
      // a component mounting late) starts from stored content: replay the
      // unsaved changes so it shows what the editor shows. Replaying onto
      // data that already includes them changes nothing.
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
          // Entries moved and new ids appeared: positions in the old index
          // no longer point at the same objects.
          entry.index = indexSnapshot(next);
          notify(entry);
        }
      }
    },

    invalidate(itemId) {
      // A save makes the stored content current; replaying the unsaved
      // changes on top of it would only resurrect stale values.
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
