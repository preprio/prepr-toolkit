import { createScopedLogger } from '../utils';
import type { LiveStore } from './live-store';

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
    if (!parentOrigin || evt.origin !== parentOrigin) return;

    if (data?.event === 'prepr:fieldChange') {
      if (
        typeof data.itemId === 'string' &&
        typeof data.field === 'string' &&
        isScalar(data.value)
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
    },
    stop(): void {
      window.removeEventListener('message', onMessage);
    },
  };
}
