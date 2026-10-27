import type {
  LiveBridge,
  LivePatch,
  LiveStore,
  applyPatchLog,
} from '../core/live-preview';
import type { QueryInput } from '../core/live-preview/query-document';
import { onTestReset } from '../core/live-preview/test-reset';

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
}

/**
 * Svelte's store contract, written out so this module needs no build-time
 * dependency on `svelte`. Read it with `$store` in a component.
 */
export interface NormalizedQueryStore<T> {
  subscribe(run: (value: T) => void): () => void;
}

let starting: Promise<void> | null = null;
let store: LiveStore | null = null;
let bridge: LiveBridge | null = null;
let applyLog: typeof applyPatchLog | null = null;
let log: LivePatch[] = [];
let allowedEditorOrigins: string[] | undefined;
let strictMode: boolean | undefined;
const logListeners = new Set<() => void>();
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
        log = next;
        logListeners.forEach((listener) => listener());
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
  if (!options.enabled || !isFramed()) {
    return {
      subscribe(run) {
        run(data);
        return () => {};
      },
    };
  }
  if (options.strictMode) strictMode = true;
  if (options.allowedEditorOrigins) {
    allowedEditorOrigins = [...options.allowedEditorOrigins];
  }
  startLive();
  // The log only fills once `applyLog` is loaded.
  const current = (): T =>
    log.length && applyLog ? applyLog(query, data, log) : data;

  return {
    subscribe(run) {
      run(current());
      const onLog = () => run(current());
      logListeners.add(onLog);

      let offInvalidate: (() => void) | null = null;
      const stopWaiting = options.onSave
        ? whenLive((started) => {
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

onTestReset(() => {
  bridge?.stop();
  bridge = null;
  store = null;
  starting = null;
  applyLog = null;
  log = [];
  logListeners.clear();
  startListeners.clear();
  allowedEditorOrigins = undefined;
  strictMode = undefined;
});
