// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const URL_ = 'https://graphql.prepr.io/t';
const QUERY = '{ Page { _id } }';

type NextInit = RequestInit & {
  next?: { tags?: string[]; revalidate?: number | false };
};

const headersMock = vi.fn(
  async () => new Headers({ 'Prepr-Segments': 'vip', Cookie: 'secret' }),
);

async function load() {
  vi.doMock('next/headers', () => ({ headers: headersMock }));
  return import('./graphql');
}

function fetchStub() {
  return vi.fn<typeof globalThis.fetch>(
    async () => new Response(JSON.stringify({ data: {} })),
  );
}

const sentInit = (fetch: ReturnType<typeof fetchStub>) =>
  fetch.mock.calls[0]?.[1] as NextInit;

beforeEach(() => {
  vi.resetModules();
  headersMock.mockClear();
});

describe('nextjs createPreprClient', () => {
  it('tags a headerless query for revalidateTag and leaves revalidate unset', async () => {
    const { createPreprClient } = await load();
    const fetch = fetchStub();

    await createPreprClient({ url: URL_, fetch }).query(QUERY);

    expect(sentInit(fetch).next).toEqual({ tags: ['prepr'] });
    expect(sentInit(fetch).cache).toBeUndefined();
    expect(headersMock).not.toHaveBeenCalled();
  });

  it('applies cacheTags and revalidate from the client options', async () => {
    const { createPreprClient } = await load();
    const fetch = fetchStub();

    await createPreprClient({
      url: URL_,
      fetch,
      cacheTags: ['cms'],
      revalidate: false,
    }).query(QUERY);

    expect(sentInit(fetch).next).toEqual({ tags: ['cms'], revalidate: false });
  });

  it('lets a per-query init.next override the defaults', async () => {
    const { createPreprClient } = await load();
    const fetch = fetchStub();

    await createPreprClient({ url: URL_, fetch }).query(QUERY, undefined, {
      init: { next: { tags: ['page'] } } as RequestInit & { next?: unknown },
    });

    expect(sentInit(fetch).next).toEqual({ tags: ['page'] });
  });

  it('forwards only Prepr headers with personalize and never caches', async () => {
    const { createPreprClient } = await load();
    const fetch = fetchStub();

    await createPreprClient({ url: URL_, fetch }).query(QUERY, undefined, {
      personalize: true,
    });

    const sent = new Headers(sentInit(fetch).headers);
    expect(sent.get('Prepr-Segments')).toBe('vip');
    expect(sent.get('Cookie')).toBeNull();
    expect(sentInit(fetch).cache).toBe('no-store');
    expect(sentInit(fetch).next).toBeUndefined();
  });

  // headers() is forbidden inside 'use cache'; preview must not call it, or
  // previewing a cached function throws. The no-store fetch alone makes Next
  // render dynamically, and draft mode bypasses 'use cache' entries.
  it('does not read headers() in preview, so it works inside use cache', async () => {
    const { createPreprClient } = await load();
    const fetch = fetchStub();

    await createPreprClient({ url: URL_, fetch, preview: true }).query(QUERY);

    expect(headersMock).not.toHaveBeenCalled();
    expect(sentInit(fetch).next).toBeUndefined();
    expect(sentInit(fetch).cache).toBe('no-store');
    expect(
      new Headers(sentInit(fetch).headers).get('Prepr-Segments'),
    ).toBeNull();
  });
});

describe('nextjs createPreprClient custom headers', () => {
  it('keeps tagging queries that only carry client-level headers', async () => {
    const { createPreprClient } = await load();
    const fetch = fetchStub();

    await createPreprClient({
      url: URL_,
      fetch,
      headers: { 'X-Api-Version': '2' },
    }).query(QUERY);

    expect(sentInit(fetch).next).toEqual({ tags: ['prepr'] });
    expect(new Headers(sentInit(fetch).headers).get('X-Api-Version')).toBe('2');
  });

  it('drops the cache tags when per-query headers force no-store', async () => {
    const { createPreprClient } = await load();
    const fetch = fetchStub();

    await createPreprClient({ url: URL_, fetch }).query(QUERY, undefined, {
      headers: { 'X-Trace': 'abc' },
    });

    expect(sentInit(fetch).cache).toBe('no-store');
    expect(sentInit(fetch).next).toBeUndefined();
  });
});
