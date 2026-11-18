// @vitest-environment node
import {
  vercelStegaCombine,
  vercelStegaDecode,
  vercelStegaSplit,
} from '@vercel/stega';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, { value: string; options: unknown }>();
const refresh = vi.fn();
vi.mock('next/cache', () => ({ refresh }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const c = jar.get(name);
      return c ? { name, value: c.value } : undefined;
    },
    set: (name: string, value: string, options: unknown) =>
      jar.set(name, { value, options }),
  }),
  headers: async () => requestHeaders,
}));

// A preview server action call: the Prepr middleware marked the request as
// preview, and Next.js sets `Next-Action` on every action call.
const PREVIEW_ACTION = {
  'Next-Action': 'abc',
  'Prepr-Package': '@preprio/toolkit@1.0.0; framework=nextjs; preview=true',
};
let requestHeaders = new Headers(PREVIEW_ACTION);

vi.mock('next/navigation', () => ({
  unstable_rethrow: (error: unknown) => {
    if ((error as { digest?: string })?.digest === 'DYNAMIC_SERVER_USAGE') {
      throw error;
    }
  },
}));

const { syncPreprLiveLog } = await import('./live-action');
const { normalizeQuery, getPreprLiveLog, livePreviewFetch } =
  await import('./server');

const QUERY = '{ Post { _id title } }';
const data = { Post: { _id: 'p', title: 'Old' } };

describe('syncPreprLiveLog + normalizeQuery', () => {
  beforeEach(() => {
    jar.clear();
    refresh.mockClear();
    requestHeaders = new Headers(PREVIEW_ACTION);
  });

  it('hands the log to the re-render through a token cookie that expires at once', async () => {
    await syncPreprLiveLog([
      { type: 'field', itemId: 'p', field: 'title', value: 'New' },
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    const cookie = jar.get('__prepr_live')!;
    expect(cookie.value).toMatch(/^[0-9a-f]{32}$/);
    expect(cookie.options).toMatchObject({ maxAge: 0, httpOnly: true });
    const page = await normalizeQuery(QUERY, data, { enabled: true });
    expect(page.Post.title).toBe('New');
  });

  it('never applies a log unless enabled, and does not read the request then', async () => {
    await syncPreprLiveLog([
      { type: 'field', itemId: 'p', field: 'title', value: 'New' },
    ]);
    const get = vi.spyOn(Map.prototype, 'get');
    get.mockClear();
    expect(await normalizeQuery(QUERY, data)).toBe(data);
    expect(await normalizeQuery(QUERY, data, { enabled: false })).toBe(data);
    expect(get).not.toHaveBeenCalledWith('__prepr_live');
    get.mockRestore();
  });

  it('ignores a cookie that carries a log instead of an issued token', async () => {
    jar.set('__prepr_live', {
      value: JSON.stringify([
        { type: 'field', itemId: 'p', field: 'title', value: 'Forged' },
      ]),
      options: {},
    });
    expect(await getPreprLiveLog()).toEqual([]);
    expect(await normalizeQuery(QUERY, data, { enabled: true })).toBe(data);
  });

  it('does nothing on a request the middleware did not mark as preview', async () => {
    for (const pkg of [
      null,
      '@preprio/toolkit@1.0.0; framework=nextjs; preview=false',
    ]) {
      requestHeaders = new Headers({ 'Next-Action': 'abc' });
      if (pkg) requestHeaders.set('Prepr-Package', pkg);
      await syncPreprLiveLog([
        { type: 'field', itemId: 'p', field: 'title', value: 'New' },
      ]);
    }
    expect(refresh).not.toHaveBeenCalled();
    expect(jar.size).toBe(0);
  });

  it('applies a stored log only to the re-render of a server action call', async () => {
    await syncPreprLiveLog([
      { type: 'field', itemId: 'p', field: 'title', value: 'New' },
    ]);
    // The token was issued but no render read it; a plain GET replays it.
    requestHeaders = new Headers();
    expect(await normalizeQuery(QUERY, data, { enabled: true })).toBe(data);
  });

  it('does nothing for an empty or malformed log', async () => {
    await syncPreprLiveLog('nope');
    await syncPreprLiveLog([
      { type: 'field', itemId: '', field: 'x', value: 1 },
    ]);
    expect(refresh).not.toHaveBeenCalled();
    expect(jar.size).toBe(0);
  });

  it('applies nothing when there is no request to read', async () => {
    const headersModule = await import('next/headers');
    const spy = vi
      .spyOn(headersModule, 'cookies')
      .mockRejectedValueOnce(
        new Error('`cookies` was called outside a request scope'),
      );
    expect(await normalizeQuery(QUERY, data, { enabled: true })).toBe(data);
    spy.mockRestore();
  });

  it("lets Next's own control-flow errors through", async () => {
    const headersModule = await import('next/headers');
    const dynamic = Object.assign(new Error('dynamic'), {
      digest: 'DYNAMIC_SERVER_USAGE',
    });
    const spy = vi
      .spyOn(headersModule, 'cookies')
      .mockRejectedValueOnce(dynamic);
    await expect(normalizeQuery(QUERY, data, { enabled: true })).rejects.toBe(
      dynamic,
    );
    spy.mockRestore();
  });
  it('adds list entry ids to edit links in preview, with or without a log', async () => {
    const page = await normalizeQuery(
      '{ Page { _id content { _id body } } }',
      STEGA_PAGE,
      {
        enabled: true,
      },
    );
    expect(entryOf(page.Page.content[0].body)).toBe('text-1');
    expect(await normalizeQuery(QUERY, STEGA_PAGE)).toBe(STEGA_PAGE);
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

describe('livePreviewFetch', () => {
  const typing = async (value: string) => {
    requestHeaders = new Headers(PREVIEW_ACTION);
    await syncPreprLiveLog([
      { type: 'field', itemId: 'p', field: 'title', value },
    ]);
  };
  // The same visitor's request without unsaved changes: a load or a save.
  const pageLoad = () => {
    requestHeaders = new Headers(PREVIEW_ACTION);
    requestHeaders.delete('Next-Action');
  };

  beforeEach(() => {
    jar.clear();
    pageLoad();
  });

  it('reuses the last full render for unsaved changes, with the changes on top', async () => {
    const key = { query: QUERY, variables: { slug: 'reuse' } };
    const fetcher = vi.fn(async () => ({ Post: { _id: 'p', title: 'Old' } }));
    const first = await livePreviewFetch(key, fetcher, { enabled: true });

    await typing('New');
    const again = await livePreviewFetch(key, fetcher, { enabled: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(again).toBe(first);
    const page = await normalizeQuery(QUERY, again, { enabled: true });
    expect(page.Post.title).toBe('New');
    // The stored response is untouched for the next keystroke.
    expect(first.Post.title).toBe('Old');
    // A later query of the same render, after the log was taken.
    const other = { query: QUERY, variables: { slug: 'reuse-2' } };
    pageLoad();
    await livePreviewFetch(other, fetcher, { enabled: true });
    await typing('Newer');
    await normalizeQuery(QUERY, again, { enabled: true });
    await livePreviewFetch(other, fetcher, { enabled: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('fetches again on every render without unsaved changes', async () => {
    const key = { query: QUERY, variables: { slug: 'save' } };
    const fetcher = vi
      .fn<() => Promise<typeof data>>()
      .mockResolvedValueOnce({ Post: { _id: 'p', title: 'Old' } })
      .mockResolvedValueOnce({ Post: { _id: 'p', title: 'Saved' } });
    await livePreviewFetch(key, fetcher, { enabled: true });
    // A save refreshes the route: a render without a log.
    const saved = await livePreviewFetch(key, fetcher, { enabled: true });
    expect(saved.Post.title).toBe('Saved');

    await typing('Typed');
    const typed = await livePreviewFetch(key, fetcher, { enabled: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(typed).toBe(saved);
  });

  it('keeps variables, queries and Prepr headers apart', async () => {
    const fetcher = vi.fn(async () => ({ Post: { _id: 'p', title: 'Old' } }));
    const key = { query: QUERY, variables: { slug: 'apart' } };
    await livePreviewFetch(key, fetcher, { enabled: true });

    await typing('New');
    await livePreviewFetch(
      { query: QUERY, variables: { slug: 'other' } },
      fetcher,
      { enabled: true },
    );
    expect(fetcher).toHaveBeenCalledTimes(2);

    await typing('New');
    await livePreviewFetch(
      { query: { kind: 'Document' as const }, variables: key.variables },
      fetcher,
      { enabled: true },
    );
    expect(fetcher).toHaveBeenCalledTimes(3);

    await typing('New');
    requestHeaders.set('Prepr-Segments', 'vip');
    await livePreviewFetch(key, fetcher, { enabled: true });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('runs the fetcher untouched unless enabled, without reading the request', async () => {
    const key = { query: QUERY, variables: { slug: 'off' } };
    const fetcher = vi.fn(async () => data);
    await livePreviewFetch(key, fetcher, { enabled: true });
    await typing('New');
    const headersModule = await import('next/headers');
    const spy = vi.spyOn(headersModule, 'headers');
    await livePreviewFetch(key, fetcher);
    await livePreviewFetch(key, fetcher, { enabled: false });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not store a failed fetch', async () => {
    const key = { query: QUERY, variables: { slug: 'fail' } };
    await expect(
      livePreviewFetch(key, () => Promise.reject(new Error('down')), {
        enabled: true,
      }),
    ).rejects.toThrow('down');
    await typing('New');
    const fetcher = vi.fn(async () => data);
    await livePreviewFetch(key, fetcher, { enabled: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fetches again once a stored response is too old', async () => {
    vi.useFakeTimers();
    const key = { query: QUERY, variables: { slug: 'old' } };
    const fetcher = vi.fn(async () => data);
    await livePreviewFetch(key, fetcher, { enabled: true });
    vi.advanceTimersByTime(6 * 60_000);
    await typing('New');
    await livePreviewFetch(key, fetcher, { enabled: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('falls back to the fetcher for variables that cannot name a response', async () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    const fetcher = vi.fn(async () => data);
    await livePreviewFetch({ query: QUERY, variables: loop }, fetcher, {
      enabled: true,
    });
    await typing('New');
    await livePreviewFetch({ query: QUERY, variables: loop }, fetcher, {
      enabled: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
