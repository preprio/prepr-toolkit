import { describe, expect, it, vi } from 'vitest';

import { createToolbarStore } from './store';

describe('createToolbarStore', () => {
  it('get() returns the initial state merged with defaults', () => {
    const store = createToolbarStore({ locale: 'nl' });
    expect(store.get()).toEqual({
      locale: 'nl',
      segments: [],
      selectedSegment: null,
      selectedVariant: null,
      editMode: false,
      previewMode: false,
      toolbarOpen: false,
      isIframe: false,
      features: { segments: true, abTesting: true, editMode: true },
    });
  });

  it('uses built-in defaults when no initial state is provided', () => {
    const store = createToolbarStore({});
    expect(store.get()).toEqual({
      locale: 'en',
      segments: [],
      selectedSegment: null,
      selectedVariant: null,
      editMode: false,
      previewMode: false,
      toolbarOpen: false,
      isIframe: false,
      features: { segments: true, abTesting: true, editMode: true },
    });
  });

  it('set() merges a partial patch into existing state', () => {
    const store = createToolbarStore({});
    store.set({ editMode: true });
    expect(store.get()).toMatchObject({ editMode: true, locale: 'en' });

    store.set({ locale: 'nl' });
    expect(store.get()).toMatchObject({ editMode: true, locale: 'nl' });
  });

  it('subscribe() notifies listeners with the new state on set()', () => {
    const store = createToolbarStore({});
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ toolbarOpen: true });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ toolbarOpen: true })
    );
  });

  it('unsubscribe stops further notifications', () => {
    const store = createToolbarStore({});
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.set({ toolbarOpen: true });

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not notify listeners when the patch is identical to current state', () => {
    const store = createToolbarStore({ editMode: true });
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ editMode: true });

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not notify when set() is called with an empty patch', () => {
    const store = createToolbarStore({});
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({});

    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies when at least one key in the patch differs', () => {
    const store = createToolbarStore({ editMode: true, locale: 'en' });
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ editMode: true, locale: 'nl' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ editMode: true, locale: 'nl' })
    );
  });

  it('supports multiple independent subscribers', () => {
    const store = createToolbarStore({});
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    store.subscribe(listenerA);
    const unsubscribeB = store.subscribe(listenerB);

    store.set({ previewMode: true });
    unsubscribeB();
    store.set({ toolbarOpen: true });

    expect(listenerA).toHaveBeenCalledTimes(2);
    expect(listenerB).toHaveBeenCalledTimes(1);
  });

  it('carries segments and selection fields from initial state', () => {
    const segments = [{ _id: 's1', name: 'Segment 1' }];
    const store = createToolbarStore({
      segments,
      selectedSegment: 's1',
      selectedVariant: 'A',
      isIframe: true,
    });

    expect(store.get()).toMatchObject({
      segments,
      selectedSegment: 's1',
      selectedVariant: 'A',
      isIframe: true,
    });
  });
});
