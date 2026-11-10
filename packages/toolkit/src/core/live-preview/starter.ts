import type { LiveBridge } from './bridge-events';
import type { LiveStore, LiveStoreOptions } from './live-store';
import { onTestReset } from './test-reset';

type LiveRuntime = typeof import('./index');

/** Whether the page runs inside a frame, as it does in the Prepr editor. */
export function isFramed(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}

export interface LiveStarterConfig {
  /** Exact editor origins, replacing the `*.prepr.io` default. */
  allowedEditorOrigins?: string[];
  /** The preview token uses GraphQL strict mode. */
  strictMode?: boolean;
}

export interface LiveStarterOptions {
  /** Read once, when the runtime starts. */
  storeOptions?: () => LiveStoreOptions;
  /** Runs once the store exists, before the editor bridge listens. */
  onStart?: (store: LiveStore, runtime: LiveRuntime) => void;
  /** Drops the caller's own state along with the starter's. Tests only. */
  onReset?: () => void;
}

export interface LiveStarter {
  /**
   * Settings the bridge reads when it starts. They only ever widen: strict
   * mode stays on once set, and a later list of origins replaces the earlier.
   */
  configure(config: LiveStarterConfig): void;
  /** Loads and starts the live preview runtime once; later calls reuse it. */
  start(): Promise<LiveStore>;
  /**
   * Calls `listener` with the store, now or once it has started. Returns a
   * function that stops waiting.
   */
  whenLive(listener: (store: LiveStore) => void): () => void;
}

/**
 * One store and one editor bridge per page, shared by every caller of a
 * framework wrapper. The runtime is imported on first `start()`, so a visitor
 * outside the editor never downloads it.
 */
export function createLiveStarter(
  options: LiveStarterOptions = {},
): LiveStarter {
  let starting: Promise<LiveStore> | null = null;
  let store: LiveStore | null = null;
  let bridge: LiveBridge | null = null;
  let allowedEditorOrigins: string[] | undefined;
  let strictMode = false;
  const startListeners = new Set<(store: LiveStore) => void>();

  onTestReset(() => {
    bridge?.stop();
    bridge = null;
    store = null;
    starting = null;
    startListeners.clear();
    allowedEditorOrigins = undefined;
    strictMode = false;
    options.onReset?.();
  });

  return {
    configure(config): void {
      if (config.strictMode) strictMode = true;
      if (config.allowedEditorOrigins) {
        allowedEditorOrigins = [...config.allowedEditorOrigins];
      }
    },
    start(): Promise<LiveStore> {
      starting ??= import('./index').then((runtime) => {
        const started = runtime.createLiveStore(options.storeOptions?.());
        options.onStart?.(started, runtime);
        bridge = runtime.createLiveBridge(started, {
          allowedEditorOrigins: () => allowedEditorOrigins,
          strictMode: () => strictMode,
        });
        bridge.start();
        store = started;
        startListeners.forEach((listener) => listener(started));
        startListeners.clear();
        return started;
      });
      return starting;
    },
    whenLive(listener): () => void {
      if (store) {
        listener(store);
        return () => {};
      }
      startListeners.add(listener);
      return () => startListeners.delete(listener);
    },
  };
}
