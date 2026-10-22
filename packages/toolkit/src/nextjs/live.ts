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
  /** Your preview token uses GraphQL strict mode; see the toolbar option. */
  strictMode?: boolean;
}

export interface PreprRefreshProps {
  /** Pass your preview flag; never `true` on a production deployment. */
  enabled?: boolean;
  /** Your preview token uses GraphQL strict mode; see the toolbar option. */
  strictMode?: boolean;
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
let strictMode = false;
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
      const skipped = new Set(quarantined());
      const started = createLiveStore({
        accept: (patch) => !skipped.has(patchKey(patch)),
      });
      watchClientRenders(started);
      bridge = createLiveBridge(started, {
        allowedEditorOrigins: () => allowedEditorOrigins,
        strictMode: () => strictMode,
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
  if (config.strictMode) strictMode = true;
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
export function PreprRefresh({
  enabled = false,
  strictMode: strict = false,
}: PreprRefreshProps): null {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || !isFramed()) return;
    if (strict) strictMode = true;
    const sync = createLogSync();
    let unsubscribe: (() => void) | null = null;
    let active = true;
    void startLive().then((started) => {
      if (!active) return;
      const offLog = started.onLogChange((log) => {
        if (log.length) sync.schedule(log);
        else sync.reset();
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
  }, [enabled, strict, router]);

  return null;
}

// Characters Prepr's hidden edit links are made of.
const STEGA_CHARS = /[\u200b-\u200d\u2060-\u2064\ufeff]/;
const RENDER_SETTLE_MS = 1000;
const RENDER_POLL_MS = 100;

/**
 * Whether the page shows Prepr content: elements the visual editor tagged,
 * or text that still carries hidden edit links. An error page shows none.
 */
function showsPreprContent(): boolean {
  return (
    document.querySelector('[data-prepr-encoded]') !== null ||
    // Visible text only: inline scripts carry the route's data, edit links
    // included, even when the route rendered its error page.
    STEGA_CHARS.test(document.body?.innerText ?? '')
  );
}

/** Calls `onBreak` once the page loses its Prepr content; returns a stop. */
function watchUntilSettled(onBreak: () => void): () => void {
  const interval = setInterval(() => {
    if (showsPreprContent()) return;
    clearInterval(interval);
    onBreak();
  }, RENDER_POLL_MS);
  return () => clearInterval(interval);
}

// Changes that broke the page, kept for this tab across the reload that
// recovers from them. The editor sends its unsaved changes again after the
// reload; these are left out until the item is saved or the value changes.
const QUARANTINE_KEY = '__prepr_live_quarantine';
const MAX_QUARANTINED = 50;

function quarantined(): string[] {
  try {
    const stored: unknown = JSON.parse(
      sessionStorage.getItem(QUARANTINE_KEY) ?? '[]',
    );
    return Array.isArray(stored)
      ? stored.filter((key): key is string => typeof key === 'string')
      : [];
  } catch {
    return [];
  }
}

function setQuarantined(keys: string[]): void {
  try {
    if (keys.length) {
      sessionStorage.setItem(
        QUARANTINE_KEY,
        JSON.stringify(keys.slice(-MAX_QUARANTINED)),
      );
    } else {
      sessionStorage.removeItem(QUARANTINE_KEY);
    }
  } catch {
    // Storage blocked: recovery still reloads, it only cannot skip the change.
  }
}

const patchKey = (patch: LivePatch): string => JSON.stringify(patch);

const CLIENT_RENDER_MS = 300;

let recovering = false;

/** Sets the changes since the last good render aside and reloads the frame. */
function recoverFrom(log: LivePatch[], lastGood: LivePatch[]): void {
  if (recovering) return;
  recovering = true;
  debug.warn('a live change broke the page; reloading without it');
  const good = new Set(lastGood.map(patchKey));
  const broken = log.map(patchKey).filter((key) => !good.has(key));
  setQuarantined([...quarantined(), ...broken]);
  window.location.reload();
}

/**
 * Client components (`useLive`) re-render as soon as a change arrives, and
 * one that throws makes Next.js replace the whole layout, `PreprRefresh`
 * included, with its error page. So this watch lives with the store.
 */
function watchClientRenders(watched: LiveStore): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastGood: LivePatch[] = [];
  watched.onLogChange((log) => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!log.length) {
      lastGood = [];
      setQuarantined([]);
      return;
    }
    if (!showsPreprContent()) return;
    timer = setTimeout(() => {
      timer = null;
      if (showsPreprContent()) lastGood = log;
      else recoverFrom(log, lastGood);
    }, CLIENT_RENDER_MS);
  });
}

/**
 * Sends the latest log after a pause, one request at a time, so renders never
 * pile up behind fast typing and the last state always reaches the server.
 *
 * A component that throws on an unsaved value makes Next.js replace the route
 * with its error page, which a refresh does not undo. When a re-render loses
 * all Prepr content, the changes since the last good render are set aside and
 * the frame reloads, so a live edit never leaves the editor with a broken
 * page.
 */
function createLogSync() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let pending: LivePatch[] | null = null;
  let cancelled = false;
  let lastGood: LivePatch[] = [];

  const send = async (incoming: LivePatch[]): Promise<void> => {
    const skipped = new Set(quarantined());
    const log = skipped.size
      ? incoming.filter((patch) => !skipped.has(patchKey(patch)))
      : incoming;
    if (!log.length) return;
    inFlight = true;
    // Watched on a timer rather than after the action: when an error page
    // replaces the layout mid-render, the action's promise never settles.
    const stopWatching = showsPreprContent()
      ? watchUntilSettled(() => recoverFrom(log, lastGood))
      : () => {};
    let failed = false;
    try {
      await syncPreprLiveLog(log);
    } catch (error) {
      failed = true;
      debug.log('sending unsaved changes failed', error as object);
    }
    // Let the render land before the watch ends.
    await new Promise((resolve) => setTimeout(resolve, RENDER_SETTLE_MS));
    stopWatching();
    inFlight = false;
    if (recovering) return;
    if (!failed) lastGood = log;
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
    /** After a save: the stored content is what renders now. */
    reset(): void {
      this.cancel();
      lastGood = [];
      setQuarantined([]);
    },
  };
}

/** Test-only: drop the singleton store/bridge between test cases. */
export function resetLivePreviewForTests(): void {
  bridge?.stop();
  bridge = null;
  store = null;
  starting = null;
  recovering = false;
  startListeners.clear();
  allowedEditorOrigins = undefined;
  strictMode = false;
}
