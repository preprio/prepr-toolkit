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
import { applyPreprDecisions, requestPreprDecision } from './decision-switch';
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

// What this tab showed on each URL: Back and Forward show a page as the
// visitor last saw it, instead of hiding its sections until Prepr answers.
const shown = new Map<string, string>();
// Set by Back and Forward until the page they open applies its decision.
let historyStep = false;
const onPopState = () => {
  historyStep = true;
};

/**
 * The decision of the view at `key`, through `requestPreprDecision`. A newer
 * decision that arrives in the background is shown when that view is still
 * open.
 */
function requestDecision(
  key: string,
  personalized = false,
): {
  result?: string;
  value: Promise<string>;
} {
  return requestPreprDecision(key, {
    personalized,
    onChange: (value) => {
      if (location.pathname + location.search !== key) return;
      applyPreprDecisions(value, { refresh: true });
      // What shows: sections in view kept their variant.
      const state = (
        window as unknown as { __preprDecision?: { value: string } }
      ).__preprDecision;
      if (state) shown.set(key, state.value);
    },
  });
}

/** The same-site page a pointer event on a link goes to. */
function linkTarget(event: PointerEvent): string | null {
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (
    (anchor.target && anchor.target !== '_self') ||
    anchor.hasAttribute('download')
  ) {
    return null;
  }
  const url = new URL(anchor.href, location.href);
  const key = url.pathname + url.search;
  if (
    url.origin !== location.origin ||
    key === location.pathname + location.search
  ) {
    return null;
  }
  return key;
}

// Hover intent: a pointer that merely crosses a link on its way elsewhere
// sends nothing.
const HOVER_DELAY_MS = 65;
let hovering: { key: string; timer: ReturnType<typeof setTimeout> } | null =
  null;

function onPointerOver(event: PointerEvent): void {
  if (event.pointerType !== 'mouse') return;
  const key = linkTarget(event);
  if (hovering?.key === key) return;
  if (hovering) clearTimeout(hovering.timer);
  hovering = key
    ? { key, timer: setTimeout(() => requestDecision(key), HOVER_DELAY_MS) }
    : null;
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const key = linkTarget(event);
  if (key) requestDecision(key);
}

let listeners = 0;

/** Asks for the target page's decision when a same-site link is pointed at. */
function useDecisionRequests(): void {
  useEffect(() => {
    if (listeners++ === 0) {
      window.addEventListener('pointerover', onPointerOver, { passive: true });
      window.addEventListener('pointerdown', onPointerDown, {
        capture: true,
        passive: true,
      });
      window.addEventListener('popstate', onPopState);
    }
    return () => {
      if (--listeners === 0) {
        window.removeEventListener('pointerover', onPointerOver);
        window.removeEventListener('pointerdown', onPointerDown, true);
        window.removeEventListener('popstate', onPopState);
      }
    };
  }, []);
}

/**
 * Gets each client-side navigation's decision in before the click: when the
 * visitor hovers over a same-site link (or presses it, on touch devices), it
 * asks `createPreprProxy` which variants they get on that page. Clicks are
 * never held: the new page paints with those variants when the answer is in,
 * and keeps its personalized sections hidden until then otherwise. Pages
 * without personalization answer with no groups and are not asked again for
 * an hour.
 *
 * Mount it once in the root layout, so links on pages without a
 * `PreprStack` are covered too. Links to other sites and links that open a
 * new tab or download are left alone.
 *
 * @example
 * <PreprPersonalizationSwitch />
 */
export function PreprPersonalizationSwitch(): null {
  useDecisionRequests();
  return null;
}

/**
 * Applies this page view's decision to the variant wrappers of the
 * `PreprStack` it is rendered by, before the page paints when the decision is
 * already in: asked for on hover, or kept from an earlier view of the page.
 * Back and Forward show the page as this tab last showed it. Any other view
 * keeps its personalized sections hidden until the decision request answers.
 * Rendered by `PreprStack`; you do not need it yourself.
 */
export function PreprDecisionApplier(): null {
  useDecisionRequests();
  useLayoutEffect(() => {
    const key = location.pathname + location.search;
    const remember = () => {
      const state = (
        window as unknown as { __preprDecision?: { value: string } }
      ).__preprDecision;
      if (state) shown.set(key, state.value);
    };
    const previous = historyStep ? shown.get(key) : undefined;
    historyStep = false;
    // Applied already: by the page load's inline script, or Back and Forward.
    if (applyPreprDecisions(previous)) {
      remember();
      return;
    }
    const pending = requestDecision(key, true);
    if (pending.result !== undefined) {
      applyPreprDecisions(pending.result);
      remember();
      return;
    }
    let live = true;
    void pending.value.then((value) => {
      if (live && location.pathname + location.search === key) {
        applyPreprDecisions(value);
        remember();
      }
    });
    return () => {
      live = false;
    };
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
  children,
}: {
  variantKeys: string[];
  children?: ReactNode;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const keys = variantKeys.join(' ');
  useLayoutEffect(() => {
    let tagged: (readonly [Element, string])[] = [];
    // Only a variant on screen is tagged: a hidden one, or the default
    // keeping its space while the decision is on its way, must not count as
    // an impression.
    const wrapper = ref.current?.closest('[data-prepr-v]');
    const shown = () => !wrapper || wrapper.hasAttribute('data-prepr-show');
    const untag = () => {
      for (const [element] of tagged)
        element.removeAttribute(VARIANT_KEY_ATTRIBUTE);
      tagged = [];
    };
    const tag = () => {
      if (!shown()) return untag();
      if (tagged.length > 0) return;
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
    };
    // Tags on the next task, not in the commit: after a client-side
    // navigation the elements are inserted in this task, and the pixel
    // watches an element (and sends its impression) once per mutation record
    // that shows it a key. Tagging now would put the insertion and the
    // attribute change in one record batch and count the impression twice.
    const timer = setTimeout(tag);
    const observer = wrapper && new MutationObserver(tag);
    observer?.observe(wrapper!, {
      attributes: true,
      attributeFilter: ['data-prepr-show'],
    });
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      untag();
    };
  }, [keys]);
  return createElement(
    'div',
    { ref, style: { display: 'contents' } },
    children,
  );
}
