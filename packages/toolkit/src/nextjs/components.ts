'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef } from 'react';

import { createPreprPreview } from '../core/create-preview';
import { applyPreprAbBucket } from './ab-switch';
import type { PreprToolbarComponentProps } from '../core/types';

// Nothing Next-specific about the pixel — it lives on the framework-free
// `@preprio/toolkit/react` entry point and is re-exported here so the
// long-standing `@preprio/toolkit/nextjs` import keeps resolving.
export {
  PreprTrackingPixel,
  type PreprTrackingPixelProps,
} from '../react/components';

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

  // The toolbar usually lives in the root layout and survives client-side
  // navigations, while the mount effect below runs once. A ref keeps
  // `currentPath` reading the *current* pathname instead of the mount-time
  // closure — without it, switching a segment after navigating sends the
  // visitor back to the page where the toolbar first mounted.
  //
  // `usePathname` rather than `window.location.pathname`: the latter includes
  // `basePath`, which `router.push` would prepend a second time.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Mount-time config: the empty dep array below means changing `options`
  // after mount has no effect.
  useEffect(() => {
    const toolbar = createPreprPreview({
      props,
      options,
      navigation: {
        navigate: (url) => router.push(url),
        currentPath: () => pathnameRef.current + window.location.search,
      },
    });

    return () => toolbar.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/**
 * Applies the visitor's A/B bucket after client-side navigation. A full page
 * load is covered by the inline script `PreprStack` renders, but React does
 * not run inline scripts that arrive with a client-side navigation; a layout
 * effect still runs before the browser paints the new page. Rendered by
 * `PreprStack`; you do not need it yourself.
 */
export function PreprAbSwitch(): null {
  useLayoutEffect(() => {
    applyPreprAbBucket();
  }, []);
  return null;
}
