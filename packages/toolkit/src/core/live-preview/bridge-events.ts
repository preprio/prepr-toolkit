import {
  createScopedLogger,
  getTrustedParentOrigin,
  sendPreprEvent,
} from '../utils';
import { isAllowedEditorOrigin } from '../iframe-bridge';
import type { LiveStore } from './live-store';
import {
  isLiveFieldChange,
  parseEditTarget,
  parseListEntries,
} from './validate';

const debug = createScopedLogger('live-preview:bridge');

interface LiveEditorMessage {
  event?: string;
  itemId?: unknown;
  field?: unknown;
  value?: unknown;
  entries?: unknown;
  edit?: unknown;
}

export interface LiveBridge {
  start(): void;
  stop(): void;
}

export interface LiveBridgeOptions {
  /** Same semantics as the toolbar's `allowedEditorOrigins`. */
  allowedEditorOrigins?: () => string[] | undefined;
  /** Announced in `live_ready`; see the toolbar's `strictMode`. */
  strictMode?: () => boolean | undefined;
}

/**
 * Feeds editor live-preview events into the store. The first `prepr:initVE`
 * from an allowed origin wins. Separate from the toolbar bridge so live
 * preview works without the toolbar mounted.
 */
export function createLiveBridge(
  store: LiveStore,
  options: LiveBridgeOptions = {},
): LiveBridge {
  let parentOrigin: string | null = null;

  const onMessage = (evt: MessageEvent): void => {
    const data = evt?.data as LiveEditorMessage | undefined;
    if (data?.event === 'prepr:initVE' && !parentOrigin) {
      // Pushed values reach rendered HTML and server responses, so any other
      // page framing the site must be ignored.
      if (isAllowedEditorOrigin(evt.origin, options.allowedEditorOrigins?.())) {
        parentOrigin = evt.origin;
      } else {
        debug.warn('ignored live preview handshake from origin', evt.origin);
      }
      return;
    }
    // This bridge may start after the handshake already ran; the toolbar
    // bridge's allowlisted origin covers that case.
    const trusted = parentOrigin ?? getTrustedParentOrigin();
    if (!trusted || evt.origin !== trusted) return;

    if (data?.event === 'prepr:fieldChange') {
      if (
        typeof data.itemId === 'string' &&
        typeof data.field === 'string' &&
        data.field &&
        isLiveFieldChange(data.field, data.value)
      ) {
        const edit = parseEditTarget(data.edit);
        if (edit) store.pushPatch(data.itemId, data.field, data.value, edit);
        else store.pushPatch(data.itemId, data.field, data.value);
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
      // Always the id of the item open in the editor, never a component
      // instance id.
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
      // Lets the editor skip reloading the iframe after a save. Carries no
      // content, so it may go out before the handshake.
      sendPreprEvent(
        'live_ready',
        options.strictMode?.() ? { strictMode: true } : undefined,
        { allowUntrustedTarget: true },
      );
    },
    stop(): void {
      window.removeEventListener('message', onMessage);
    },
  };
}
