import type { ToolbarStore } from './store';
import { sendPreprEvent, setTrustedParentOrigin } from './utils';

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
 * Origins allowed to drive the toolbar over postMessage. The handshake grants
 * control of preview/edit mode, so it must never be open to any framing page:
 * without this check, any site that iframes a preview URL can race a
 * `prepr:initVE` message on load, become the trusted parent, and both drive
 * toolbar state and receive the events the toolbar posts back.
 */
// TODO(prepr): confirm this list against the real editor deployment before
// release — an origin missing here silently disables the visual editor, and
// staging/self-hosted editors must use `allowedEditorOrigins` to opt in.
export const DEFAULT_ALLOWED_EDITOR_ORIGINS = [
  'https://editor.prepr.io',
  'https://app.prepr.io',
];

function isAllowedEditorOrigin(origin: string, allowed: string[]): boolean {
  // Exact origin match only — no prefix/suffix matching, which `evil-prepr.io`
  // or `app.prepr.io.attacker.com` would otherwise satisfy.
  return allowed.includes(origin);
}

export interface IframeBridgeOptions {
  /**
   * Override the trusted editor origins. Intended for self-hosted or staging
   * Prepr editors; defaults to Prepr's production editor origins.
   */
  allowedEditorOrigins?: string[];
}

/**
 * Handshake with the parent Prepr editor and keep the store in sync with
 * editor-driven activation.
 *
 * - `prepr:initVE`: accepted only from an allowlisted editor origin. Restores
 *   the editor-saved scroll position and seeds preview + edit mode. `editMode`
 *   defaults to true; the editor may send false for preview-only.
 * - `prepr:getScrollPosition`: replies with the current scroll offset.
 * - Ctrl/Cmd+S/P/L are swallowed — the browser save/print dialogs break the
 *   editor overlay.
 */
export function createIframeBridge(
  store: ToolbarStore,
  options: IframeBridgeOptions = {},
): IframeBridge {
  const allowedOrigins =
    options.allowedEditorOrigins ?? DEFAULT_ALLOWED_EDITOR_ORIGINS;
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
      // Validate BEFORE touching the store: this branch enables preview and
      // edit mode, so an unvalidated sender must not reach it.
      if (!isAllowedEditorOrigin(evt.origin, allowedOrigins)) return;
      parentOrigin = evt.origin;
      // From here on, outbound events target this origin instead of '*'.
      setTrustedParentOrigin(parentOrigin);
      if (data.scrollPosition != null) {
        const top = data.scrollPosition;
        setTimeout(() => window.scrollTo(0, top), 1);
      }
      store.set({ previewMode: true, editMode: data.editMode ?? true });
    }
    if (!parentOrigin || evt.origin !== parentOrigin) return;
    if (data?.event === 'prepr:getScrollPosition') {
      const currentScrollY =
        window.scrollY || document.documentElement.scrollTop;
      sendPreprEvent('getScrollPosition', { value: currentScrollY });
    }
  };

  return {
    start(): void {
      // The only message sent before the handshake: no payload, and the parent
      // origin is unknown by definition, so it is the one '*' target allowed.
      sendPreprEvent('loaded', undefined, { allowUntrustedTarget: true });
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('message', onMessage);
    },
    stop(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('message', onMessage);
      // Drop the trust grant with the listeners, so a re-`start()` must
      // re-validate rather than inheriting a stale origin.
      parentOrigin = null;
      setTrustedParentOrigin(null);
    },
  };
}
