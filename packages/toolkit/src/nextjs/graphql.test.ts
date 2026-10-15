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

const cacheTagMock = vi.fn();

async function load() {
  vi.doMock('next/headers', () => ({ headers: headersMock }));
  vi.doMock('next/cache', () => ({ cacheTag: cacheTagMock }));
  return import('./graphql');
}

function fetchStub() {
  return vi.fn<typeof globalThis.fetch>(
    async () => new Response(JSON.stringify({ data: {} })),
  );
}

// Answers the schema introspection with a Query { Page: Page } schema and
// every other request with `data`.
function contentAndSchema(data: unknown) {
  const schema = {
    __schema: {
      queryType: { name: 'Query' },
      types: [
        {
          name: 'Query',
          fields: [{ name: 'Page', args: [], type: { name: 'Page' } }],
        },
        {
          name: 'Page',
          fields: [{ name: '_id', args: [], type: { name: 'String' } }],
        },
      ],
    },
  };
  return vi.fn<typeof globalThis.fetch>(
    async (_, init) =>
      new Response(
        JSON.stringify({
          data: String(init?.body).includes('__schema') ? schema : data,
        }),
      ),
  );
}

const sentInit = (fetch: ReturnType<typeof fetchStub>) =>
  fetch.mock.calls[0]?.[1] as NextInit;

beforeEach(() => {
  vi.resetModules();
  headersMock.mockClear();
  cacheTagMock.mockClear();
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

  it('merges per-query init.next tags with the client tags instead of replacing them', async () => {
    const { createPreprClient } = await load();
    const fetch = fetchStub();

    await createPreprClient({ url: URL_, fetch, revalidate: 60 }).query(
      QUERY,
      undefined,
      {
        init: { next: { tags: ['page'], revalidate: 10 } } as RequestInit & {
          next?: unknown;
        },
      },
    );

    expect(sentInit(fetch).next).toEqual({
      tags: ['prepr', 'page'],
      revalidate: 10,
    });
  });

  it('with tagItems, tags the cache entry with every item and skips the Data Cache', async () => {
    const { createPreprClient } = await load();
    const fetch = contentAndSchema({
      Page: { _id: 'page', content: [{ _id: 'hero' }] },
    });

    await createPreprClient({ url: URL_, fetch, revalidate: false }).query(
      QUERY,
      undefined,
      {
        tagItems: true,
        init: { next: { tags: ['extra'] } } as RequestInit & { next?: unknown },
      },
    );

    // A Data Cache entry would hold only the 'prepr' tag and serve a stale
    // response once an item tag is revalidated.
    expect(sentInit(fetch).cache).toBe('no-store');
    expect(sentInit(fetch).next).toBeUndefined();
    expect(cacheTagMock.mock.calls).toEqual([
      ['prepr', 'extra'],
      ['prepr:page', 'prepr:hero'],
    ]);
  });

  it('with tagItems, tags a lookup that found nothing with its model', async () => {
    const { createPreprClient } = await load();
    const fetch = contentAndSchema({ Page: null });

    await createPreprClient({ url: URL_, fetch }).query(QUERY, undefined, {
      tagItems: true,
    });

    // Publishing the page later must refresh the cached "not found".
    expect(cacheTagMock.mock.calls).toEqual([
      ['prepr', 'prepr:model:page'],
      [],
    ]);
  });

  it('with tagItems, falls back to prepr:any when the schema cannot load', async () => {
    const { createPreprClient } = await load();
    const fetch = vi.fn<typeof globalThis.fetch>(async (_, init) =>
      String(init?.body).includes('__schema')
        ? new Response('down', { status: 503 })
        : new Response(JSON.stringify({ data: { Page: null } })),
    );

    await createPreprClient({ url: URL_, fetch }).query(QUERY, undefined, {
      tagItems: true,
    });

    expect(cacheTagMock.mock.calls[0]).toEqual(['prepr', 'prepr:any']);
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

describe('nextjs decide with decisions from the proxy', () => {
  const ref = (name: string) => ({ name: null, ofType: { name } });
  const schema = {
    __schema: {
      queryType: { name: 'Query' },
      types: [
        {
          name: 'Query',
          fields: [{ name: 'Page', args: [], type: ref('Page') }],
        },
        {
          name: 'Page',
          fields: [
            {
              name: 'content',
              args: [{ name: 'personalize' }],
              type: ref('Hero'),
            },
          ],
        },
        {
          name: 'Hero',
          fields: [
            { name: '_context', args: [], type: ref('Context') },
            {
              name: 'buttons',
              args: [{ name: 'personalize' }],
              type: ref('Button'),
            },
          ],
        },
        {
          name: 'Button',
          fields: [{ name: '_context', args: [], type: ref('Context') }],
        },
        { name: 'Context', fields: [] },
      ],
    },
  };
  const ctx = (group: string, variant: string) => ({
    _preprContext: {
      kind: 'PERSONALIZATION',
      group_id: group,
      variant_id: variant,
    },
  });

  async function setup(decided: string | null) {
    headersMock.mockImplementation(
      async () =>
        new Headers(decided === null ? {} : { 'x-prepr-decided': decided }),
    );
    const { createPreprClient } = await load();
    const fetch = vi.fn<typeof globalThis.fetch>(
      async (_, init) =>
        new Response(
          JSON.stringify({
            data: String(init?.body).includes('__schema')
              ? schema
              : { Page: { content: [{ buttons: [ctx('g-nested', 'N')] }] } },
          }),
        ),
    );
    const prepr = createPreprClient({ url: URL_, fetch });
    const decisionBodies = () =>
      fetch.mock.calls
        .map((call) => String(call[1]?.body))
        .filter((body) => !body.includes('__schema'));
    return { prepr, decisionBodies };
  }

  const QUERY_ = '{ Page { content { buttons { _id } } } }';

  it('asks Prepr only about nested lists and adds the proxy decisions', async () => {
    const { prepr, decisionBodies } = await setup('g-top:VIP');
    const decisions = await prepr.decide(QUERY_);
    expect(decisions).toEqual(
      new Map([
        ['g-top', ['VIP']],
        ['g-nested', ['N']],
      ]),
    );
    expect(decisionBodies()).toHaveLength(1);
    // Only the buttons' context: the top-level list is not asked about.
    expect(decisionBodies()[0]!.match(/_context/g)).toHaveLength(1);
  });

  it('sends nothing when the page has no nested groups', async () => {
    const { prepr, decisionBodies } = await setup('g-top:VIP');
    const from = { Page: { content: [ctx('g-top', 'VIP')] } };
    const decisions = await prepr.decide(QUERY_, undefined, { from });
    expect(decisions).toEqual(new Map([['g-top', ['VIP']]]));
    expect(decisionBodies()).toHaveLength(0);
  });

  it('decides the whole page itself without the proxy header', async () => {
    const { prepr, decisionBodies } = await setup(null);
    await prepr.decide(QUERY_);
    expect(decisionBodies()).toHaveLength(1);
    expect(decisionBodies()[0]!.match(/_context/g)).toHaveLength(2);
  });
});
