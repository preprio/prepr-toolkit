import {
  computed,
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  unref,
  type ComputedRef,
  type Ref,
} from 'vue';

import type {
  LiveBridge,
  LivePatch,
  LiveStore,
  applyPatchLog,
} from '../core/live-preview';
import type { QueryInput } from '../core/live-preview/query-document';

export interface UseNormalizedQueryOptions {
  /**
   * Whether live preview runs. Pass your preview flag, and never `true` on a
   * production deployment. When false (the default) the data is returned
   * unchanged and the page does not listen to the editor.
   */
  enabled?: boolean;
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

let starting: Promise<void> | null = null;
let store: LiveStore | null = null;
let bridge: LiveBridge | null = null;
let applyLog: typeof applyPatchLog | null = null;
const log = shallowRef<LivePatch[]>([]);
let allowedEditorOrigins: string[] | undefined;
const startListeners = new Set<(store: LiveStore) => void>();

function isFramed(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}

/**
 * Loads the live preview runtime and starts listening to the editor. Only
 * called with `enabled` inside an iframe, so other visitors never download
 * it.
 */
function startLive(): void {
  starting ??= import('../core/live-preview').then(
    ({ applyPatchLog, createLiveBridge, createLiveStore }) => {
      applyLog = applyPatchLog;
      const started = createLiveStore();
      bridge = createLiveBridge(started, {
        allowedEditorOrigins: () => allowedEditorOrigins,
      });
      bridge.start();
      started.onLogChange((next) => {
        log.value = next;
      });
      store = started;
      startListeners.forEach((listener) => listener(started));
      startListeners.clear();
    },
  );
}

/** Runs `listener` once live preview has started; returns an unsubscribe. */
function whenLive(listener: (store: LiveStore) => void): () => void {
  if (store) {
    listener(store);
    return () => {};
  }
  startListeners.add(listener);
  return () => startListeners.delete(listener);
}

/**
 * Show the Prepr editor's unsaved changes in a Nuxt page: pass the query and
 * the data you fetched, and render the computed value it returns.
 *
 * ```ts
 * const { data, refresh } = await useAsyncData('page', () => fetchPage(slug));
 * const page = useNormalizedQuery(GetPageDocument, data, {
 *   enabled: isPreview,
 *   onSave: refresh,
 * });
 * ```
 *
 * Nuxt hydrates the whole page, so applying the changes in the browser
 * updates every component that renders them, while the editor types, with
 * no server round trip. Without `enabled`, on the server and outside the
 * Prepr editor's preview iframe it returns the data unchanged. Select `_id` on every item and
 * component that should update.
 */
export function useNormalizedQuery<T>(
  query: QueryInput,
  data: Ref<T> | T,
  options: UseNormalizedQueryOptions = {},
): ComputedRef<T> {
  if (!options.enabled || !isFramed()) {
    return computed(() => unref(data) as T);
  }
  if (options.allowedEditorOrigins) {
    allowedEditorOrigins = [...options.allowedEditorOrigins];
  }
  startLive();
  if (options.onSave && getCurrentScope()) {
    const onSave = options.onSave;
    let offInvalidate: (() => void) | null = null;
    const stopWaiting = whenLive((started) => {
      offInvalidate = started.onInvalidate(() => onSave());
    });
    onScopeDispose(() => {
      stopWaiting();
      offInvalidate?.();
    });
  }
  // The log only fills once the runtime, and with it `applyLog`, is loaded.
  return computed(() => {
    const value = unref(data) as T;
    return log.value.length && applyLog
      ? applyLog(query, value, log.value)
      : value;
  });
}

/** Test-only: drop the singleton store between test cases. */
export function resetNuxtLivePreviewForTests(): void {
  bridge?.stop();
  bridge = null;
  store = null;
  starting = null;
  applyLog = null;
  startListeners.clear();
  log.value = [];
  allowedEditorOrigins = undefined;
}
