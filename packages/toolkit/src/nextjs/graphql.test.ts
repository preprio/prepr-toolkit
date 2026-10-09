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

describe('resolveDecisions', () => {
  const ref = (name: string) => ({ name: null, ofType: { name } });
  const introspection = {
    data: {
      __schema: {
        queryType: { name: 'Query' },
        types: [
          {
            name: 'Query',
            fields: [
              { name: 'Page', args: [{ name: 'slug' }], type: ref('Page') },
            ],
          },
          {
            name: 'Page',
            fields: [
              {
                name: 'content',
                args: [{ name: 'personalize' }],
                type: ref('Page_Content'),
              },
            ],
          },
          { name: 'Page_Content', possibleTypes: [{ name: 'Hero' }] },
          {
            name: 'Hero',
            fields: [
              { name: 'heading', args: [], type: ref('String') },
              { name: '_context', args: [], type: ref('Context') },
            ],
          },
        ],
      },
    },
  };
  const PAGE =
    'query GetPage($slug: String) { Page(slug: $slug) { content { ... on Hero { heading } } } }';
  const ctx = (variant: string) => ({
    _preprContext: {
      kind: 'PERSONALIZATION',
      group_id: 'hero',
      variant_id: variant,
    },
  });
  const variants = {
    data: { Page: { content: [ctx('ALL_OTHER_USERS'), ctx('DEVELOPERS')] } },
  };
  const decision = { data: { Page: { content: [ctx('DEVELOPERS')] } } };

  async function setup(answer: unknown = decision) {
    const { createPreprClient } = await load();
    const { NextRequest, NextResponse } = await import('next/server');
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const body = String(init?.body);
      const json = body.includes('__schema')
        ? introspection
        : body.includes('personalize:false')
          ? variants
          : answer;
      return new Response(JSON.stringify(json));
    });
    const prepr = createPreprClient({ url: URL_, fetch });
    const request = (cookie = '') =>
      new NextRequest('https://site.test/', {
        headers: cookie ? { cookie } : {},
      });
    // What createPreprMiddleware leaves on the response for the page render.
    const response = () => {
      const r = NextResponse.next();
      r.headers.set(
        'x-middleware-override-headers',
        'prepr-customer-id,user-agent',
      );
      r.headers.set('x-middleware-request-prepr-customer-id', 'visitor-1');
      return r;
    };
    return { prepr, fetch, request, response };
  }

  it("stores the visitor's variant per group, asked with the forwarded visitor headers", async () => {
    const { prepr, fetch, request, response } = await setup();
    const res = response();

    await prepr.resolveDecisions(request(), res, PAGE, { slug: '/' });

    expect(res.cookies.get('prepr_decisions')?.value).toBe('hero:DEVELOPERS');
    expect(res.cookies.get('prepr_decisions')?.httpOnly).toBe(false);
    const decisionCall = fetch.mock.calls.find((call) =>
      String(call[1]?.body).includes('Decision'),
    )!;
    expect(new Headers(decisionCall[1]!.headers).get('prepr-customer-id')).toBe(
      'visitor-1',
    );
  });

  it('keeps groups other pages stored, and records "none" for a group without a variant for the visitor', async () => {
    const { prepr, request, response } = await setup({
      data: { Page: { content: [] } },
    });
    const res = response();

    await prepr.resolveDecisions(
      request('prepr_decisions=other:B2B'),
      res,
      PAGE,
      { slug: '/' },
    );

    expect(res.cookies.get('prepr_decisions')?.value).toBe('hero:~other:B2B');
  });

  it('asks Prepr nothing per visitor on a page without segment groups', async () => {
    const { prepr, fetch, request, response } = await setup();
    variants.data.Page.content = [];
    const res = response();

    await prepr.resolveDecisions(request(), res, PAGE, { slug: '/plain' });

    expect(res.cookies.get('prepr_decisions')).toBeUndefined();
    expect(
      fetch.mock.calls.some((c) => String(c[1]?.body).includes('Decision')),
    ).toBe(false);
    variants.data.Page.content = [ctx('ALL_OTHER_USERS'), ctx('DEVELOPERS')];
  });

  it('never throws: a failed lookup leaves the cookie alone', async () => {
    const { createPreprClient } = await load();
    const { NextRequest, NextResponse } = await import('next/server');
    const prepr = createPreprClient({
      url: URL_,
      fetch: async () => new Response('down', { status: 503 }),
    });
    const res = NextResponse.next();

    await expect(
      prepr.resolveDecisions(new NextRequest('https://site.test/'), res, PAGE, {
        slug: '/',
      }),
    ).resolves.toBeUndefined();
    expect(res.cookies.get('prepr_decisions')).toBeUndefined();
  });
});
