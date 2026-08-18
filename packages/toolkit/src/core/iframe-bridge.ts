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
 * Base domain whose subdomains may drive the toolbar. Editor hosts are
 * per-tenant (`acme.prepr.io`), so an exact list is impossible by design.
 *
 * The handshake grants control of preview/edit mode, so this must never be
 * open to any framing page: without the check, any site that iframes a
 * preview URL can race a `prepr:initVE` message on load, become the trusted
 * parent, and both drive toolbar state and receive the events posted back.
 */
const EDITOR_BASE_DOMAIN = 'prepr.io';

/**
 * True for `https://<label>.prepr.io` — exactly one subdomain label, HTTPS,
 * default port.
 *
 * Parsed with `URL` rather than matched as a string. A raw
 * `origin.endsWith('.prepr.io')` accepts `https://attacker.com/?x=https://
 * acme.prepr.io` and plain-HTTP origins, and matching on the whole origin
 * string rather than the parsed hostname is how those slip through.
 *
 * The single-label rule additionally rules out nested hosts such as
 * `foo.stream.prepr.io` and `cdn.tracking.prepr.io`. Tenant editors are always
 * one label deep, so nothing legitimate is lost, and asset/CDN subdomains stay
 * unable to drive the toolbar even if content on them is ever attacker-shaped.
 */
function isAllowedEditorOrigin(origin: string, allowed?: string[]): boolean {
  // An explicit list opts out of the wildcard entirely (self-hosted editors).
  if (allowed) return allowed.includes(origin);

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  // `origin` from a MessageEvent is scheme://host[:port] — a non-default port
  // survives into url.port, and "null" (sandboxed/opaque) fails URL parsing.
  if (url.protocol !== 'https:' || url.port !== '') return false;

  const suffix = `.${EDITOR_BASE_DOMAIN}`;
  if (!url.hostname.endsWith(suffix)) return false;

  const label = url.hostname.slice(0, -suffix.length);
  // Exactly one non-empty label, no nested subdomains.
  return label.length > 0 && !label.includes('.');
}

export interface IframeBridgeOptions {
  /**
   * Replace the `*.prepr.io` wildcard with an exact origin list. Intended for
   * self-hosted editors; when set, the wildcard no longer applies.
   */
  allowedEditorOrigins?: string[];
}

/**
 * Handshake with the parent Prepr editor and keep the store in sync with
 * editor-driven activation.
 *
 * `store` may be null: scroll restore and the origin handshake work on their
 * own, without a toolbar or any personalization state. The preview runtime
 * always passes a real store — a headless preview (`ui: false`) still carries
 * edit state — so the null case is for direct callers and tests.
 *
 * - `prepr:initVE`: accepted only from `https://<tenant>.prepr.io`, or from an
 *   exact origin in `allowedEditorOrigins` when that option is set. Restores
 *   the editor-saved scroll position and seeds preview + edit mode. `editMode`
 *   defaults to true; the editor may send false for preview-only.
 * - `prepr:getScrollPosition`: replies with the current scroll offset.
 * - Outbound `loaded` reports the resolved feature flags, so the editor can
 *   hide controls for features the site disabled.
 * - Ctrl/Cmd+S/P/L are swallowed — the browser save/print dialogs break the
 *   editor overlay.
 */
export function createIframeBridge(
  store: ToolbarStore | null,
  options: IframeBridgeOptions = {},
): IframeBridge {
  const allowedOrigins = options.allowedEditorOrigins;
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
      // Deliberately ignores `features.editMode`: that option gates the site's
      // own click-to-edit affordance, not the CMS driving its own preview
      // iframe. A consumer who disabled edit mode still gets a working visual
      // editor. See the JSDoc on PreprFeatures.editMode.
      store?.set({ previewMode: true, editMode: data.editMode ?? true });
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
      // The only message sent before the handshake, so the parent origin is
      // unknown by definition and this is the one '*' target allowed. The
      // feature flags ride along so the editor can hide UI for features this
      // site turned off — they are static config, not content data.
      const features = store?.get().features;
      sendPreprEvent(
        'loaded',
        features
          ? {
              segments: features.segments,
              abTesting: features.abTesting,
              editMode: features.editMode,
            }
          : undefined,
        { allowUntrustedTarget: true },
      );
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
