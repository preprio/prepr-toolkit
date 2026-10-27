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
const { normalizeQuery, getPreprLiveLog } = await import('./server');

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
