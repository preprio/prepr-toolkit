import type { LivePatch, applyPatchLog } from '../core/live-preview';
import type { QueryInput } from '../core/live-preview/query-document';
import { annotateEditLinks } from '../core/live-preview/edit-links';
import { createLiveStarter, isFramed } from '../core/live-preview/starter';

export interface NormalizedQueryOptions {
  /**
   * Pass your preview flag; never `true` on a production deployment.
   * Defaults to false: the data is returned unchanged.
   */
  enabled?: boolean;
  /** Called when the editor saves, e.g. `invalidateAll` from `$app/navigation`. */
  onSave?: () => void;
  /** Exact editor origins, replacing the `*.prepr.io` default. */
  allowedEditorOrigins?: string[];
  /** See the toolbar's `strictMode`. */
  strictMode?: boolean;
  /** Which operation to use when the query document holds more than one. */
  operationName?: string;
}

/**
 * Svelte's store contract, written out so this module needs no build-time
 * dependency on `svelte`. Read it with `$store` in a component.
 */
export interface NormalizedQueryStore<T> {
  subscribe(run: (value: T) => void): () => void;
}

let applyLog: typeof applyPatchLog | null = null;
let log: LivePatch[] = [];
const logListeners = new Set<() => void>();

const live = createLiveStarter({
  onStart(store, runtime) {
    applyLog = runtime.applyPatchLog;
    store.onLogChange((next) => {
      log = next;
      logListeners.forEach((listener) => listener());
    });
  },
  onReset() {
    applyLog = null;
    log = [];
    logListeners.clear();
  },
});

function constant<T>(value: T): NormalizedQueryStore<T> {
  return {
    subscribe(run) {
      run(value);
      return () => {};
    },
  };
}

/**
 * Show the Prepr editor's unsaved changes in a SvelteKit page, applied in the
 * browser while the editor types:
 *
 * ```svelte
 * <script lang="ts">
 *   import { invalidateAll } from '$app/navigation';
 *   import { normalizedQuery } from '@preprio/toolkit/sveltekit/live';
 *
 *   let { data } = $props();
 *   const result = $derived(
 *     normalizedQuery(GetPageDocument, data.result, {
 *       enabled: data.preview,
 *       onSave: invalidateAll,
 *     }),
 *   );
 * </script>
 *
 * <h1>{$result.Page.title}</h1>
 * ```
 *
 * Returns a store that holds the data unchanged on the server and outside
 * the editor iframe. Select `_id` on every item and component that should
 * update.
 */
export function normalizedQuery<T>(
  query: QueryInput,
  data: T,
  options: NormalizedQueryOptions = {},
): NormalizedQueryStore<T> {
  if (!options.enabled) return constant(data);
  // On the server too, so the hydrated page matches: click-to-edit then
  // finds list entries by id.
  const { operationName } = options;
  const annotated = annotateEditLinks(data, query, operationName);
  if (!isFramed()) return constant(annotated);
  live.configure(options);
  void live.start();
  // The log only fills once `applyLog` is loaded.
  const current = (): T =>
    log.length && applyLog
      ? applyLog(query, annotated, log, operationName)
      : annotated;

  return {
    subscribe(run) {
      run(current());
      const onLog = () => run(current());
      logListeners.add(onLog);

      let offInvalidate: (() => void) | null = null;
      const stopWaiting = options.onSave
        ? live.whenLive((started) => {
            offInvalidate = started.onInvalidate(() => options.onSave?.());
          })
        : () => {};

      return () => {
        logListeners.delete(onLog);
        stopWaiting();
        offInvalidate?.();
      };
    },
  };
}
