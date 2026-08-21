import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPreprPreview, getControllerStore, safeEditUrl} from './create-preview';
import type { PreprNavigationAdapter } from './create-preview';
import type { PreprPreviewController } from './create-preview';
import type { ToolbarStore } from './store';
import type { PreprToolbarProps } from './types';

const PROPS: PreprToolbarProps = {
  activeSegment: null,
  activeVariant: null,
  data: [
    { _id: 'seg-1', name: 'Cat lovers' },
    { _id: 'seg-2', name: 'Dog lovers' },
  ],
};

function fakeNavigation(): PreprNavigationAdapter & { navigated: string[] } {
  const navigated: string[] = [];
  return {
    navigated,
    navigate(url: string) {
      navigated.push(url);
    },
    currentPath() {
      return '/blog';
    },
  };
}

function clearCookies(): void {
  document.cookie.split('; ').forEach(row => {
    const name = row.split('=')[0];
    if (name) document.cookie = `${name}=;max-age=0;path=/`;
  });
}

function element(): HTMLElement | null {
  return document.querySelector('prepr-toolbar');
}

/** The stylesheet the stega controller injects on start(). */
function stegaStyle(): HTMLStyleElement | null {
  return document.querySelector<HTMLStyleElement>('style[data-prepr-stega]');
}

// Must be an allowlisted editor origin — the bridge rejects the handshake
// from anything else, so events would never reach the parent.
const PARENT_ORIGIN = 'https://editor.prepr.io';

function postFromParent(data: unknown, origin = PARENT_ORIGIN): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

/**
 * Complete the editor handshake so payload events target PARENT_ORIGIN
 * instead of being dropped for want of a trusted parent.
 */
function handshake(): void {
  postFromParent({ event: 'prepr:initVE' });
}

function storeOf(controller: PreprPreviewController): ToolbarStore {
  const store = getControllerStore(controller);
  if (!store) throw new Error('controller has no store');
  return store;
}

describe('createPreprPreview', () => {
  let postMessageSpy: ReturnType<typeof vi.fn>;
  let reloadSpy: ReturnType<typeof vi.fn<() => void>>;

  // Makes isIframe true. No visible UI renders in an iframe, so tests that
  // assert on the element must not call this.
  function stubIframe(): void {
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: { postMessage: postMessageSpy },
    });
  }

  function stubTopLevel(): void {
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: window,
    });
    // Still capture postMessage sent to the (self) parent.
    vi.spyOn(window, 'postMessage').mockImplementation(
      postMessageSpy as unknown as typeof window.postMessage
    );
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    clearCookies();
    window.history.replaceState({}, '', '/blog');

    postMessageSpy = vi.fn();
    // Default to the iframe context: sendPreprEvent only posts to the parent
    // when framed, so side-effect tests must run here to observe postMessage.
    // Tests asserting on the visible element opt into stubTopLevel().
    stubIframe();

    // Stub reload/assign in place so window.location.search still reflects the
    // real URL set via replaceState.
    reloadSpy = vi.fn();
    vi.spyOn(window.location, 'reload').mockImplementation(() => reloadSpy());
    vi.spyOn(window.location, 'assign').mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = '';
    // The stega stylesheet lands in <head> and is reused if left behind, which
    // would make a later "did it start?" assertion pass vacuously.
    stegaStyle()?.remove();
    clearCookies();
    vi.restoreAllMocks();
  });

  it('mounts a <prepr-toolbar> element on the document body (top level)', () => {
    stubTopLevel();
    const controller = createPreprPreview({ props: PROPS });
    expect(element()).not.toBeNull();
    controller.destroy();
  });

  it('does not mount a visible element when ?prepr_hide_bar=true is present', () => {
    stubTopLevel();
    window.history.replaceState({}, '', '/blog?prepr_hide_bar=true');
    const controller = createPreprPreview({ props: PROPS });
    expect(element()).toBeNull();
    controller.destroy();
  });

  it('still restores the editor scroll position when ?prepr_hide_bar=true', () => {
    // The flag marks the editor's live-preview iframe, which is exactly where
    // scroll restore matters — hiding the bar must not disable the bridge.
    window.history.replaceState({}, '', '/blog?prepr_hide_bar=true');
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.useFakeTimers();

    const controller = createPreprPreview({ props: PROPS });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { event: 'prepr:initVE', scrollPosition: 640 },
        origin: 'https://editor.prepr.io',
      }),
    );
    vi.runAllTimers();

    expect(element()).toBeNull();
    expect(scrollTo).toHaveBeenCalledWith(0, 640);

    vi.useRealTimers();
    controller.destroy();
  });

  it('destroy() removes the element from the DOM (top level)', () => {
    stubTopLevel();
    const controller = createPreprPreview({ props: PROPS });
    expect(element()).not.toBeNull();
    controller.destroy();
    expect(element()).toBeNull();
  });

  it('does NOT render a visible <prepr-toolbar> when inside an iframe', () => {
    // Default context is iframe (see beforeEach).
    const controller = createPreprPreview({ props: PROPS });
    expect(element()).toBeNull();
    controller.destroy();
  });

  it('still emits the loaded postMessage on mount when in an iframe', () => {
    createPreprPreview({ props: PROPS });
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'prepr_preview_bar', event: 'loaded' }),
      '*'
    );
    expect(element()).toBeNull();
  });

  it('emits getScrollPosition {value:0} on mount', () => {
    createPreprPreview({ props: PROPS });
    // Fires before the bridge starts, so there is no trusted origin yet — it
    // broadcasts like `loaded` because the payload is a constant zero.
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'getScrollPosition', value: 0 }),
      '*'
    );
  });

  it('segment change navigates with prepr_preview_segment and emits segment_changed', () => {
    const nav = fakeNavigation();
    const controller = createPreprPreview({ props: PROPS, navigation: nav });
    handshake();

    storeOf(controller).set({ selectedSegment: 'seg-2' });

    expect(nav.navigated.length).toBeGreaterThan(0);
    const url = nav.navigated[nav.navigated.length - 1];
    expect(url).toContain('prepr_preview_segment=seg-2');
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'prepr_preview_bar',
        event: 'segment_changed',
        segment: 'seg-2',
      }),
      PARENT_ORIGIN
    );
    expect(document.cookie).toContain('Prepr-Segments=seg-2');
    controller.destroy();
  });

  it('variant change navigates with prepr_preview_ab and emits variant_changed', () => {
    const nav = fakeNavigation();
    const controller = createPreprPreview({ props: PROPS, navigation: nav });
    handshake();

    storeOf(controller).set({ selectedVariant: 'B' });

    const url = nav.navigated[nav.navigated.length - 1];
    expect(url).toContain('prepr_preview_ab=B');
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'prepr_preview_bar',
        event: 'variant_changed',
        variant: 'B',
      }),
      PARENT_ORIGIN
    );
    expect(document.cookie).toContain('Prepr-ABtesting=B');
    controller.destroy();
  });

  it('preview-mode change sets the cookie and emits the event WITHOUT reloading inside the editor iframe', () => {
    // Reloading on the initVE-driven transition is what caused the infinite
    // reload loop when the cross-site preview cookie was dropped.
    const controller = createPreprPreview({ props: PROPS });
    handshake();

    storeOf(controller).set({ previewMode: true });

    expect(document.cookie).toContain('Prepr-Preview-Mode=true');
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'preview_mode_toggled' }),
      PARENT_ORIGIN
    );
    controller.destroy();
  });

  it('preview-mode toggle strips stale preview params instead of reloading', () => {
    // A stale ?prepr_preview_segment outranks the preview cookie in the
    // middleware, so a plain reload would keep serving preview content.
    // Top-level: inside the editor iframe preview toggles never navigate.
    stubTopLevel();
    const nav = fakeNavigation();
    nav.currentPath = () =>
      '/blog?prepr_preview_segment=seg-1&prepr_preview_ab=B&foo=bar';
    document.cookie = 'Prepr-Preview-Mode=true;path=/';
    const controller = createPreprPreview({ props: PROPS, navigation: nav });

    storeOf(controller).set({ previewMode: false });

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(nav.navigated[nav.navigated.length - 1]).toBe('/blog?foo=bar');
    controller.destroy();
  });

  it('uses navigation.reload instead of window.location.reload when provided', () => {
    stubTopLevel();
    const softReload = vi.fn();
    const nav = { ...fakeNavigation(), reload: softReload };
    const controller = createPreprPreview({ props: PROPS, navigation: nav });

    storeOf(controller).set({ previewMode: true });

    expect(softReload).toHaveBeenCalledTimes(1);
    expect(reloadSpy).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('turning preview mode off forces edit mode off', () => {
    const controller = createPreprPreview({ props: PROPS });
    storeOf(controller).set({ previewMode: true, editMode: true });
    reloadSpy.mockClear();

    storeOf(controller).set({ previewMode: false });

    expect(storeOf(controller).get().editMode).toBe(false);
    controller.destroy();
  });

  it('auto-clean strips encoded text at mount even with preview mode off', async () => {
    // Stega characters only exist when the server already fetched encoded
    // content, so the clean pass must not depend on the preview cookie —
    // inside the editor iframe that cookie is dropped cross-site.
    const { vercelStegaCombine } = await import('@vercel/stega');
    const h1 = document.createElement('h1');
    h1.textContent = vercelStegaCombine('Hello world', {
      href: 'https://edit.example.com/entry/123',
      origin: 'https://cms.example.com',
    });
    document.body.appendChild(h1);

    const controller = createPreprPreview({ props: PROPS });

    expect(storeOf(controller).get().previewMode).toBe(false);
    expect(h1.textContent).toBe('Hello world');
    expect(h1.hasAttribute('data-prepr-encoded')).toBe(true);
    controller.destroy();
  });

  it('toolbarOpen change persists the Prepr-Toolbar-Open cookie', () => {
    const controller = createPreprPreview({ props: PROPS });
    storeOf(controller).set({ toolbarOpen: true });
    expect(document.cookie).toContain('Prepr-Toolbar-Open=true');
    controller.destroy();
  });

  it('reset clears the segment and returns the variant to A; never emits personalization_reset', () => {
    const nav = fakeNavigation();
    const controller = createPreprPreview({ props: PROPS, navigation: nav });
    handshake();

    // Establish personalization, then reset the way the element does:
    // segment → null, variant → 'A'.
    storeOf(controller).set({ selectedSegment: 'seg-1', selectedVariant: 'B' });
    postMessageSpy.mockClear();
    storeOf(controller).set({ selectedSegment: null, selectedVariant: 'A' });

    // A reset is two ordinary change events...
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'segment_changed' }),
      PARENT_ORIGIN
    );
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'variant_changed', variant: 'A' }),
      PARENT_ORIGIN
    );
    // ...never a dedicated personalization_reset.
    const resetCalls = postMessageSpy.mock.calls.filter(
      ([msg]) => (msg as { event?: string }).event === 'personalization_reset'
    );
    expect(resetCalls).toHaveLength(0);

    const url = nav.navigated[nav.navigated.length - 1];
    expect(url).not.toContain('prepr_preview_segment=seg');
    controller.destroy();
  });

  it('preview toggle emits exactly one preview_mode_toggled', () => {
    const controller = createPreprPreview({ props: PROPS });
    handshake();
    // Preview on + edit on + toolbar open, so turning preview off has to force
    // editMode and toolbarOpen off via the coupled write.
    storeOf(controller).set({ previewMode: true });
    storeOf(controller).set({ editMode: true, toolbarOpen: true });
    postMessageSpy.mockClear();
    reloadSpy.mockClear();

    storeOf(controller).set({ previewMode: false });

    const previewEvents = postMessageSpy.mock.calls.filter(
      ([msg]) => (msg as { event?: string }).event === 'preview_mode_toggled'
    );
    expect(previewEvents).toHaveLength(1);
    // Framed context: the reload is suppressed to avoid the initVE loop.
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(storeOf(controller).get().editMode).toBe(false);
    expect(storeOf(controller).get().toolbarOpen).toBe(false);
    controller.destroy();
  });

  it('editMode re-enable after forced-off still fires edit_mode_toggled', () => {
    const controller = createPreprPreview({ props: PROPS });
    handshake();
    storeOf(controller).set({ previewMode: true });
    storeOf(controller).set({ editMode: true });
    storeOf(controller).set({ previewMode: false });
    expect(storeOf(controller).get().editMode).toBe(false);
    postMessageSpy.mockClear();

    // If `prev` went stale (still editMode: true), this diff would be skipped.
    storeOf(controller).set({ editMode: true });

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'edit_mode_toggled', editMode: true }),
      PARENT_ORIGIN
    );
    controller.destroy();
  });

  it('destroy() unsubscribes so later store writes have no side effects', () => {
    const nav = fakeNavigation();
    const controller = createPreprPreview({ props: PROPS, navigation: nav });
    controller.destroy();

    const before = nav.navigated.length;
    storeOf(controller).set({ selectedSegment: 'seg-2' });
    expect(nav.navigated.length).toBe(before);
  });

  // --- Editor-driven activation (iframe) -----------------------------------

  it('prepr:initVE seeds preview + edit mode inside an iframe', () => {
    const controller = createPreprPreview({ props: PROPS });
    postFromParent({ event: 'prepr:initVE' });
    const state = storeOf(controller).get();
    expect(state.previewMode).toBe(true);
    expect(state.editMode).toBe(true);
    controller.destroy();
  });

  it('prepr:initVE with editMode:false gives preview-only', () => {
    const controller = createPreprPreview({ props: PROPS });
    postFromParent({ event: 'prepr:initVE', editMode: false });
    const state = storeOf(controller).get();
    expect(state.previewMode).toBe(true);
    expect(state.editMode).toBe(false);
    controller.destroy();
  });

  // --- Headless previews (ui: false) ---------------------------------------

  // Top-level throughout: in an iframe the element is skipped anyway, so these
  // would pass without `ui` doing any work.
  describe('ui: false', () => {
    it('mounts no element but keeps the machinery wired', () => {
      stubTopLevel();
      const controller = createPreprPreview({
        props: PROPS,
        options: { ui: false },
      });

      expect(element()).toBeNull();
      // The store still exists and still carries state — the thing the old
      // scroll-sync entry point structurally could not do.
      expect(storeOf(controller).get().segments.length).toBeGreaterThan(0);
      controller.destroy();
    });

    it('still runs click-to-edit — the reason headless exists', () => {
      stubTopLevel();
      const controller = createPreprPreview({
        props: PROPS,
        options: { ui: false, features: { editMode: true } },
      });

      storeOf(controller).set({ previewMode: true, editMode: true });

      // Starting the stega controller injects its stylesheet.
      expect(stegaStyle()).not.toBeNull();
      // ...and with no UI it takes the lean editor-mode path: a pointer cursor
      // and a capture-phase click, no hover overlay.
      expect(stegaStyle()!.textContent).toContain('cursor:pointer');
      controller.destroy();
    });

    it('does not run click-to-edit when editMode is disabled', () => {
      stubTopLevel();
      const controller = createPreprPreview({
        props: PROPS,
        options: { ui: false, features: { editMode: false } },
      });

      storeOf(controller).set({ previewMode: true, editMode: true });

      expect(stegaStyle()).toBeNull();
      controller.destroy();
    });

    it('restores editor scroll position with no props at all', () => {
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      vi.useFakeTimers();

      // The old createPreprScrollSync case, expressed through the one entry
      // point: no props, no UI.
      const controller = createPreprPreview({ options: { ui: false } });
      postFromParent({ event: 'prepr:initVE', scrollPosition: 420 });
      vi.runAllTimers();

      expect(scrollTo).toHaveBeenCalledWith(0, 420);
      vi.useRealTimers();
      controller.destroy();
    });

    it('honours allowedEditorOrigins, which the toolbar path could not reach', () => {
      const controller = createPreprPreview({
        options: { ui: false, allowedEditorOrigins: ['https://cms.example.com'] },
      });

      // An origin the *.prepr.io wildcard would accept is now rejected.
      postFromParent({ event: 'prepr:initVE' }, 'https://editor.prepr.io');
      expect(storeOf(controller).get().previewMode).toBe(false);

      postFromParent({ event: 'prepr:initVE' }, 'https://cms.example.com');
      expect(storeOf(controller).get().previewMode).toBe(true);
      controller.destroy();
    });
  });

  it('mounts the element by default (ui defaults to true)', () => {
    stubTopLevel();
    const controller = createPreprPreview({ props: PROPS });
    expect(element()).not.toBeNull();
    controller.destroy();
  });
});

// Guards the click-to-edit href before it reaches `window.open` or the editor
// postMessage. The value comes from stega-encoded content via a
// `data-prepr-href` DOM attribute, so it is attacker-influenceable.
describe('safeEditUrl', () => {
  it('allows http and https', () => {
    expect(safeEditUrl('https://acme.prepr.io/edit/1')).toBe(
      'https://acme.prepr.io/edit/1'
    );
    expect(safeEditUrl('http://localhost:3000/edit/1')).toBe(
      'http://localhost:3000/edit/1'
    );
  });

  it('resolves a relative href against the document', () => {
    expect(safeEditUrl('/edit/1')).toBe(`${window.location.origin}/edit/1`);
  });

  it('rejects script-bearing and non-http schemes', () => {
    expect(safeEditUrl('javascript:alert(1)')).toBeNull();
    expect(safeEditUrl('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeEditUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeEditUrl('vbscript:msgbox(1)')).toBeNull();
    expect(safeEditUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects a href that does not parse', () => {
    expect(safeEditUrl('http://')).toBeNull();
  });
});
