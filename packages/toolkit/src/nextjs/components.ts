'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { createPreprPreview } from '../core/create-preview';
import { loadTrackingPixel } from '../core/pixel';
import type { PreprPixelConfig } from '../core/pixel';
import type { PreprToolbarComponentProps } from '../core/types';

/**
 * Mounts the Prepr toolbar and wires it to the Next.js router so segment/variant
 * switches navigate. Renders nothing — the toolbar UI is a custom element that
 * `createPreprPreview` mounts imperatively.
 */
export function PreprToolbar({
  options,
  ...props
}: PreprToolbarComponentProps): null {
  const router = useRouter();
  const pathname = usePathname();

  // Mount-time config: the empty dep array below means changing `options`
  // after mount has no effect.
  useEffect(() => {
    const toolbar = createPreprPreview({
      props,
      options,
      navigation: {
        navigate: url => router.push(url),
        currentPath: () => pathname + window.location.search,
      },
    });

    return () => toolbar.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export interface PreprTrackingPixelProps {
  /** Prepr tracking/access token. */
  id: string;
  config?: PreprPixelConfig;
}

/** Loads Prepr's CDN tracking pixel on mount. Renders nothing. */
export function PreprTrackingPixel({ id, config }: PreprTrackingPixelProps): null {
  useEffect(() => {
    loadTrackingPixel(id, config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
