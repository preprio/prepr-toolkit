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
import { onTestReset } from '../core/live-preview/test-reset';

export interface UseNormalizedQueryOptions {
  /**
   * Pass your preview flag; never `true` on a production deployment.
   * Defaults to false: the data is returned unchanged.
   */
  enabled?: boolean;
  /** Called when the editor saves, e.g. `refresh` from `useAsyncData`. */
  onSave?: () => void;
  /** Exact editor origins, replacing the `*.prepr.io` default. */
  allowedEditorOrigins?: string[];
  /** See the toolbar's `strictMode`. */
  strictMode?: boolean;
}

let starting: Promise<void> | null = null;
let store: LiveStore | null = null;
let bridge: LiveBridge | null = null;
let applyLog: typeof applyPatchLog | null = null;
const log = shallowRef<LivePatch[]>([]);
let allowedEditorOrigins: string[] | undefined;
let strictMode: boolean | undefined;
const startListeners = new Set<(store: LiveStore) => void>();

function isFramed(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}

/** Loaded lazily, only when enabled in an iframe, so visitors never download it. */
function startLive(): void {
  starting ??= import('../core/live-preview').then(
    ({ applyPatchLog, createLiveBridge, createLiveStore }) => {
      applyLog = applyPatchLog;
      const started = createLiveStore();
      bridge = createLiveBridge(started, {
        allowedEditorOrigins: () => allowedEditorOrigins,
        strictMode: () => strictMode,
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

function whenLive(listener: (store: LiveStore) => void): () => void {
  if (store) {
    listener(store);
    return () => {};
  }
  startListeners.add(listener);
  return () => startListeners.delete(listener);
}

/**
 * Show the Prepr editor's unsaved changes in a Nuxt page, applied in the
 * browser while the editor types:
 *
 * ```ts
 * const page = useNormalizedQuery(GetPageDocument, data, {
 *   enabled: isPreview,
 *   onSave: refresh,
 * });
 * ```
 *
 * Returns the data unchanged on the server and outside the editor iframe.
 * Select `_id` on every item and component that should update.
 */
export function useNormalizedQuery<T>(
  query: QueryInput,
  data: Ref<T> | T,
  options: UseNormalizedQueryOptions = {},
): ComputedRef<T> {
  if (!options.enabled || !isFramed()) {
    return computed(() => unref(data) as T);
  }
  if (options.strictMode) strictMode = true;
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
  // The log only fills once `applyLog` is loaded.
  return computed(() => {
    const value = unref(data) as T;
    return log.value.length && applyLog
      ? applyLog(query, value, log.value)
      : value;
  });
}

onTestReset(() => {
  bridge?.stop();
  bridge = null;
  store = null;
  starting = null;
  applyLog = null;
  startListeners.clear();
  log.value = [];
  allowedEditorOrigins = undefined;
  strictMode = undefined;
});
