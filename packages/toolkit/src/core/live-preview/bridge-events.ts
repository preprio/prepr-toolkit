import {
  createScopedLogger,
  getTrustedParentOrigin,
  sendPreprEvent,
} from '../utils';
import { isAllowedEditorOrigin } from '../iframe-bridge';
import type { LiveStore } from './live-store';
import { isLiveValue, parseEditTarget, parseListEntries } from './validate';

const debug = createScopedLogger('live-preview:bridge');

// Message shapes the Prepr editor posts into the preview iframe.
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
  /**
   * Editor origins allowed to drive live preview, read on every handshake.
   * Defaults to `https://<tenant>.prepr.io`; same semantics as the toolbar's
   * `allowedEditorOrigins`.
   */
  allowedEditorOrigins?: () => string[] | undefined;
}

/**
 * Feeds editor live-preview events into the store. Same trusted-origin rule
 * as the toolbar bridge: the first `prepr:initVE` from an allowed editor
 * origin wins; everything else is ignored. Kept separate from the toolbar
 * bridge so live preview works without the toolbar mounted.
 */
export function createLiveBridge(
  store: LiveStore,
  options: LiveBridgeOptions = {},
): LiveBridge {
  let parentOrigin: string | null = null;

  const onMessage = (evt: MessageEvent): void => {
    const data = evt?.data as LiveEditorMessage | undefined;
    if (data?.event === 'prepr:initVE' && !parentOrigin) {
      // Pushed values end up in rendered HTML (rich text bodies), and on a
      // server render in the site's own response. Only the Prepr editor may
      // send them: any other page framing the site must be ignored.
      if (isAllowedEditorOrigin(evt.origin, options.allowedEditorOrigins?.())) {
        parentOrigin = evt.origin;
      } else {
        debug.warn('ignored live preview handshake from origin', evt.origin);
      }
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
