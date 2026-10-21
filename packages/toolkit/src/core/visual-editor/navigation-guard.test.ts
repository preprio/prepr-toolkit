import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createVisualEditor, type VisualEditor } from './index';

function link(href: string, attrs: Record<string, string> = {}): HTMLElement {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  for (const [key, value] of Object.entries(attrs)) a.setAttribute(key, value);
  a.textContent = 'Link';
  document.body.appendChild(a);
  return a;
}

/**
 * Dispatch a click and report whether anything prevented its default. The
 * default is then prevented regardless, because happy-dom really follows a
 * link and would move every later test to another document.
 */
function click(
  el: Element,
  init: MouseEventInit = {},
): { defaultPrevented: boolean } {
  let settled: boolean | null = null;
  const settle = (e: Event): void => {
    settled = e.defaultPrevented;
    e.preventDefault();
  };
  window.addEventListener('click', settle);
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  el.dispatchEvent(event);
  window.removeEventListener('click', settle);
  // A click that stopped propagating never reached the window listener.
  return { defaultPrevented: settled ?? event.defaultPrevented };
}

function submit(form: HTMLFormElement): SubmitEvent {
  const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  return event;
}

/** Minimal Navigation API stand-in: an event target that receives `navigate`. */
class FakeNavigation extends EventTarget {}

function navigateEvent(
  url: string,
  init: Partial<{
    navigationType: string;
    sameDocument: boolean;
    hashChange: boolean;
  }> = {},
): Event {
  const event = new Event('navigate', { cancelable: true });
  Object.assign(event, {
    navigationType: init.navigationType ?? 'push',
    destination: {
      url: new URL(url, window.location.href).href,
      sameDocument: init.sameDocument ?? false,
    },
    hashChange: init.hashChange ?? false,
    downloadRequest: null,
  });
  return event;
}

describe('navigation guard', () => {
  let editor: VisualEditor;
  let onBlocked: ReturnType<typeof vi.fn<(href: string) => void>>;
  let reload: ReturnType<typeof vi.fn<() => void>>;
  let assign: ReturnType<typeof vi.fn<(url: string | URL) => void>>;
  const nativePush = history.pushState;
  const nativeReplace = history.replaceState;

  beforeEach(() => {
    window.history.replaceState(null, '', '/blog/post-1');
    reload = vi.fn<() => void>();
    assign = vi.fn<(url: string | URL) => void>();
    vi.spyOn(window.location, 'reload').mockImplementation(reload);
    vi.spyOn(window.location, 'assign').mockImplementation(assign);
    onBlocked = vi.fn<(href: string) => void>();
    editor = createVisualEditor({
      onEdit: vi.fn(),
      onNavigationBlocked: onBlocked,
    });
  });

  afterEach(() => {
    editor.stop();
    history.pushState = nativePush;
    history.replaceState = nativeReplace;
    delete (window as { navigation?: unknown }).navigation;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('when the editor did not opt in', () => {
    it('still keeps unrelated links from navigating, without reporting them', () => {
      editor.start();
      const event = click(link('/pricing'));
      expect(event.defaultPrevented).toBe(true);
      expect(onBlocked).not.toHaveBeenCalled();
    });

    it('leaves history.pushState untouched', () => {
      editor.start();
      expect(history.pushState).toBe(nativePush);
    });
  });

  describe('when on', () => {
    beforeEach(() => {
      editor.start();
      editor.setNavigationGuard(true);
    });

    it('stops a link to another page and reports its absolute URL', () => {
      const event = click(link('/pricing'));
      expect(event.defaultPrevented).toBe(true);
      expect(onBlocked).toHaveBeenCalledWith(
        new URL('/pricing', window.location.href).href,
      );
    });

    it('stops links nested in a link-like element and in a client-side router link', () => {
      const a = link('https://other.example/page');
      const span = document.createElement('span');
      a.appendChild(span);
      // A router's own click handler (registered on the page) sees the
      // prevented default and skips its navigation.
      const routerHandler = vi.fn((e: Event) => e.defaultPrevented);
      document.body.addEventListener('click', routerHandler);
      click(span);
      expect(routerHandler).toHaveReturnedWith(true);
      expect(onBlocked).toHaveBeenCalledWith('https://other.example/page');
      document.body.removeEventListener('click', routerHandler);
    });

    it('lets in-page anchors, query-only links, new-tab links, downloads and non-HTTP links through', () => {
      for (const el of [
        link('#faq'),
        link('/blog/post-1?tab=2'),
        link('/blog/post-1/'),
        link('/pricing', { target: '_blank' }),
        link('/file.pdf', { download: '' }),
        link('mailto:hi@example.com'),
        link('javascript:void(0)'),
      ]) {
        expect(click(el).defaultPrevented).toBe(false);
      }
      expect(onBlocked).not.toHaveBeenCalled();
    });

    it('lets Ctrl, Cmd and Shift clicks open a new tab or window', () => {
      const a = link('/pricing');
      expect(click(a, { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(click(a, { metaKey: true }).defaultPrevented).toBe(false);
      expect(click(a, { shiftKey: true }).defaultPrevented).toBe(false);
      expect(onBlocked).not.toHaveBeenCalled();
    });

    it('follows an Alt-clicked link, also through the Navigation API', () => {
      const navigation = new FakeNavigation();
      (window as { navigation?: unknown }).navigation = navigation;
      editor.setNavigationGuard(false);
      editor.setNavigationGuard(true);

      const a = link('/pricing');
      expect(click(a, { altKey: true }).defaultPrevented).toBe(false);
      const nav = navigateEvent('/pricing');
      navigation.dispatchEvent(nav);
      expect(nav.defaultPrevented).toBe(false);
      expect(onBlocked).not.toHaveBeenCalled();
    });

    it('does not report a click that selects a field inside a link', () => {
      const a = link('/elsewhere');
      a.setAttribute('data-prepr-encoded', '');
      a.setAttribute('data-prepr-field', 'cta');
      expect(click(a).defaultPrevented).toBe(true);
      expect(onBlocked).not.toHaveBeenCalled();
    });

    it('stops a client-side route push and reloads to restore the page', () => {
      history.pushState({}, '', '/pricing');
      expect(window.location.pathname).toBe('/blog/post-1');
      expect(onBlocked).toHaveBeenCalledWith(
        new URL('/pricing', window.location.href).href,
      );
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('lets pushes on the same page and every replaceState through', () => {
      history.pushState({}, '', '/blog/post-1?page=2');
      expect(window.location.search).toBe('?page=2');
      history.pushState({}, '', '#comments');
      history.replaceState({}, '', '/blog/post-1/');
      expect(window.location.pathname).toBe('/blog/post-1/');
      expect(onBlocked).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
    });

    it('restores history.pushState when turned off', () => {
      expect(history.pushState).not.toBe(nativePush);
      editor.setNavigationGuard(false);
      expect(history.pushState).toBe(nativePush);
    });

    it('stays a pass-through when another script wrapped it after the guard', () => {
      const guarded = history.pushState;
      const routerWrapper: History['pushState'] = function (
        this: History,
        ...args
      ) {
        return guarded.apply(this, args);
      };
      history.pushState = routerWrapper;
      editor.stop();
      expect(history.pushState).toBe(routerWrapper);
      history.pushState({}, '', '/pricing');
      expect(window.location.pathname).toBe('/pricing');
      expect(onBlocked).not.toHaveBeenCalled();
    });

    it('stops a native form submission to another page and reports its URL', () => {
      const form = document.createElement('form');
      form.action = '/search';
      form.method = 'get';
      const input = document.createElement('input');
      input.name = 'q';
      input.value = 'shoes';
      form.appendChild(input);
      document.body.appendChild(form);

      const event = submit(form);
      expect(event.defaultPrevented).toBe(true);
      expect(onBlocked).toHaveBeenCalledWith(
        new URL('/search?q=shoes', window.location.href).href,
      );
    });

    it('leaves forms the page submits itself alone', () => {
      const form = document.createElement('form');
      form.action = '/subscribe';
      form.addEventListener('submit', (e) => e.preventDefault());
      document.body.appendChild(form);
      submit(form);
      expect(onBlocked).not.toHaveBeenCalled();
    });

    it('re-submits a stopped form when the navigation is allowed', () => {
      const form = document.createElement('form');
      form.action = '/search';
      document.body.appendChild(form);
      const requestSubmit = vi
        .spyOn(form, 'requestSubmit')
        .mockImplementation(() => {});
      submit(form);
      editor.allowNavigation(onBlocked.mock.calls[0][0]);
      expect(requestSubmit).toHaveBeenCalled();
      expect(assign).not.toHaveBeenCalled();
    });

    it('stops location changes through the Navigation API', () => {
      const navigation = new FakeNavigation();
      (window as { navigation?: unknown }).navigation = navigation;
      editor.setNavigationGuard(false);
      editor.setNavigationGuard(true);

      const away = navigateEvent('/pricing', { navigationType: 'replace' });
      navigation.dispatchEvent(away);
      expect(away.defaultPrevented).toBe(true);
      expect(onBlocked).toHaveBeenCalledTimes(1);
      expect(reload).not.toHaveBeenCalled();

      for (const event of [
        navigateEvent('/pricing', { navigationType: 'traverse' }),
        navigateEvent('/pricing', { navigationType: 'reload' }),
        navigateEvent('/blog/post-1#x', { hashChange: true }),
        navigateEvent('/other', {
          navigationType: 'replace',
          sameDocument: true,
        }),
        navigateEvent('/blog/post-1?x=1'),
      ]) {
        navigation.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }
      expect(onBlocked).toHaveBeenCalledTimes(1);
    });

    it('goes to an allowed URL and lets that navigation through the guard', () => {
      const navigation = new FakeNavigation();
      (window as { navigation?: unknown }).navigation = navigation;
      editor.setNavigationGuard(false);
      editor.setNavigationGuard(true);

      editor.allowNavigation('/pricing');
      const href = new URL('/pricing', window.location.href).href;
      expect(assign).toHaveBeenCalledWith(href);
      const nav = navigateEvent('/pricing');
      navigation.dispatchEvent(nav);
      expect(nav.defaultPrevented).toBe(false);
    });

    it('refuses to follow a non-HTTP URL', () => {
      editor.allowNavigation('javascript:alert(1)');
      editor.allowNavigation('data:text/html,hi');
      expect(assign).not.toHaveBeenCalled();
    });
  });

  it('is off while the visual editor is stopped', () => {
    editor.setNavigationGuard(true);
    expect(history.pushState).toBe(nativePush);
    editor.start();
    expect(history.pushState).not.toBe(nativePush);
    editor.stop();
    expect(history.pushState).toBe(nativePush);
  });
});
