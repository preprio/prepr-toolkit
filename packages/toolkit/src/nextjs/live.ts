'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  createLiveBridge,
  createLiveStore,
  type LiveBridge,
  type LiveFetcher,
  type LiveStore,
} from '../core/live-preview';
import type { LivePatch } from '../core/live-preview/normalize-query';
import { createScopedLogger } from '../core/utils';
import { syncPreprLiveLog } from './live-action';

const debug = createScopedLogger('live-preview:next');

/** Coalesces bursts of keystrokes into one server render. */
const LOG_SYNC_DEBOUNCE_MS = 150;

export interface LivePreviewConfig {
  /** Runs registered queries against Prepr GraphQL (preview/draft mode). */
  fetcher?: LiveFetcher;
  /**
   * Replace the `*.prepr.io` editor-origin wildcard with an exact list, as
   * the toolbar's option of the same name. Only these origins can push
   * changes into the page.
   */
  allowedEditorOrigins?: string[];
}

export interface UseLiveOptions {
  /** Opaque query (string or DocumentNode) — handed straight to the fetcher. */
  query?: unknown;
  variables?: Record<string, unknown>;
}

let store: LiveStore | null = null;
let bridge: LiveBridge | null = null;
let allowedEditorOrigins: string[] | undefined;

function isFramed(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}

function getLiveStore(): LiveStore {
  if (!store) {
    store = createLiveStore();
    bridge = createLiveBridge(store, {
      allowedEditorOrigins: () => allowedEditorOrigins,
    });
    bridge.start();
  }
  return store;
}

/**
 * Configure the live-preview singleton (call once on the client, e.g. from a
 * small component in the root layout). Without a fetcher the refetch leg is
 * disabled and only keystroke pushes apply.
 */
export function initLivePreview(config: LivePreviewConfig = {}): void {
  if (!isFramed()) return;
  if (config.allowedEditorOrigins) {
    allowedEditorOrigins = [...config.allowedEditorOrigins];
  }
  const s = getLiveStore();
  if (config.fetcher) s.setFetcher(config.fetcher);
}

/**
 * Register a query result for live preview. Outside the Prepr editor iframe
 * this is a passthrough. Inside it, pushed field changes re-render instantly
 * and saves refetch `{ query, variables }` when provided.
 *
 * Requirement: the data must select `_id` on every level that should update.
 */
export function useLive<T>(data: T, opts?: UseLiveOptions): T {
  const [live, setLive] = useState<T>(data);

  useEffect(() => {
    if (!isFramed()) return;
    const registration = getLiveStore().register(data, opts);
    // A new payload from the server, with any unsaved changes replayed.
    setLive(registration.getSnapshot() as T);
    const unsubscribe = registration.subscribe(() =>
      setLive(registration.getSnapshot() as T),
    );
    return () => {
      unsubscribe();
      registration.unregister();
    };
    // opts is intentionally excluded: it changes identity every render but is
    // only read at registration time, which is keyed by the data payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return isFramed() ? live : data;
}

/**
 * Keeps server-rendered content in step with the Prepr editor. Each unsaved
 * change is sent to the server, which re-renders the route; server components
 * show it when they pass their query results through `normalizeQuery` from
 * `@preprio/toolkit/nextjs`. On save the route refreshes with the stored
 * content. Mount it once, in the root layout, inside your preview gate.
 *
 * Use this OR a `useLive` registration with a `query` per page — with both, a
 * save triggers a refetch and a refresh.
 */
export function PreprRefresh(): null {
  const router = useRouter();

  useEffect(() => {
    if (!isFramed()) return;
    const store = getLiveStore();
    const sync = createLogSync();
    const offLog = store.onLogChange((log) => {
      if (log.length) sync.schedule(log);
      else sync.cancel();
    });
    const offInvalidate = store.onInvalidate(() => router.refresh());
    return () => {
      offLog();
      offInvalidate();
      sync.cancel();
    };
  }, [router]);

  return null;
}

/**
 * Sends the latest log after a short pause, one request at a time: changes
 * made while a render is in flight are sent once it settles, so renders never
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
  allowedEditorOrigins = undefined;
}
