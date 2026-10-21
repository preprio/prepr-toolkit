import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLiveStore } from './live-store';

describe('createLiveStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const pageData = () => ({
    Page: { _id: 'page-1', content: [{ _id: 'hero-1', heading: 'Hi' }] },
  });

  it('pushPatch patches affected registrations and notifies subscribers', () => {
    const store = createLiveStore();
    const reg = store.register(pageData());
    const listener = vi.fn();
    reg.subscribe(listener);

    store.pushPatch('hero-1', 'heading', 'Hello');

    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = reg.getSnapshot() as ReturnType<typeof pageData>;
    expect(snapshot.Page.content[0].heading).toBe('Hello');
  });

  it('pushPatch does not notify registrations without the item', () => {
    const store = createLiveStore();
    const reg = store.register({ Other: { _id: 'other-1', title: 't' } });
    const listener = vi.fn();
    reg.subscribe(listener);

    store.pushPatch('hero-1', 'heading', 'Hello');

    expect(listener).not.toHaveBeenCalled();
  });

  it('invalidate refetches affected registrations (debounced) and swaps the snapshot', async () => {
    const store = createLiveStore();
    const fresh = pageData();
    fresh.Page.content[0].heading = 'Saved';
    const fetcher = vi.fn().mockResolvedValue(fresh);
    store.setFetcher(fetcher);

    const reg = store.register(pageData(), {
      query: 'query GetPage { ... }',
      variables: { slug: '/' },
    });
    const listener = vi.fn();
    reg.subscribe(listener);

    store.invalidate('hero-1');
    store.invalidate('hero-1'); // coalesced into one refetch
    expect(fetcher).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('query GetPage { ... }', {
      slug: '/',
    });
    expect(
      (reg.getSnapshot() as ReturnType<typeof pageData>).Page.content[0]
        .heading,
    ).toBe('Saved');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('invalidate skips registrations that do not contain the item or have no query', async () => {
    const store = createLiveStore();
    const fetcher = vi.fn().mockResolvedValue({});
    store.setFetcher(fetcher);
    store.register(pageData()); // no query → push-only
    store.register({ Other: { _id: 'other-1' } }, { query: 'q' });

    store.invalidate('hero-1');
    await vi.advanceTimersByTimeAsync(200);

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps the old snapshot when the fetcher rejects', async () => {
    const store = createLiveStore();
    store.setFetcher(vi.fn().mockRejectedValue(new Error('boom')));
    const reg = store.register(pageData(), { query: 'q' });

    store.invalidate('hero-1');
    await vi.advanceTimersByTimeAsync(200);

    expect(
      (reg.getSnapshot() as ReturnType<typeof pageData>).Page.content[0]
        .heading,
    ).toBe('Hi');
  });

  it('re-indexes after a refetch so subsequent pushes hit new items', async () => {
    const store = createLiveStore();
    const fresh = {
      Page: { _id: 'page-1', content: [{ _id: 'new-1', heading: 'New' }] },
    };
    store.setFetcher(vi.fn().mockResolvedValue(fresh));
    const reg = store.register(pageData(), { query: 'q' });

    store.invalidate('hero-1');
    await vi.advanceTimersByTimeAsync(200);
    store.pushPatch('new-1', 'heading', 'Newer');

    expect((reg.getSnapshot() as typeof fresh).Page.content[0].heading).toBe(
      'Newer',
    );
  });

  it('onInvalidate fires per accepted invalidate and supports unsubscribe', async () => {
    const store = createLiveStore();
    const fn = vi.fn();
    const off = store.onInvalidate(fn);

    store.invalidate('hero-1');
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledWith('hero-1');

    off();
    store.invalidate('hero-1');
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('unregister stops notifications', () => {
    const store = createLiveStore();
    const reg = store.register(pageData());
    const listener = vi.fn();
    reg.subscribe(listener);
    reg.unregister();

    store.pushPatch('hero-1', 'heading', 'Hello');

    expect(listener).not.toHaveBeenCalled();
  });

  describe('patch log', () => {
    it('records pushes oldest first, one entry per item and field', () => {
      const store = createLiveStore();
      const onLog = vi.fn();
      store.onLogChange(onLog);
      store.pushPatch('a', 'title', 'one');
      store.pushPatch('b', 'title', 'x');
      store.pushPatch('a', 'title', 'two');
      store.pushList('a', 'content', [{ _id: 'e1' }]);
      expect(store.getLog()).toEqual([
        { type: 'field', itemId: 'b', field: 'title', value: 'x' },
        { type: 'field', itemId: 'a', field: 'title', value: 'two' },
        {
          type: 'list',
          itemId: 'a',
          field: 'content',
          entries: [{ _id: 'e1' }],
        },
      ]);
      expect(onLog).toHaveBeenCalledTimes(4);
    });

    it('keeps a change by list position in order with the list changes around it', () => {
      const store = createLiveStore();
      store.pushList('a', 'content', [{ _id: 'e1' }, { _id: 'e2' }]);
      store.pushPatch('a', 'content.1.body', 'typed');
      store.pushList('a', 'content', [{ _id: 'e2' }, { _id: 'e1' }]);
      store.pushPatch('a', 'content.0.body', 'again');
      expect(store.getLog().map((p) => p.field)).toEqual([
        'content',
        'content.1.body',
        'content',
        'content.0.body',
      ]);
    });

    it('records changes for items no registration holds', () => {
      const store = createLiveStore();
      store.pushPatch('server-only', 'title', 'x');
      expect(store.getLog()).toHaveLength(1);
    });

    it('clears on save', () => {
      const store = createLiveStore();
      const onLog = vi.fn();
      store.pushPatch('a', 'title', 'x');
      store.onLogChange(onLog);
      store.invalidate('a');
      expect(store.getLog()).toEqual([]);
      expect(onLog).toHaveBeenCalledWith([]);
    });

    it('replays unsaved changes onto data registered later', () => {
      const store = createLiveStore();
      store.pushPatch('hero-1', 'heading', 'Typed');
      const reg = store.register(pageData());
      const snapshot = reg.getSnapshot() as ReturnType<typeof pageData>;
      expect(snapshot.Page.content[0].heading).toBe('Typed');
    });

    it('leaves data that already includes the changes as it is', () => {
      const store = createLiveStore();
      store.pushPatch('hero-1', 'heading', 'Hi');
      const data = pageData();
      expect(store.register(data).getSnapshot()).toBe(data);
    });
  });
});
