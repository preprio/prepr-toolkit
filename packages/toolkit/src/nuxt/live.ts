import {
  computed,
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  unref,
  type ComputedRef,
  type Ref,
} from 'vue';

import {
  createLiveBridge,
  type LiveBridge,
} from '../core/live-preview/bridge-events';
import {
  createLiveStore,
  type LiveStore,
} from '../core/live-preview/live-store';
import {
  normalizeQuery,
  type LivePatch,
} from '../core/live-preview/normalize-query';
import type { QueryInput } from '../core/live-preview/query-document';

export interface UseNormalizedQueryOptions {
  /**
   * Called when the editor saves, for example `refresh` from `useAsyncData`,
   * so the page shows the stored content again.
   */
  onSave?: () => void;
  /**
   * Replace the `*.prepr.io` editor-origin wildcard with an exact list, as
   * the toolbar's option of the same name.
   */
  allowedEditorOrigins?: string[];
}

let store: LiveStore | null = null;
let bridge: LiveBridge | null = null;
const log = shallowRef<LivePatch[]>([]);
let allowedEditorOrigins: string[] | undefined;

function isFramed(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}

function liveStore(): LiveStore {
  if (!store) {
    store = createLiveStore();
    bridge = createLiveBridge(store, {
      allowedEditorOrigins: () => allowedEditorOrigins,
    });
    bridge.start();
    store.onLogChange((next) => {
      log.value = next;
    });
  }
  return store;
}

/**
 * Show the Prepr editor's unsaved changes in a Nuxt page: pass the query and
 * the data you fetched, and render the computed value it returns.
 *
 * ```ts
 * const { data, refresh } = await useAsyncData('page', () => fetchPage(slug));
 * const page = useNormalizedQuery(GetPageDocument, data, { onSave: refresh });
 * ```
 *
 * Nuxt hydrates the whole page, so applying the changes in the browser
 * updates every component that renders them, while the editor types, with
 * no server round trip. On the server and outside the Prepr editor's preview
 * iframe it returns the data unchanged. Select `_id` on every item and
 * component that should update.
 */
export function useNormalizedQuery<T>(
  query: QueryInput,
  data: Ref<T> | T,
  options: UseNormalizedQueryOptions = {},
): ComputedRef<T> {
  if (!isFramed()) return computed(() => unref(data) as T);
  if (options.allowedEditorOrigins) {
    allowedEditorOrigins = [...options.allowedEditorOrigins];
  }
  const s = liveStore();
  if (options.onSave && getCurrentScope()) {
    const onSave = options.onSave;
    onScopeDispose(s.onInvalidate(() => onSave()));
  }
  return computed(() => {
    const value = unref(data) as T;
    return log.value.length
      ? normalizeQuery(query, value, { log: log.value })
      : value;
  });
}

/** Test-only: drop the singleton store between test cases. */
export function resetNuxtLivePreviewForTests(): void {
  bridge?.stop();
  bridge = null;
  store = null;
  log.value = [];
  allowedEditorOrigins = undefined;
}
