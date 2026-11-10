import {
  computed,
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  unref,
  type ComputedRef,
  type Ref,
} from 'vue';

import type { LivePatch, applyPatchLog } from '../core/live-preview';
import type { QueryInput } from '../core/live-preview/query-document';
import { annotateEditLinks } from '../core/live-preview/edit-links';
import { createLiveStarter, isFramed } from '../core/live-preview/starter';

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

let applyLog: typeof applyPatchLog | null = null;
const log = shallowRef<LivePatch[]>([]);

const live = createLiveStarter({
  onStart(store, runtime) {
    applyLog = runtime.applyPatchLog;
    store.onLogChange((next) => {
      log.value = next;
    });
  },
  onReset() {
    applyLog = null;
    log.value = [];
  },
});

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
  if (!options.enabled) return computed(() => unref(data) as T);
  // On the server too, so the hydrated page matches: click-to-edit then
  // finds list entries by id.
  const annotated = computed(() => annotateEditLinks(unref(data) as T, query));
  if (!isFramed()) return annotated;
  live.configure(options);
  void live.start();
  if (options.onSave && getCurrentScope()) {
    const onSave = options.onSave;
    let offInvalidate: (() => void) | null = null;
    const stopWaiting = live.whenLive((started) => {
      offInvalidate = started.onInvalidate(() => onSave());
    });
    onScopeDispose(() => {
      stopWaiting();
      offInvalidate?.();
    });
  }
  // The log only fills once `applyLog` is loaded.
  return computed(() => {
    const value = annotated.value;
    return log.value.length && applyLog
      ? applyLog(query, value, log.value)
      : value;
  });
}
