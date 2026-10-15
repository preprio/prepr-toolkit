// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const URL_ = 'https://graphql.prepr.io/t';

beforeEach(() => {
  vi.resetModules();
});

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

async function setup({
  preview = false,
  onlyIf,
}: { preview?: boolean; onlyIf?: () => boolean } = {}) {
  vi.doMock('next/headers', () => ({ headers: async () => new Headers() }));
  const { createPreprClient, createPreprProxy } = await import('./graphql');
  const { NextRequest } = await import('next/server');
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    const body = String(init?.body);
    if (body.includes('__schema'))
      return new Response(JSON.stringify(introspection));
    if (body.includes('AbCheck')) {
      return new Response(JSON.stringify({ data: { Page: null } }), {
        headers: { vary: 'Prepr-Segments' },
      });
    }
    // Each page decides its own group: the slug is in the variables. A
    // batch prefixes each page's variables and root fields with p<index>_.
    const page = (slug: string) => ({
      content: [
        {
          _preprContext: {
            kind: 'PERSONALIZATION',
            group_id: `g${slug.replace(/\W/g, '')}`,
            variant_id: 'VIP',
          },
        },
      ],
    });
    const variables: Record<string, string> = JSON.parse(body).variables ?? {};
    const batched = Object.keys(variables).filter((key) => /^p\d+_/.test(key));
    const data = batched.length
      ? Object.fromEntries(
          batched.map((key) => [
            `${key.split('_')[0]}_Page`,
            page(variables[key]!),
          ]),
        )
      : { Page: page(variables.slug ?? '?') };
    return new Response(JSON.stringify({ data }));
  });
  const prepr = createPreprClient({ url: URL_, fetch });
  const page = vi.fn((url: URL) =>
    url.pathname === '/missing'
      ? null
      : { document: PAGE, variables: { slug: url.pathname } },
  );
  const handle = createPreprProxy({ client: prepr, page, preview, onlyIf });
  const request = (path: string, headers: Record<string, string> = {}) =>
    new NextRequest(`https://site.test${path}`, { headers });
  const decisionCalls = () =>
    fetch.mock.calls.filter((call) =>
      String(call[1]?.body).includes('Decision'),
    );
  return { handle, request, page, decisionCalls };
}

describe('createPreprProxy', () => {
  it("decides the page's segment groups and lets the request through", async () => {
    const { handle, request } = await setup();

    const response = await handle(request('/'));

    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.cookies.get('prepr_decisions')?.value).toMatch(
      /^\d+\|\/@g:VIP$/,
    );
    expect(response.cookies.get('__prepr_uid')?.value).toBeTruthy();
  });

  it('asks Prepr nothing for form posts and server actions, which never render a page view', async () => {
    const { handle, page, decisionCalls } = await setup();
    const { NextRequest } = await import('next/server');

    const response = await handle(
      new NextRequest('https://site.test/', {
        method: 'POST',
        headers: { 'next-action': 'abc' },
      }),
    );

    // The visitor headers still reach the action.
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.cookies.get('prepr_decisions')).toBeUndefined();
    expect(page).not.toHaveBeenCalled();
    expect(decisionCalls()).toHaveLength(0);
  });

  it('asks Prepr nothing for pages the lookup does not know, API routes or files', async () => {
    const { handle, request, page, decisionCalls } = await setup();

    await handle(request('/missing'));
    await handle(request('/api/contact'));
    await handle(request('/logo.png'));

    expect(page.mock.calls.map(([u]) => u.pathname)).toEqual(['/missing']);
    expect(decisionCalls()).toHaveLength(0);
  });

  it('decides each page view, reusing only a reload of the same view', async () => {
    const { handle, request, decisionCalls } = await setup();
    const first = await handle(request('/'));
    // The browser sends back everything the first response set.
    const cookie = first.cookies
      .getAll()
      .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
      .join('; ');
    await handle(request('/', { cookie }));
    expect(decisionCalls()).toHaveLength(1);
    await handle(request('/pricing', { cookie }));
    expect(decisionCalls()).toHaveLength(2);
  });

  it('never decides a prefetch or client-side navigation, whose answer the router would reuse', async () => {
    const { handle, request, decisionCalls } = await setup();
    for (const headers of <Record<string, string>[]>[
      { rsc: '1' },
      { rsc: '1', 'next-router-prefetch': '1' },
      // What reaches the proxy: Next.js strips its RSC headers first.
      { 'next-url': '/solutions/developers' },
      { 'sec-fetch-dest': 'empty' },
    ]) {
      const response = await handle(request('/pricing', headers));
      expect(response.cookies.get('prepr_decisions')).toBeUndefined();
    }
    expect(decisionCalls()).toHaveLength(0);
  });

  it("answers a click's decision request with the target page's decisions, without rendering", async () => {
    const { handle, request, decisionCalls } = await setup();

    const response = await handle(
      request('/pricing', {
        'Prepr-Decide': '1',
        'sec-fetch-site': 'same-origin',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toBe('gpricing:VIP');
    // Used for that click only: nothing is stored for a later view.
    expect(response.cookies.get('prepr_decisions')).toBeUndefined();
    expect(response.cookies.get('__prepr_uid')?.value).toBeTruthy();
    expect(decisionCalls()).toHaveLength(1);
  });

  it('answers the defaults to a decision request from another site, a non-GET request, or one onlyIf rejects', async () => {
    const { NextRequest } = await import('next/server');
    const asked = [
      (await setup()).handle(
        new NextRequest('https://site.test/pricing', {
          headers: { 'Prepr-Decide': '1', 'sec-fetch-site': 'cross-site' },
        }),
      ),
      (await setup()).handle(
        new NextRequest('https://site.test/pricing', {
          method: 'POST',
          headers: { 'Prepr-Decide': '1' },
        }),
      ),
      (await setup({ onlyIf: () => false })).handle(
        new NextRequest('https://site.test/pricing', {
          headers: { 'Prepr-Decide': '1' },
        }),
      ),
    ];
    for (const response of await Promise.all(asked)) {
      expect(await response.text()).toBe('*');
    }
  });

  it('sends a preview visitor without draft mode through the draft route first', async () => {
    const { handle, request } = await setup({ preview: true });

    const response = await handle(request('/pricing'));

    expect(response.headers.get('location')).toBe(
      'https://site.test/api/prepr/draft?to=%2Fpricing',
    );
  });

  it('rejects a client that did not come from createPreprClient', async () => {
    const { createPreprProxy } = await import('./graphql');
    expect(() =>
      createPreprProxy({
        client: {} as never,
        page: () => null,
      }),
    ).toThrow(/createPreprClient/);
  });
});
