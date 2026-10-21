import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

import { resetNuxtLivePreviewForTests, useNormalizedQuery } from './live';

const QUERY = '{ Post { _id title } }';

function post(data: unknown, origin = 'https://editor.prepr.io'): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

describe('useNormalizedQuery', () => {
  beforeEach(() => resetNuxtLivePreviewForTests());
  afterEach(() => vi.unstubAllGlobals());

  it('passes data through outside the editor iframe', () => {
    const data = ref({ Post: { _id: 'p', title: 'Old' } });
    const page = useNormalizedQuery(QUERY, data);
    expect(page.value).toBe(data.value);
  });

  it("shows the editor's unsaved changes while they type", async () => {
    vi.stubGlobal('top', {} as Window);
    const data = ref({ Post: { _id: 'p', title: 'Old' } });
    const scope = effectScope();
    const page = scope.run(() =>
      useNormalizedQuery(QUERY, data, { enabled: true }),
    )!;
    expect(page.value.Post.title).toBe('Old');
    await vi.dynamicImportSettled();

    post({ event: 'prepr:initVE' });
    post({
      event: 'prepr:fieldChange',
      itemId: 'p',
      field: 'title',
      value: 'New',
    });
    await nextTick();
    expect(page.value.Post.title).toBe('New');

    // Data refetched after a save starts clean again.
    post({ event: 'prepr:itemChanged', itemId: 'p' });
    await nextTick();
    expect(page.value.Post.title).toBe('Old');
    scope.stop();
  });

  it('takes no changes inside an iframe unless enabled', async () => {
    vi.stubGlobal('top', {} as Window);
    const data = ref({ Post: { _id: 'p', title: 'Old' } });
    const scope = effectScope();
    const page = scope.run(() => useNormalizedQuery(QUERY, data))!;
    post({ event: 'prepr:initVE' });
    post({
      event: 'prepr:fieldChange',
      itemId: 'p',
      field: 'title',
      value: 'New',
    });
    await nextTick();
    expect(page.value).toBe(data.value);
    scope.stop();
  });

  it('calls onSave when the editor saves', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('top', {} as Window);
    const onSave = vi.fn();
    const scope = effectScope();
    scope.run(() =>
      useNormalizedQuery(QUERY, ref({}), { enabled: true, onSave }),
    );
    await vi.dynamicImportSettled();
    post({ event: 'prepr:initVE' });
    post({ event: 'prepr:itemChanged', itemId: 'p' });
    await vi.advanceTimersByTimeAsync(200);
    expect(onSave).toHaveBeenCalledTimes(1);
    scope.stop();
    vi.useRealTimers();
  });
});
