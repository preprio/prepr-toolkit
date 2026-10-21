import {
  createScopedLogger,
  getTrustedParentOrigin,
  sendPreprEvent,
} from '../utils';
import type { LiveStore } from './live-store';
import type { LiveValue } from './patch';

const debug = createScopedLogger('live-preview:bridge');

// Message shapes the Prepr editor posts into the preview iframe.
interface LiveEditorMessage {
  event?: string;
  itemId?: unknown;
  field?: unknown;
  value?: unknown;
}

export interface LiveBridge {
  start(): void;
  stop(): void;
}

function isScalar(v: unknown): v is string | number | boolean {
  return (
    typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
  );
}

const MAX_DEPTH = 3;
const MAX_ENTRIES = 50;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const SAFE_URL = /^https?:\/\//i;

/**
 * Structured values (an asset swapped in the editor) arrive over postMessage
 * and end up in rendered props such as an image `src`: plain objects and
 * arrays only, bounded in size and depth, no prototype keys, and any `url`
 * must be http(s) so a `javascript:` or `data:` URL never reaches the page.
 */
function isLiveValue(v: unknown, depth = 0): v is LiveValue {
  if (v === null || isScalar(v)) return true;
  if (depth >= MAX_DEPTH) return false;
  if (Array.isArray(v)) {
    return (
      depth === 0 &&
      v.length <= MAX_ENTRIES &&
      v.every((entry) => isPlainRecord(entry) && isLiveValue(entry, depth + 1))
    );
  }
  if (!isPlainRecord(v)) return false;
  const keys = Object.keys(v);
  if (keys.length > MAX_ENTRIES) return false;
  return keys.every((key) => {
    if (FORBIDDEN_KEYS.has(key)) return false;
    const value = v[key];
    if (key === 'url' && typeof value === 'string' && !SAFE_URL.test(value)) {
      return false;
    }
    return !Array.isArray(value) && isLiveValue(value, depth + 1);
  });
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return (
    v !== null &&
    typeof v === 'object' &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

/**
 * Feeds editor live-preview events into the store. Same trusted-origin rule
 * as iframe-bridge.ts: the first `prepr:initVE` sender wins; everything else
 * is ignored. Kept separate from the toolbar bridge so live preview works
 * without the toolbar mounted.
 */
export function createLiveBridge(store: LiveStore): LiveBridge {
  let parentOrigin: string | null = null;

  const onMessage = (evt: MessageEvent): void => {
    const data = evt?.data as LiveEditorMessage | undefined;
    if (data?.event === 'prepr:initVE' && !parentOrigin) {
      parentOrigin = evt.origin;
      return;
    }
    // This bridge starts when the first live component mounts, which can be
    // after the editor handshake already ran; the toolbar bridge's
    // allowlisted origin covers that case.
    const trusted = parentOrigin ?? getTrustedParentOrigin();
    if (!trusted || evt.origin !== trusted) return;

    if (data?.event === 'prepr:fieldChange') {
      if (
        typeof data.itemId === 'string' &&
        typeof data.field === 'string' &&
        isLiveValue(data.value)
      ) {
        store.pushPatch(data.itemId, data.field, data.value);
      } else {
        debug.log('dropped malformed fieldChange', data as object);
      }
      return;
    }

    if (data?.event === 'prepr:itemChanged') {
      // Always the ROOT content item id (the item open in the editor), never
      // a component instance id — see the design spec's protocol section.
      if (typeof data.itemId === 'string') {
        store.invalidate(data.itemId);
      } else {
        debug.log('dropped malformed itemChanged', data as object);
      }
    }
  };

  return {
    start(): void {
      window.addEventListener('message', onMessage);
      // Tells the editor this page applies `prepr:fieldChange` pushes and
      // refreshes itself on `prepr:itemChanged`, so it can skip reloading the
      // iframe after a save. Carries no content, so it may go out before the
      // handshake.
      sendPreprEvent('live_ready', undefined, { allowUntrustedTarget: true });
    },
    stop(): void {
      window.removeEventListener('message', onMessage);
    },
  };
}
