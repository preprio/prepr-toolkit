'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { LiveBridge, LiveFetcher, LiveStore } from '../core/live-preview';
import type { LivePatch } from '../core/live-preview/normalize-query';
import { createScopedLogger } from '../core/utils';
import { syncPreprLiveLog } from './live-action';

const debug = createScopedLogger('live-preview:next');

const LOG_SYNC_DEBOUNCE_MS = 150;

export interface LivePreviewConfig {
  /**
   * Pass your preview flag; never `true` on a production deployment.
   * Defaults to false: nothing starts and `useLive` is a passthrough.
   */
  enabled?: boolean;
  /** Runs registered queries against Prepr GraphQL in preview mode. */
  fetcher?: LiveFetcher;
  /** Exact editor origins, replacing the `*.prepr.io` default. */
  allowedEditorOrigins?: string[];
}

export interface PreprRefreshProps {
  /** Pass your preview flag; never `true` on a production deployment. */
  enabled?: boolean;
}

export interface UseLiveOptions {
  /** Query (string or DocumentNode) passed as-is to the fetcher. */
  query?: unknown;
  variables?: Record<string, unknown>;
}

let starting: Promise<LiveStore> | null = null;
let store: LiveStore | null = null;
let bridge: LiveBridge | null = null;
let allowedEditorOrigins: string[] | undefined;
const startListeners = new Set<(store: LiveStore) => void>();

function isFramed(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}

/**
 * Loads the runtime lazily, only when enabled, so visitors never download it
 * and a framed production page never takes changes from anyone.
 */
function startLive(): Promise<LiveStore> {
  starting ??= import('../core/live-preview').then(
    ({ createLiveBridge, createLiveStore }) => {
      const started = createLiveStore();
      bridge = createLiveBridge(started, {
        allowedEditorOrigins: () => allowedEditorOrigins,
      });
      bridge.start();
      store = started;
      startListeners.forEach((listener) => listener(started));
      startListeners.clear();
      return started;
    },
  );
  return starting;
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
 * Turn live preview on for `useLive`. Call once on the client with your
 * preview flag as `enabled`. Without a fetcher, saves do not refetch. Not
 * needed when `PreprRefresh` is enabled.
 */
export function initLivePreview(config: LivePreviewConfig = {}): void {
  if (!config.enabled || !isFramed()) return;
  if (config.allowedEditorOrigins) {
    allowedEditorOrigins = [...config.allowedEditorOrigins];
  }
  const { fetcher } = config;
  void startLive().then((started) => {
    if (fetcher) started.setFetcher(fetcher);
  });
}

/**
 * Register a query result for live preview. Field changes re-render
 * instantly; saves refetch `{ query, variables }` when given. A passthrough
 * until live preview is enabled and outside the editor iframe. The data must
 * select `_id` on every level that should update.
 */
export function useLive<T>(data: T, opts?: UseLiveOptions): T {
  const [live, setLive] = useState<T>(data);

  useEffect(() => {
    if (!isFramed()) return;
    let unregister: (() => void) | null = null;
    const stopWaiting = whenLive((started) => {
      const registration = started.register(data, opts);
      setLive(registration.getSnapshot() as T);
      const unsubscribe = registration.subscribe(() =>
        setLive(registration.getSnapshot() as T),
      );
      unregister = () => {
        unsubscribe();
        registration.unregister();
      };
    });
    return () => {
      stopWaiting();
      unregister?.();
    };
    // opts changes identity every render but is only read at registration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return isFramed() ? live : data;
}

/**
 * Keeps server components in step with the Prepr editor: unsaved changes
 * re-render the route, where `normalizeQuery` applies them; a save refreshes
 * it. Mount once in the root layout with your preview flag as `enabled`.
 * Use this or `useLive` with a `query`, not both: a save would refetch and
 * refresh.
 */
export function PreprRefresh({ enabled = false }: PreprRefreshProps): null {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || !isFramed()) return;
    const sync = createLogSync();
    let unsubscribe: (() => void) | null = null;
    let active = true;
    void startLive().then((started) => {
      if (!active) return;
      const offLog = started.onLogChange((log) => {
        if (log.length) sync.schedule(log);
        else sync.cancel();
      });
      const offInvalidate = started.onInvalidate(() => router.refresh());
      unsubscribe = () => {
        offLog();
        offInvalidate();
      };
    });
    return () => {
      active = false;
      unsubscribe?.();
      sync.cancel();
    };
  }, [enabled, router]);

  return null;
}

/**
 * Sends the latest log after a pause, one request at a time, so renders never
 * pile up behind fast typing and the last state always reaches the server.
 */
function createLogSync() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let pending: LivePatch[] | null = null;
  let cancelled = false;

  const send = async (log: LivePatch[]): Promise<void> => {
    inFlight = true;
    try {
      await syncPreprLiveLog(log);
    } catch (error) {
      debug.log('sending unsaved changes failed', error as object);
    } finally {
      inFlight = false;
    }
    if (pending && !cancelled) {
      const next = pending;
      pending = null;
      void send(next);
    }
  };

  return {
    schedule(log: LivePatch[]): void {
      cancelled = false;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (inFlight) pending = log;
        else void send(log);
      }, LOG_SYNC_DEBOUNCE_MS);
    },
    cancel(): void {
      cancelled = true;
      pending = null;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/** Test-only: drop the singleton store/bridge between test cases. */
export function resetLivePreviewForTests(): void {
  bridge?.stop();
  bridge = null;
  store = null;
  starting = null;
  startListeners.clear();
  allowedEditorOrigins = undefined;
}
