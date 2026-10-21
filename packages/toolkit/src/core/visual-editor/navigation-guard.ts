import { createScopedLogger } from '../utils';

const debug = createScopedLogger('navigation-guard');

/**
 * The parts of the Navigation API the guard reads. Typed structurally because
 * not every supported TypeScript `lib.dom` declares it, and not every browser
 * ships it.
 */
interface NavigateEventLike extends Event {
  readonly navigationType: 'push' | 'replace' | 'reload' | 'traverse';
  readonly destination: {
    readonly url: string;
    readonly sameDocument: boolean;
  };
  readonly hashChange: boolean;
  readonly downloadRequest: string | null;
}

interface NavigationLike {
  addEventListener(type: 'navigate', listener: (e: Event) => void): void;
  removeEventListener(type: 'navigate', listener: (e: Event) => void): void;
}

type Submitter = HTMLButtonElement | HTMLInputElement;

export interface NavigationGuardOptions {
  /** Called with the absolute URL of every navigation the guard stopped. */
  onBlocked: (href: string) => void;
}

export interface NavigationGuard {
  start(): void;
  stop(): void;
  /** Whether the guard is listening. */
  isActive(): boolean;
  /** Report a link click the caller already kept from navigating. */
  block(href: string): void;
  /** Let one navigation to `href` through, such as an Alt-clicked link. */
  permit(href: string): void;
  /**
   * Go to `href` after all: re-submits the form whose submission was
   * stopped, or loads the URL in this frame. Ignores anything but an
   * `http(s)` URL.
   */
  allow(href: string): void;
}

const trimSlash = (path: string): string =>
  path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

function resolve(url: string | URL): URL | null {
  try {
    return new URL(url, document.baseURI);
  } catch {
    return null;
  }
}

/**
 * Whether going to `url` loads a different page in this frame. The page is
 * its origin and path: query and hash changes (filters, pagination, the
 * toolbar's segment switch) keep the same content on screen. Non-HTTP
 * schemes (`mailto:`, `tel:`, `javascript:`) never replace the page.
 */
export function leavesPage(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const here = window.location;
  return (
    url.origin !== here.origin ||
    trimSlash(url.pathname) !== trimSlash(here.pathname)
  );
}

/**
 * The URL a click on `target` would load in this frame, or null when it
 * stays on the page. In-page anchors, new-tab links and downloads are null.
 */
export function leavingLinkHref(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const link = target.closest('a[href]');
  if (!link || link.hasAttribute('download')) return null;
  const linkTarget = link.getAttribute('target');
  if (linkTarget && linkTarget !== '_self') return null;
  const href = link.getAttribute('href') ?? '';
  if (href.startsWith('#')) return null;
  const url = resolve(href);
  return url && leavesPage(url) ? url.href : null;
}

function submitterAttr(
  submitter: Submitter | null,
  attr: 'formaction' | 'formmethod' | 'formtarget',
): string | null {
  if (!submitter?.hasAttribute(attr)) return null;
  if (attr === 'formaction') return submitter.formAction;
  if (attr === 'formmethod') return submitter.formMethod;
  return submitter.formTarget;
}

/** The URL a native submission of `form` loads, or null for none. */
function submissionUrl(
  form: HTMLFormElement,
  submitter: Submitter | null,
): URL | null {
  const method = (
    submitterAttr(submitter, 'formmethod') ?? form.method
  ).toLowerCase();
  if (method === 'dialog') return null;
  const target = submitterAttr(submitter, 'formtarget') ?? form.target;
  if (target && target !== '_self') return null;
  const url = resolve(
    submitterAttr(submitter, 'formaction') ?? (form.action || location.href),
  );
  if (!url) return null;
  if (method === 'get') {
    let data: FormData;
    try {
      data = new FormData(form, submitter);
    } catch {
      data = new FormData(form);
    }
    const query = new URLSearchParams();
    data.forEach((value, key) => {
      query.append(key, typeof value === 'string' ? value : value.name);
    });
    url.search = query.toString();
  }
  return url;
}

/**
 * Keeps a framed page from moving to another page and reports each attempt,
 * so the framing editor can ask before the page being edited is left.
 *
 * Link clicks are stopped by the caller's capture-phase click handler, before
 * a client-side router sees them (routers skip a click whose default is
 * already prevented). On top of that the guard catches:
 *
 * - `history.pushState` to another path: client-side routers such as the
 *   Next.js App Router render the new route before they push its URL, so the
 *   page is reloaded at its own URL to put the edited page back on screen.
 *   `replaceState` is left alone: routers call it on start-up to normalise
 *   the URL, and blocking that would reload in a loop.
 * - Native form submissions no page script handled.
 * - `location` assignments, through the Navigation API where the browser
 *   has it.
 *
 * Back/forward is not guarded: the frame shares its history with the
 * framing page, and traversals cannot be cancelled.
 */
export function createNavigationGuard(
  opts: NavigationGuardOptions,
): NavigationGuard {
  let active = false;
  let permitted: string | null = null;
  let pendingForm: {
    form: HTMLFormElement;
    submitter: Submitter | null;
    href: string;
  } | null = null;
  let originalPush: History['pushState'] | null = null;
  let guardedPush: History['pushState'] | null = null;

  const isPermitted = (url: URL): boolean => permitted === url.href;

  const report = (href: string): void => {
    debug.log('blocked navigation to', href);
    opts.onBlocked(href);
  };

  // Window, bubble phase: runs after every handler of the page itself, so a
  // form a script submits (`preventDefault` plus fetch) is never touched.
  const onSubmit = (e: Event): void => {
    if (e.defaultPrevented || !(e.target instanceof HTMLFormElement)) return;
    const submitter = ((e as SubmitEvent).submitter ??
      null) as Submitter | null;
    const url = submissionUrl(e.target, submitter);
    if (!url || !leavesPage(url) || isPermitted(url)) return;
    e.preventDefault();
    pendingForm = { form: e.target, submitter, href: url.href };
    report(url.href);
  };

  const onNavigate = (event: Event): void => {
    const e = event as NavigateEventLike;
    if (e.navigationType === 'traverse' || e.navigationType === 'reload') {
      return;
    }
    if (!e.cancelable || e.hashChange || e.downloadRequest !== null) return;
    // Same-document replaces are a router normalising the URL.
    if (e.navigationType === 'replace' && e.destination.sameDocument) return;
    const url = resolve(e.destination.url);
    if (!url || !leavesPage(url) || isPermitted(url)) return;
    e.preventDefault();
    report(url.href);
    if (e.destination.sameDocument) window.location.reload();
  };

  const navigation = (): NavigationLike | undefined =>
    (window as Window & { navigation?: NavigationLike }).navigation;

  function installPushGuard(): void {
    const original = history.pushState;
    const guard: History['pushState'] = function (
      this: History,
      data,
      unused,
      url,
    ) {
      if (active && guardedPush === guard && url != null) {
        const target = resolve(url);
        if (target && leavesPage(target) && !isPermitted(target)) {
          report(target.href);
          // The route is already rendered by the time it is pushed; only a
          // reload restores the page that is being edited.
          window.location.reload();
          return;
        }
      }
      return original.call(this, data, unused, url);
    };
    originalPush = original;
    guardedPush = guard;
    history.pushState = guard;
  }

  function uninstallPushGuard(): void {
    // Another script (a router) may have wrapped the guard since; removing
    // it then would drop that wrapper too, so it stays as a pass-through.
    if (history.pushState === guardedPush && originalPush) {
      history.pushState = originalPush;
    }
    originalPush = null;
    guardedPush = null;
  }

  return {
    start(): void {
      if (active) return;
      active = true;
      installPushGuard();
      window.addEventListener('submit', onSubmit);
      navigation()?.addEventListener('navigate', onNavigate);
    },
    stop(): void {
      if (!active) return;
      active = false;
      uninstallPushGuard();
      window.removeEventListener('submit', onSubmit);
      navigation()?.removeEventListener('navigate', onNavigate);
      pendingForm = null;
    },
    isActive: () => active,
    block(href: string): void {
      report(href);
    },
    permit(href: string): void {
      permitted = resolve(href)?.href ?? null;
    },
    allow(href: string): void {
      const url = resolve(href);
      if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
        debug.warn('ignored navigation to unsupported URL');
        return;
      }
      permitted = url.href;
      const form = pendingForm;
      pendingForm = null;
      if (form && form.href === url.href && form.form.isConnected) {
        try {
          form.form.requestSubmit(form.submitter ?? undefined);
        } catch {
          // The submitter left the form in the meantime.
          form.form.requestSubmit();
        }
        return;
      }
      window.location.assign(url.href);
    },
  };
}
