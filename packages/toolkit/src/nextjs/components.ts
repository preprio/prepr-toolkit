'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  Suspense,
  type ReactElement,
  type ReactNode,
} from 'react';

import { createPreprPreview } from '../core/create-preview';
import { isReactHydrated } from '../react/hydration';
import {
  createPreprRefreshScheduler,
  type PreprRefreshScheduler,
} from '../core/refresh-scheduler';
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
 * Applies the visitor's A/B bucket after client-side navigation. A full page
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
  });
  return null;
}

export interface PreprPersonalizationSwitchProps {
  /**
   * Keep segment decisions fresh in the background. Default `true`. Leave it
   * on for the instance in your root layout; `PreprStack` renders its own
   * with `false`.
   */
  refresh?: boolean;
  /** Same as `createPreprProxy`'s `freshFor`. Default 10 000 ms. */
  freshFor?: number;
  /**
   * When to refresh after each page view, in ms. Default `[4000]`. Each
   * delay is one Prepr request per page view; `[3000, 10000]` also catches
   * segments Prepr takes longer to process, and `[]` refreshes only on link
   * intent and when the tab comes back into view.
   */
  refreshAfter?: readonly number[];
}

/**
 * Shows the segment variants decided in the proxy for the groups above the
 * fold, before the page paints, and keeps those decisions fresh while the
 * visitor browses: a short while after each page view, when the visitor
 * points at a link to a personalized page, and when the tab comes back.
 * Because the next page's decision is already in place when it opens, a
 * visitor who joins a segment mid-visit sees it on their next page view,
 * without anything on screen changing.
 *
 * Mount it once in the root layout. The background refreshes are answered by
 * `createPreprProxy`; with a proxy that calls `resolveDecisions` itself, the
 * first refresh gets a page back and refreshing stops for the browser
 * session. The decisions themselves come from `createPreprProxy` or
 * `resolveDecisions` in `proxy.ts`.
 *
 * @example
 * <PreprPersonalizationSwitch />
 */
// Numbers page views so that returning to a URL is a view of its own.
let viewCount = 0;

export function PreprPersonalizationSwitch({
  refresh = true,
  freshFor,
  refreshAfter,
}: PreprPersonalizationSwitchProps): ReactElement | null {
  const [scheduler, setScheduler] = useState<PreprRefreshScheduler | null>(
    null,
  );

  // A mount is a new page view, even on a URL seen before: the decision
  // stored since then applies. The preview toolbar switches variant by
  // navigating to the same page with another query, which re-renders this
  // without remounting it, so a new URL is a new view too. Other re-renders
  // leave the page alone: a decision that arrives while a page is read is for
  // the next view.
  const viewUrl = useRef<string | null>(null);
  useLayoutEffect(() => {
    const url = location.pathname + location.search;
    if (viewUrl.current === url) return;
    viewUrl.current = url;
    applyPreprDecisions(`${url}#${++viewCount}`);
  });

  // A string key: an inline `refreshAfter={[…]}` is a new array every render.
  const delays = refreshAfter?.join(',');
  useEffect(() => {
    if (!refresh) return;
    const started = createPreprRefreshScheduler({
      freshFor,
      refreshAfter: delays === undefined ? undefined : parseDelays(delays),
    });
    setScheduler(started);
    return () => {
      started.stop();
      setScheduler(null);
    };
  }, [refresh, freshFor, delays]);

  // The pathname is request data on routes whose params are only known at
  // request time, and reading it outside a Suspense boundary stops Next.js
  // from prerendering them. Only the view counter reads it, in a boundary of
  // its own that renders nothing.
  return scheduler
    ? createElement(
        Suspense,
        { fallback: null },
        createElement(ViewCounter, { scheduler }),
      )
    : null;
}

const parseDelays = (delays: string): number[] =>
  delays === '' ? [] : delays.split(',').map(Number);

function ViewCounter({
  scheduler,
}: {
  scheduler: PreprRefreshScheduler;
}): null {
  const pathname = usePathname();
  useEffect(() => {
    scheduler.view();
  }, [pathname, scheduler]);
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
    let tagged: (readonly [Element, string])[] = [];
    // Tags on the next task, not in the commit: after a client-side
    // navigation the elements are inserted in this task, and the pixel
    // watches an element (and sends its impression) once per mutation record
    // that shows it a key. Tagging now would put the insertion and the
    // attribute change in one record batch and count the impression twice.
    const timer = setTimeout(() => {
      const elements = [...(ref.current?.children ?? [])];
      const list = keys.split(' ');
      const pairs =
        elements.length === list.length
          ? elements.map((element, i) => [element, list[i]!] as const)
          : elements.slice(0, 1).map((element) => [element, list[0]!] as const);
      tagged = pairs.filter(([element, key]) => {
        if (element.hasAttribute(VARIANT_KEY_ATTRIBUTE)) return false;
        element.setAttribute(VARIANT_KEY_ATTRIBUTE, key);
        return true;
      });
    });
    return () => {
      clearTimeout(timer);
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
