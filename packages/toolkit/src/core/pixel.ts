/**
 * Loader + typed facade for Prepr's CDN tracking pixel, so consumers don't have
 * to paste a `<script>` tag. The pixel itself lives on the CDN; this only sets
 * up the handoff.
 *
 * The CDN script expects a queue stub to already exist when it loads, so the
 * contract must be reproduced exactly:
 *   - `window.prepr` pushes `arguments` onto `.queue` until the real script
 *     lands and replaces `.process`.
 *   - `.t` must be a `Date.now()` timestamp.
 *   - The tag is inserted async, `src` cache-busted every 24h via
 *     `Math.ceil(Date.now() / cacheTime) * cacheTime`.
 */

const PIXEL_SCRIPT_URL = 'https://cdn.tracking.prepr.io/js/prepr-v2.min.js';
const CACHE_BUST_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Config accepted by the CDN pixel. */
export interface PreprPixelConfig {
  destinations?: {
    googleTagManager?: boolean;
  };
  variantImpressionThreshold?: number;
}

type PreprQueueArgs = unknown[];

// Shape of `window.prepr`, both as the local queue stub and once the real pixel takes over
// via `.process`.
interface PreprQueueFn {
  (...args: PreprQueueArgs): void;
  queue: PreprQueueArgs[];
  t: number;
  process?: (...args: PreprQueueArgs) => void;
}

declare global {
  interface Window {
    prepr?: PreprQueueFn;
  }
}

let warnedNoPixel = false;

function warnNoPixelOnce(): void {
  if (warnedNoPixel) return;
  warnedNoPixel = true;
  console.warn(
    '[Prepr] Tracking pixel is not installed. Call loadTrackingPixel() first, ' +
      'or ensure the legacy Prepr snippet is present on the page.',
  );
}

/** Test-only; not re-exported from the package entry points. */
export function __resetPixelWarningForTests(): void {
  warnedNoPixel = false;
}

/**
 * Install the queue stub, inject the pixel script, then queue
 * `('init', trackingId, config?)` and `('event', 'pageload')` in that order.
 *
 * Idempotent, and a no-op outside a browser.
 */
export function loadTrackingPixel(
  trackingId: string,
  config?: PreprPixelConfig,
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  if (window.prepr) {
    return;
  }

  const queueFn = ((...args: PreprQueueArgs) => {
    if (queueFn.process) {
      queueFn.process(...args);
    } else {
      queueFn.queue.push(args);
    }
  }) as PreprQueueFn;

  queueFn.queue = [];
  queueFn.t = Date.now();

  window.prepr = queueFn;

  const script = document.createElement('script');
  script.async = true;
  const cacheBuster =
    Math.ceil(Date.now() / CACHE_BUST_INTERVAL_MS) * CACHE_BUST_INTERVAL_MS;
  script.src = `${PIXEL_SCRIPT_URL}?t=${cacheBuster}`;

  const firstScript = document.getElementsByTagName('script')[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }

  if (config !== undefined) {
    queueFn('init', trackingId, config);
  } else {
    queueFn('init', trackingId);
  }
  queueFn('event', 'pageload');
}

/**
 * Send a tracking event through `window.prepr`. Only depends on `window.prepr`
 * existing, never on how it got installed. Warns once and returns quietly when
 * no pixel is present.
 */
export function trackEvent(
  name: string,
  data?: string | Record<string, unknown>,
): void {
  if (typeof window === 'undefined' || !window.prepr) {
    warnNoPixelOnce();
    return;
  }

  if (data !== undefined) {
    window.prepr('event', name, data);
  } else {
    window.prepr('event', name);
  }
}

/** Loader-independent like `trackEvent`; warns once if no pixel is installed. */
export function setTrackingParam(key: string, value: string): void {
  if (typeof window === 'undefined' || !window.prepr) {
    warnNoPixelOnce();
    return;
  }

  window.prepr('param', key, value);
}
