'use client';

import { useEffect } from 'react';

import { createPreprPreview } from '../core/create-preview';
import type { PreprNavigationAdapter } from '../core/create-preview';
import { loadTrackingPixel } from '../core/pixel';
import type { PreprPixelConfig } from '../core/pixel';
import type { PreprToolbarComponentProps } from '../core/types';

export interface PreprPreviewProps extends PreprToolbarComponentProps {
  /**
   * Router binding for segment/variant switches and the preview-mode refresh.
   * Optional: the default adapter drives `window.location`, which is correct
   * for any router that keeps the URL bar in sync.
   *
   * Pass one to get soft navigation instead of full page loads. Only worth it
   * with `segments` or `abTesting` enabled — with both off the sole reachable
   * path is the preview-mode refresh, which reloads either way.
   */
  navigation?: PreprNavigationAdapter;
}

/**
 * Mounts the Prepr preview runtime — the toolbar, click-to-edit, and the
 * editor bridge — in any React app. Renders nothing: the toolbar UI is a
 * custom element `createPreprPreview` mounts imperatively.
 *
 * Framework-free. Next.js users want `PreprToolbar` from
 * `@preprio/toolkit/nextjs` instead, which binds the App Router for them.
 *
 * Mount it once per page. Two mounted copies start two editor bridges and
 * announce the preview twice.
 */
export function PreprPreview({
  options,
  navigation,
  ...props
}: PreprPreviewProps): null {
  // Mount-time config: the empty dep array means changing any prop after mount
  // has no effect. Remounting is the way to change it — a live update would
  // have to tear down the editor bridge and re-announce the preview.
  useEffect(() => {
    const preview = createPreprPreview({ props, options, navigation });

    return () => preview.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export interface PreprTrackingPixelProps {
  /** Prepr tracking/access token. */
  id: string;
  config?: PreprPixelConfig;
}

/**
 * Loads Prepr's CDN tracking pixel on mount. Renders nothing.
 *
 * The pixel queues a single `pageload` event when it installs. Client-side
 * route changes emit nothing on their own — call `trackEvent('pageload')` from
 * the router to count them.
 */
export function PreprTrackingPixel({
  id,
  config,
}: PreprTrackingPixelProps): null {
  useEffect(() => {
    loadTrackingPixel(id, config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
