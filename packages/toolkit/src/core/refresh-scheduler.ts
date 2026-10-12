import {
  PREPR_REFRESH_COOKIE,
  PREPR_REFRESH_HEADER,
  parseRefresh,
  type PreprRefreshState,
} from './refresh';

export interface PreprRefreshScheduler {
  /** A new page view started: refresh shortly after it. */
  view(): void;
  /** Removes the listeners and timers. */
  stop(): void;
}

export interface PreprRefreshSchedulerOptions {
  /** Same as the proxy's `freshFor`: how old a decision may get. Default 10 000 ms. */
  freshFor?: number;
}

// Prepr needs a few seconds after a tracked event (the page view the pixel
// just sent) before a segment change shows in its decisions: the first
// refresh waits for that, the second catches slower processing.
const VIEW_DELAYS_MS = [3_000, 10_000];
// A link the visitor is about to follow gets a check of its own, unless the
// last decision is this recent.
const INTENT_MIN_AGE_MS = 2_000;
const INTENT_EVENTS = ['pointerover', 'focusin', 'touchstart'] as const;
const LISTENER = { capture: true, passive: true } as const;

const COOKIE_PATTERN = new RegExp(`(?:^|; )${PREPR_REFRESH_COOKIE}=([^;]*)`);

function readState(): PreprRefreshState {
  const match = document.cookie.match(COOKIE_PATTERN);
  try {
    return parseRefresh(match ? decodeURIComponent(match[1]!) : undefined);
  } catch {
    return parseRefresh(undefined);
  }
}

/**
 * Keeps the visitor's segment decisions fresh in the background, so the
 * variants above the fold of the next page are already the right ones when it
 * is opened: a short while after each page view, when the visitor points at a
 * link to a personalized page, and when the tab comes back into view.
 *
 * A refresh is one request to the current URL carrying the pages to decide;
 * the proxy answers it with new cookies and no body. It never changes what
 * the current page shows.
 */
export function createPreprRefreshScheduler(
  options: PreprRefreshSchedulerOptions = {},
): PreprRefreshScheduler {
  const freshFor = options.freshFor ?? 10_000;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let inFlight = false;

  function refresh(): void {
    if (inFlight) return;
    const { paths } = readState();
    if (paths.length === 0) return;
    inFlight = true;
    fetch(location.pathname, {
      headers: { [PREPR_REFRESH_HEADER]: paths.join('|') },
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
      });
  }

  function onIntent(event: Event): void {
    const anchor = (event.target as Element | null)?.closest?.('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    let url: URL;
    try {
      url = new URL(anchor.href, location.href);
    } catch {
      return;
    }
    if (url.origin !== location.origin) return;
    const state = readState();
    if (
      state.paths.includes(url.pathname) &&
      Date.now() - state.at > INTENT_MIN_AGE_MS
    ) {
      refresh();
    }
  }

  function onVisibility(): void {
    if (
      document.visibilityState === 'visible' &&
      Date.now() - readState().at > freshFor
    ) {
      refresh();
    }
  }

  // One delegated listener per event for the whole document, not one per link.
  for (const type of INTENT_EVENTS) {
    document.addEventListener(type, onIntent, LISTENER);
  }
  document.addEventListener('visibilitychange', onVisibility, {
    passive: true,
  });

  return {
    view() {
      timers.forEach(clearTimeout);
      timers = VIEW_DELAYS_MS.map((delay) => setTimeout(refresh, delay));
    },
    stop() {
      timers.forEach(clearTimeout);
      timers = [];
      for (const type of INTENT_EVENTS) {
        document.removeEventListener(type, onIntent, LISTENER);
      }
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
