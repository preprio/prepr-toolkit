// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const URL_ = 'https://graphql.prepr.io/t';

const headersMock = vi.fn(
  async () => new Headers({ 'Prepr-Segments': 'vip', Cookie: 'secret' }),
);

async function load() {
  vi.doMock('next/headers', () => ({ headers: headersMock }));
  return import('./graphql');
}

beforeEach(() => {
  vi.resetModules();
  headersMock.mockClear();
});

describe('decision requests', () => {
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
              {
                name: 'logos',
                args: [{ name: 'personalize' }],
                type: ref('Hero_Logos'),
              },
            ],
          },
          { name: 'Hero_Logos', possibleTypes: [{ name: 'Logo' }] },
          {
            name: 'Logo',
            fields: [
              { name: 'name', args: [], type: ref('String') },
              { name: '_context', args: [], type: ref('Context') },
            ],
          },
        ],
      },
    },
  };
  const PAGE =
    'query GetPage($slug: String) { Page(slug: $slug) { content { ... on Hero { heading logos { ... on Logo { name } } } } } }';
  const ctx = (variant: string) => ({
    _preprContext: {
      kind: 'PERSONALIZATION',
      group_id: 'hero',
      variant_id: variant,
    },
  });
  const decision = { data: { Page: { content: [ctx('DEVELOPERS')] } } };

  async function setup({
    answer = decision as unknown,
    onlyIf,
  }: { answer?: unknown; onlyIf?: () => boolean } = {}) {
    const { createPreprClient, createPreprProxy } = await load();
    const { NextRequest } = await import('next/server');
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const body = String(init?.body);
      if (body.includes('__schema'))
        return new Response(JSON.stringify(introspection));
      return new Response(JSON.stringify(answer));
    });
    const handle = createPreprProxy({
      client: createPreprClient({ url: URL_, fetch }),
      page: (url) => ({ document: PAGE, variables: { slug: url.pathname } }),
      onlyIf,
    });
    // The browser's decision request for a page, from the visitor's tab.
    const ask = (path = '/', cookie = '__prepr_uid=visitor-1') =>
      handle(
        new NextRequest(`https://site.test${path}`, {
          headers: { 'Prepr-Decide': '1', cookie },
        }),
      ).then((response) => response.text());
    // Every request to Prepr except the one-time schema introspection.
    const preprCalls = () =>
      fetch.mock.calls.filter(
        (call) => !String(call[1]?.body).includes('__schema'),
      );
    return { ask, preprCalls };
  }

  it("answers the visitor's variant of every group, asked with their Prepr headers", async () => {
    const { ask, preprCalls } = await setup();
    expect(await ask()).toBe('hero:DEVELOPERS');
    expect(
      new Headers(preprCalls()[0]![1]!.headers).get('prepr-customer-id'),
    ).toBe('visitor-1');
  });

  it('asks about every group on the page, nested lists and A/B tests included, in one query with no check first', async () => {
    const { ask, preprCalls } = await setup();
    await ask();
    expect(preprCalls()).toHaveLength(1);
    const body = String(preprCalls()[0]![1]!.body);
    expect(body).toContain('query GetPageDecision');
    expect(body).toContain('logos');
  });

  it('asks Prepr again for every page view', async () => {
    const { ask, preprCalls } = await setup();
    await ask();
    await ask();
    expect(preprCalls()).toHaveLength(2);
  });

  it('answers the defaults without asking Prepr when onlyIf says no', async () => {
    const { ask, preprCalls } = await setup({ onlyIf: () => false });
    expect(await ask()).toBe('*');
    expect(preprCalls()).toHaveLength(0);
  });

  it('answers the defaults when Prepr fails, and never throws', async () => {
    const { createPreprClient, createPreprProxy } = await load();
    const { NextRequest } = await import('next/server');
    const handle = createPreprProxy({
      client: createPreprClient({
        url: URL_,
        fetch: async () => new Response('down', { status: 503 }),
      }),
      page: () => ({ document: PAGE, variables: { slug: '/' } }),
    });
    const response = await handle(
      new NextRequest('https://site.test/pricing', {
        headers: { 'Prepr-Decide': '1' },
      }),
    );
    expect(await response.text()).toBe('*');
  });
});
