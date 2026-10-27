import {
  vercelStegaCombine,
  vercelStegaDecode,
  vercelStegaSplit,
} from '@vercel/stega';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetForTests } from '../core/live-preview/test-reset';
import { normalizedQuery, type NormalizedQueryStore } from './live';

const QUERY = '{ Post { _id title } }';

function post(data: unknown, origin = 'https://editor.prepr.io'): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

/** Subscribes like `$store` does, keeping the latest value. */
function read<T>(store: NormalizedQueryStore<T>) {
  const seen = { value: undefined as T };
  const unsubscribe = store.subscribe((value) => {
    seen.value = value;
  });
  return { seen, unsubscribe };
}

describe('normalizedQuery', () => {
  beforeEach(() => resetForTests());
  afterEach(() => vi.unstubAllGlobals());

  it('passes data through outside the editor iframe', () => {
    const data = { Post: { _id: 'p', title: 'Old' } };
    const { seen } = read(normalizedQuery(QUERY, data, { enabled: true }));
    expect(seen.value).toBe(data);
  });

  it("shows the editor's unsaved changes while they type", async () => {
    vi.stubGlobal('top', {} as Window);
    const data = { Post: { _id: 'p', title: 'Old' } };
    const { seen, unsubscribe } = read(
      normalizedQuery(QUERY, data, { enabled: true }),
    );
    expect(seen.value.Post.title).toBe('Old');
    await vi.dynamicImportSettled();

    post({ event: 'prepr:initVE' });
    post({
      event: 'prepr:fieldChange',
      itemId: 'p',
      field: 'title',
      value: 'New',
    });
    expect(seen.value.Post.title).toBe('New');
    expect(data.Post.title).toBe('Old');

    // Data refetched after a save starts clean again.
    post({ event: 'prepr:itemChanged', itemId: 'p' });
    expect(seen.value.Post.title).toBe('Old');
    unsubscribe();
  });

  it('applies changes already typed to a store created later', async () => {
    vi.stubGlobal('top', {} as Window);
    read(normalizedQuery(QUERY, {}, { enabled: true }));
    await vi.dynamicImportSettled();
    post({ event: 'prepr:initVE' });
    post({
      event: 'prepr:fieldChange',
      itemId: 'p',
      field: 'title',
      value: 'New',
    });

    // As after client-side navigation, or `$derived` recreating the store.
    const { seen } = read(
      normalizedQuery(
        QUERY,
        { Post: { _id: 'p', title: 'Old' } },
        { enabled: true },
      ),
    );
    expect(seen.value.Post.title).toBe('New');
  });

  it('takes no changes inside an iframe unless enabled', async () => {
    vi.stubGlobal('top', {} as Window);
    const data = { Post: { _id: 'p', title: 'Old' } };
    const { seen } = read(normalizedQuery(QUERY, data));
    post({ event: 'prepr:initVE' });
    post({
      event: 'prepr:fieldChange',
      itemId: 'p',
      field: 'title',
      value: 'New',
    });
    expect(seen.value).toBe(data);
  });

  it('calls onSave when the editor saves, until unsubscribed', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('top', {} as Window);
    const onSave = vi.fn();
    const { unsubscribe } = read(
      normalizedQuery(QUERY, {}, { enabled: true, onSave }),
    );
    await vi.dynamicImportSettled();
    post({ event: 'prepr:initVE' });
    post({ event: 'prepr:itemChanged', itemId: 'p' });
    await vi.advanceTimersByTimeAsync(200);
    expect(onSave).toHaveBeenCalledTimes(1);

    unsubscribe();
    post({ event: 'prepr:itemChanged', itemId: 'p' });
    await vi.advanceTimersByTimeAsync(200);
    expect(onSave).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it('adds list entry ids to edit links when enabled, in and out of the iframe', () => {
    const { seen } = read(
      normalizedQuery(QUERY, STEGA_PAGE, { enabled: true }),
    );
    expect(entryOf(seen.value.Page.content[0].body)).toBe('text-1');
    expect(read(normalizedQuery(QUERY, STEGA_PAGE)).seen.value).toBe(
      STEGA_PAGE,
    );
  });
});

const STEGA_PAGE = {
  Page: {
    _id: 'page-1',
    content: [
      {
        _id: 'text-1',
        body: vercelStegaCombine(
          'Hi',
          {
            origin: 'prepr.io',
            href: 'https://acme.prepr.io/content/edit/page-1?locale=en-US',
          },
          false,
        ),
      },
    ],
  },
};

function entryOf(value: string): string | null {
  const { href } = vercelStegaDecode(vercelStegaSplit(value).encoded) as {
    href: string;
  };
  return new URL(href).searchParams.get('entry');
}
