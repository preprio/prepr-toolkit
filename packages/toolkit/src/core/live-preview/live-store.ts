import { createScopedLogger } from '../utils';
import { indexSnapshot, type SnapshotIndex } from './index-snapshot';
import { patchSnapshot, type LiveValue } from './patch';

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
  pushPatch(itemId: string, field: string, value: LiveValue): void;
  invalidate(itemId: string): void;
  setFetcher(fetcher: LiveFetcher): void;
  /** Fires on every accepted `invalidate`, before refetches settle. */
  onInvalidate(fn: (itemId: string) => void): () => void;
}

const INVALIDATE_DEBOUNCE_MS = 150;

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

    pushPatch(itemId, field, value) {
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

    invalidate(itemId) {
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
  };
}
