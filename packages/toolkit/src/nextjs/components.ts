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

// Same as `PREPR_DECIDE_HEADER`, which lives in server-only code.
const DECIDE_HEADER = 'Prepr-Decide';
// The proxy gives up on Prepr after its own `timeoutMs`; this only covers a
// proxy that never answers.
const DECIDE_TIMEOUT_MS = 5000;

interface PendingDecision {
  key: string;
  /** The answer, once it is in. */
  result?: string;
  value: Promise<string>;
}

/**
 * Asks the proxy which variants this visitor gets on the page at `key` (path
 * and query). Never rejects: any failure answers `*`, the default variants,
 * so a held navigation always continues.
 */
function requestDecision(key: string): PendingDecision {
  const pending: PendingDecision = { key, value: null! };
  pending.value = fetch(key, {
    headers: { [DECIDE_HEADER]: '1' },
    cache: 'no-store',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(DECIDE_TIMEOUT_MS),
  })
    .then((response) => (response.ok ? response.text() : '*'))
    .catch(() => '*')
    .then((value) => {
      pending.result = value;
      return value;
    });
  return pending;
}

// The decision request of the link being pressed: used only by the click
// that follows it, never kept for a later view.
let pressed: PendingDecision | null = null;
// The anchor whose click is replayed once its decision is in.
let replaying: Element | null = null;

/** The same-site page a pointer or click event on a link goes to. */
function linkTarget(
  event: MouseEvent,
): { anchor: Element; key: string } | null {
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
  return { anchor, key };
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const target = linkTarget(event);
  if (
    !target ||
    (pressed?.key === target.key && pressed.result === undefined)
  ) {
    return;
  }
  // Sent on press rather than on click: the visitor is still releasing the
  // button while Prepr answers.
  pressed = requestDecision(target.key);
}

function onClick(event: MouseEvent): void {
  const target = linkTarget(event);
  if (!target) return;
  if (replaying === target.anchor) {
    replaying = null;
    return;
  }
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const pending =
    pressed && pressed.key === target.key
      ? pressed
      : requestDecision(target.key);
  pressed = null;
  const record = (value: string) => {
    (
      window as unknown as { __preprDecision?: { key: string; value: string } }
    ).__preprDecision = { key: target.key, value };
  };
  if (pending.result !== undefined) {
    // The answer is in: let the link navigate as it would.
    record(pending.result);
    return;
  }
  // Hold the navigation until the answer is in, then replay the click so
  // the link (a Next.js `Link` or a plain anchor) navigates as it would.
  event.preventDefault();
  event.stopImmediatePropagation();
  void pending.value.then((value) => {
    record(value);
    replaying = target.anchor;
    (target.anchor as HTMLElement).click();
  });
}

let listeners = 0;

/** Holds clicks on same-site links until the target page's decision is in. */
function useDecisionRequests(): void {
  useEffect(() => {
    if (listeners++ === 0) {
      window.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('click', onClick, true);
    }
    return () => {
      if (--listeners === 0) {
        window.removeEventListener('pointerdown', onPointerDown, true);
        window.removeEventListener('click', onClick, true);
      }
    };
  }, []);
}

/**
 * Decides every client-side navigation to another page: when the visitor
 * presses a same-site link, it asks `createPreprProxy` which variants they
 * get on that page, and holds the click until the answer is in. The new page
 * then paints with those variants, never with the default variant first.
 * Pressing starts the request, so the wait mostly overlaps the click itself.
 *
 * Mount it once in the root layout, so links on pages without a
 * `PreprStack` are covered too. Clicks with a modifier key, links to other
 * sites and links that open a new tab or download are left alone.
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
 * `PreprStack` it is rendered by, before the page paints. A view without a
 * decision (back and forward, a navigation started from code) asks for one;
 * its personalized sections stay hidden until it arrives. Rendered by
 * `PreprStack`; you do not need it yourself.
 */
export function PreprDecisionApplier(): null {
  useDecisionRequests();
  useLayoutEffect(() => {
    if (applyPreprDecisions()) return;
    const key = location.pathname + location.search;
    let live = true;
    void requestDecision(key).value.then((value) => {
      if (live && location.pathname + location.search === key) {
        applyPreprDecisions(value);
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
