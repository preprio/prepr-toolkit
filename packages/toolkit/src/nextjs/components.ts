'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';

import { createPreprPreview } from '../core/create-preview';
import { isReactHydrated } from '../react/hydration';
import { applyPreprAbBucket, applyPreprDecisions } from './ab-switch';
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
      isHydrated: isReactHydrated,
    });

    return () => toolbar.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/**
 * Applies the visitor's A/B bucket, and the segment variants decided in the
 * proxy, after client-side navigation. A full page
 * load is covered by the inline script `PreprStack` renders, but React does
 * not run inline scripts that arrive with a client-side navigation; a layout
 * effect still runs before the browser paints the new page. Rendered by
 * `PreprStack`; you do not need it yourself.
 */
export function PreprAbSwitch(): null {
  // No dependency list: a navigation to the same route (the preview toolbar
  // switching variant) re-renders this without remounting it, and the bucket
  // cookie may have changed with it. Re-applying an unchanged bucket returns
  // early.
  useLayoutEffect(() => {
    applyPreprAbBucket();
    applyPreprDecisions();
  });
  return null;
}

const VARIANT_KEY_ATTRIBUTE = 'data-prepr-variant-key';

/**
 * Wraps one rendered variant and, once hydrated, puts the variant keys on the
 * elements inside, where Prepr's tracking pixel counts impressions and the
 * clicks of any `data-prepr-variant-event` element in them. The wrapper itself
 * takes no box (`display: contents`), and the pixel only counts an element it
 * can see scroll into view, so the keys belong on the sections. The pixel
 * watches for attributes added after load.
 *
 * A variant can hold several items, each with its own key. When the wrapper
 * holds one element per key they are paired in order; otherwise only the
 * first element is tagged, with the first key. An element that already
 * carries a variant key is left alone. Rendered by `PreprStack` with
 * `trackVariants`; you do not need it yourself.
 */
export function PreprVariantTracking({
  variantKeys,
  ab,
  children,
}: {
  variantKeys: string[];
  /** The A/B bucket wrapper this also serves as; its CSS decides `display`. */
  ab?: string;
  children?: ReactNode;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const keys = variantKeys.join(' ');
  useLayoutEffect(() => {
    const elements = [...(ref.current?.children ?? [])];
    const list = keys.split(' ');
    const pairs =
      elements.length === list.length
        ? elements.map((element, i) => [element, list[i]!] as const)
        : elements.slice(0, 1).map((element) => [element, list[0]!] as const);
    const tagged = pairs.filter(([element, key]) => {
      if (element.hasAttribute(VARIANT_KEY_ATTRIBUTE)) return false;
      element.setAttribute(VARIANT_KEY_ATTRIBUTE, key);
      return true;
    });
    return () => {
      for (const [element] of tagged) {
        element.removeAttribute(VARIANT_KEY_ATTRIBUTE);
      }
    };
  }, [keys]);
  return createElement(
    'div',
    ab === undefined
      ? { ref, style: { display: 'contents' } }
      : { ref, 'data-prepr-ab': ab },
    children,
  );
}
