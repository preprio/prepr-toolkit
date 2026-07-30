'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { createPreprToolbar } from '../core/create-toolbar';
import { loadTrackingPixel } from '../core/pixel';
import type { PreprPixelConfig } from '../core/pixel';
import type { PreprToolbarProps } from '../core/types';

/**
 * Mounts the Prepr toolbar and wires it to the Next.js router so segment/variant
 * switches navigate. Renders nothing — the toolbar UI is a custom element that
 * `createPreprToolbar` mounts imperatively.
 */
export function PreprToolbar(props: PreprToolbarProps): null {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const toolbar = createPreprToolbar({
      props,
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
