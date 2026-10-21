import {
  createScopedLogger,
  getTrustedParentOrigin,
  sendPreprEvent,
} from '../utils';
import type { LiveStore } from './live-store';
import { isLiveValue, parseListEntries } from './validate';

const debug = createScopedLogger('live-preview:bridge');

// Message shapes the Prepr editor posts into the preview iframe.
interface LiveEditorMessage {
  event?: string;
  itemId?: unknown;
  field?: unknown;
  value?: unknown;
  entries?: unknown;
}

export interface LiveBridge {
  start(): void;
  stop(): void;
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

    if (data?.event === 'prepr:listChange') {
      const list = parseListEntries(data.entries);
      if (
        typeof data.itemId === 'string' &&
        typeof data.field === 'string' &&
        data.field &&
        list
      ) {
        store.pushList(data.itemId, data.field, list);
      } else {
        debug.log('dropped malformed listChange', data as object);
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
