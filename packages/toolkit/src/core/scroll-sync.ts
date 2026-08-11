import { createIframeBridge, type IframeBridgeOptions } from './iframe-bridge';
import { sendPreprEvent } from './utils';

export interface PreprScrollSync {
  /** Detach listeners and drop the parent-origin trust grant. */
  destroy(): void;
}

/**
 * Scroll-position sync with the parent Prepr editor, without the toolbar.
 *
 * For previews that want the editor to restore where the user was scrolled to,
 * but no personalization UI: no segments, no variants, no click-to-edit, no
 * `<prepr-toolbar>` element. Origin validation is the same as the full toolbar
 * (`https://<tenant>.prepr.io`, or `allowedEditorOrigins` when set).
 *
 * Outside an iframe this is a no-op beyond the mount announcement, matching
 * `createPreprToolbar`.
 *
 * Use this *or* `createPreprToolbar`, not both: they are separate entry points
 * into the same bridge, and mounting both starts two bridges on one page.
 */
export function createPreprScrollSync(
  options: IframeBridgeOptions = {},
): PreprScrollSync {
  const noop: PreprScrollSync = { destroy: () => {} };
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return noop;
  }

  // Announces to the parent editor that a preview has mounted — the same
  // message the toolbar sends. The payload is a constant and carries no content
  // data, so it is safe to broadcast before a trusted origin is established.
  sendPreprEvent('getScrollPosition', { value: 0 }, {
    allowUntrustedTarget: true,
  });

  if (window.parent === window) return noop;

  const bridge = createIframeBridge(null, options);
  bridge.start();

  return { destroy: () => bridge.stop() };
}
