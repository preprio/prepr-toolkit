import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPreprToolbar, getControllerStore } from './create-toolbar';
import type { PreprNavigationAdapter } from './create-toolbar';
import type { PreprToolbarController } from './create-toolbar';
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

function storeOf(controller: PreprToolbarController): ToolbarStore {
  const store = getControllerStore(controller);
  if (!store) throw new Error('controller has no store');
  return store;
}

describe('createPreprToolbar', () => {
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
    clearCookies();
    vi.restoreAllMocks();
  });

  it('mounts a <prepr-toolbar> element on the document body (top level)', () => {
    stubTopLevel();
    const controller = createPreprToolbar({ props: PROPS });
    expect(element()).not.toBeNull();
    controller.destroy();
  });

  it('does not mount when ?prepr_hide_bar=true is present', () => {
    stubTopLevel();
    window.history.replaceState({}, '', '/blog?prepr_hide_bar=true');
    const controller = createPreprToolbar({ props: PROPS });
    expect(element()).toBeNull();
    controller.destroy();
  });

  it('destroy() removes the element from the DOM (top level)', () => {
    stubTopLevel();
    const controller = createPreprToolbar({ props: PROPS });
    expect(element()).not.toBeNull();
    controller.destroy();
    expect(element()).toBeNull();
  });

  it('does NOT render a visible <prepr-toolbar> when inside an iframe', () => {
    // Default context is iframe (see beforeEach).
    const controller = createPreprToolbar({ props: PROPS });
    expect(element()).toBeNull();
    controller.destroy();
  });

  it('still emits the loaded postMessage on mount when in an iframe', () => {
    createPreprToolbar({ props: PROPS });
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'prepr_preview_bar', event: 'loaded' }),
      '*'
    );
    expect(element()).toBeNull();
  });

  it('emits getScrollPosition {value:0} on mount', () => {
    createPreprToolbar({ props: PROPS });
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'getScrollPosition', value: 0 }),
      '*'
    );
  });

  it('segment change navigates with prepr_preview_segment and emits segment_changed', () => {
    const nav = fakeNavigation();
    const controller = createPreprToolbar({ props: PROPS, navigation: nav });

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
      '*'
    );
    expect(document.cookie).toContain('Prepr-Segments=seg-2');
    controller.destroy();
  });

  it('variant change navigates with prepr_preview_ab and emits variant_changed', () => {
    const nav = fakeNavigation();
    const controller = createPreprToolbar({ props: PROPS, navigation: nav });

    storeOf(controller).set({ selectedVariant: 'B' });

    const url = nav.navigated[nav.navigated.length - 1];
    expect(url).toContain('prepr_preview_ab=B');
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'prepr_preview_bar',
        event: 'variant_changed',
        variant: 'B',
      }),
      '*'
    );
    expect(document.cookie).toContain('Prepr-ABtesting=B');
    controller.destroy();
  });

  it('preview-mode change sets the Prepr-Preview-Mode cookie and reloads', () => {
    const controller = createPreprToolbar({ props: PROPS });

    storeOf(controller).set({ previewMode: true });

    expect(document.cookie).toContain('Prepr-Preview-Mode=true');
    expect(reloadSpy).toHaveBeenCalled();
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'preview_mode_toggled' }),
      '*'
    );
    controller.destroy();
  });

  it('uses navigation.reload instead of window.location.reload when provided', () => {
    const softReload = vi.fn();
    const nav = { ...fakeNavigation(), reload: softReload };
    const controller = createPreprToolbar({ props: PROPS, navigation: nav });

    storeOf(controller).set({ previewMode: true });

    expect(softReload).toHaveBeenCalledTimes(1);
    expect(reloadSpy).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('turning preview mode off forces edit mode off', () => {
    const controller = createPreprToolbar({ props: PROPS });
    storeOf(controller).set({ previewMode: true, editMode: true });
    reloadSpy.mockClear();

    storeOf(controller).set({ previewMode: false });

    expect(storeOf(controller).get().editMode).toBe(false);
    controller.destroy();
  });

  it('toolbarOpen change persists the Prepr-Toolbar-Open cookie', () => {
    const controller = createPreprToolbar({ props: PROPS });
    storeOf(controller).set({ toolbarOpen: true });
    expect(document.cookie).toContain('Prepr-Toolbar-Open=true');
    controller.destroy();
  });

  it('reset clears the segment and returns the variant to A; never emits personalization_reset', () => {
    const nav = fakeNavigation();
    const controller = createPreprToolbar({ props: PROPS, navigation: nav });

    // Establish personalization, then reset the way the element does:
    // segment → null, variant → 'A'.
    storeOf(controller).set({ selectedSegment: 'seg-1', selectedVariant: 'B' });
    postMessageSpy.mockClear();
    storeOf(controller).set({ selectedSegment: null, selectedVariant: 'A' });

    // A reset is two ordinary change events...
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'segment_changed' }),
      '*'
    );
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'variant_changed', variant: 'A' }),
      '*'
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

  it('preview toggle emits exactly one preview_mode_toggled and one reload', () => {
    const controller = createPreprToolbar({ props: PROPS });
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
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(storeOf(controller).get().editMode).toBe(false);
    expect(storeOf(controller).get().toolbarOpen).toBe(false);
    controller.destroy();
  });

  it('editMode re-enable after forced-off still fires edit_mode_toggled', () => {
    const controller = createPreprToolbar({ props: PROPS });
    storeOf(controller).set({ previewMode: true });
    storeOf(controller).set({ editMode: true });
    storeOf(controller).set({ previewMode: false });
    expect(storeOf(controller).get().editMode).toBe(false);
    postMessageSpy.mockClear();

    // If `prev` went stale (still editMode: true), this diff would be skipped.
    storeOf(controller).set({ editMode: true });

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'edit_mode_toggled', editMode: true }),
      '*'
    );
    controller.destroy();
  });

  it('destroy() unsubscribes so later store writes have no side effects', () => {
    const nav = fakeNavigation();
    const controller = createPreprToolbar({ props: PROPS, navigation: nav });
    controller.destroy();

    const before = nav.navigated.length;
    storeOf(controller).set({ selectedSegment: 'seg-2' });
    expect(nav.navigated.length).toBe(before);
  });

  // --- Editor-driven activation (iframe) -----------------------------------
  const PARENT_ORIGIN = 'https://editor.prepr.io';

  function postFromParent(data: unknown, origin = PARENT_ORIGIN): void {
    window.dispatchEvent(new MessageEvent('message', { data, origin }));
  }

  it('prepr:initVE seeds preview + edit mode inside an iframe', () => {
    const controller = createPreprToolbar({ props: PROPS });
    postFromParent({ event: 'prepr:initVE' });
    const state = storeOf(controller).get();
    expect(state.previewMode).toBe(true);
    expect(state.editMode).toBe(true);
    controller.destroy();
  });

  it('prepr:initVE with editMode:false gives preview-only', () => {
    const controller = createPreprToolbar({ props: PROPS });
    postFromParent({ event: 'prepr:initVE', editMode: false });
    const state = storeOf(controller).get();
    expect(state.previewMode).toBe(true);
    expect(state.editMode).toBe(false);
    controller.destroy();
  });

});
