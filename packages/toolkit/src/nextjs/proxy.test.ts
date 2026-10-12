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
    // Each page decides its own group: the slug is in the variables.
    const slug = JSON.parse(body).variables?.slug ?? '?';
    return new Response(
      JSON.stringify({
        data: {
          Page: {
            content: [
              {
                _preprContext: {
                  kind: 'PERSONALIZATION',
                  group_id: `g${slug.replace(/\W/g, '')}`,
                  variant_id: 'VIP',
                },
              },
            ],
          },
        },
      }),
    );
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
    expect(response.cookies.get('prepr_decisions')?.value).toBe('g:VIP');
    expect(response.cookies.get('prepr_refresh')?.value).toMatch(/^\/~\d+$/);
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

  it("answers a refresh request with fresh decisions for the visitor's own pages, without rendering", async () => {
    const { handle, request, page } = await setup();

    const response = await handle(
      request('/blog', {
        'prepr-refresh': '/|//evil.com|/pricing|/missing|/not-in-cookie',
        cookie: 'prepr_refresh=/~1|/pricing~1|/missing~1',
        'sec-fetch-site': 'same-origin',
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(response.cookies.get('prepr_decisions')?.value).toBe(
      'g:VIP~gpricing:VIP',
    );
    expect(response.cookies.get('prepr_refresh')?.value).toMatch(
      /^\/~\d{5,}\|\/pricing~\d{5,}\|\/missing~1$/,
    );
    expect(page.mock.calls.map(([url]) => url.pathname)).toEqual([
      '/',
      '/pricing',
      '/missing',
    ]);
  });

  it('decides nothing for a refresh from another site, a non-GET request, or one onlyIf rejects', async () => {
    const cookie = 'prepr_refresh=/~1';
    const cross = await setup();
    const { NextRequest } = await import('next/server');
    for (const req of [
      cross.request('/', {
        'prepr-refresh': '/',
        cookie,
        'sec-fetch-site': 'cross-site',
      }),
      new NextRequest('https://site.test/', {
        method: 'POST',
        headers: { 'prepr-refresh': '/', cookie },
      }),
    ]) {
      const response = await cross.handle(req);
      expect(response.status).toBe(204);
    }
    expect(cross.decisionCalls()).toHaveLength(0);

    const bots = await setup({ onlyIf: () => false });
    await bots.handle(bots.request('/', { 'prepr-refresh': '/', cookie }));
    const page = await bots.handle(bots.request('/'));
    expect(page.cookies.get('prepr_decisions')).toBeUndefined();
    expect(bots.decisionCalls()).toHaveLength(0);
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
