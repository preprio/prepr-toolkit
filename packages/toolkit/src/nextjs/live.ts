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

export interface LivePreviewConfig {
  /** Runs registered queries against Prepr GraphQL (preview/draft mode). */
  fetcher?: LiveFetcher;
}

export interface UseLiveOptions {
  /** Opaque query (string or DocumentNode) — handed straight to the fetcher. */
  query?: unknown;
  variables?: Record<string, unknown>;
}

let store: LiveStore | null = null;
let bridge: LiveBridge | null = null;

function isFramed(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}

function getLiveStore(): LiveStore {
  if (!store) {
    store = createLiveStore();
    bridge = createLiveBridge(store);
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
    setLive(data); // reset when the server sends a new payload
    const registration = getLiveStore().register(data, opts);
    const unsubscribe = registration.subscribe(() =>
      setLive(registration.getSnapshot() as T)
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
 * RSC fallback: refreshes the route on any save so server-rendered content
 * stays current. Use this OR `useLive` per page — with both, a save triggers
 * a refetch and a refresh.
 */
export function PreprRefresh(): null {
  const router = useRouter();

  useEffect(() => {
    if (!isFramed()) return;
    return getLiveStore().onInvalidate(() => router.refresh());
  }, [router]);

  return null;
}

/** Test-only: drop the singleton store/bridge between test cases. */
export function resetLivePreviewForTests(): void {
  bridge?.stop();
  bridge = null;
  store = null;
}
