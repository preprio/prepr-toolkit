import type { ToolbarStore } from './store';
import { sendPreprEvent } from './utils';

// Message shapes the Prepr editor posts into the preview iframe.
interface EditorMessage {
  event?: string;
  scrollPosition?: number;
  editMode?: boolean;
}

export interface IframeBridge {
  /** Announce readiness to the parent editor and attach listeners. */
  start(): void;
  stop(): void;
}

/**
 * Handshake with the parent Prepr editor and keep the store in sync with
 * editor-driven activation.
 *
 * - `prepr:initVE`: first message wins as the trusted origin. Restores the
 *   editor-saved scroll position and seeds preview + edit mode. `editMode`
 *   defaults to true; the editor may send false for preview-only.
 * - `prepr:getScrollPosition`: replies with the current scroll offset.
 * - Ctrl/Cmd+S/P/L are swallowed — the browser save/print dialogs break the
 *   editor overlay.
 */
export function createIframeBridge(store: ToolbarStore): IframeBridge {
  let parentOrigin: string | null = null;

  const onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    const blocked =
      (event.ctrlKey || event.metaKey) && ['s', 'p', 'l'].includes(key);
    if (blocked) event.preventDefault();
  };

  const onMessage = (evt: MessageEvent): void => {
    const data = evt?.data as EditorMessage | undefined;
    if (data?.event === 'prepr:initVE' && !parentOrigin) {
      parentOrigin = evt.origin;
      if (data.scrollPosition != null) {
        const top = data.scrollPosition;
        setTimeout(() => window.scrollTo(0, top), 1);
      }
      store.set({ previewMode: true, editMode: data.editMode ?? true });
    }
    if (evt.origin !== parentOrigin) return;
    if (data?.event === 'prepr:getScrollPosition') {
      const currentScrollY =
        window.scrollY || document.documentElement.scrollTop;
      sendPreprEvent('getScrollPosition', { value: currentScrollY });
    }
  };

  return {
    start(): void {
      sendPreprEvent('loaded');
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('message', onMessage);
    },
    stop(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('message', onMessage);
    },
  };
}
