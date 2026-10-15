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
    vary = 'Prepr-Segments',
  } = {}) {
    const { createPreprClient } = await load();
    const { NextRequest, NextResponse } = await import('next/server');
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const body = String(init?.body);
      if (body.includes('__schema'))
        return new Response(JSON.stringify(introspection));
      if (body.includes('AbCheck')) {
        return new Response(JSON.stringify({ data: { Page: null } }), {
          headers: { vary },
        });
      }
      return new Response(JSON.stringify(answer));
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
    const decisionCalls = () =>
      fetch.mock.calls.filter((call) =>
        String(call[1]?.body).includes('Decision'),
      );
    return { prepr, request, response, decisionCalls };
  }

  it("stores this page view's decision, keyed by its URL, asked with the forwarded visitor headers", async () => {
    const { prepr, request, response, decisionCalls } = await setup();
    const res = response();

    await prepr.resolveDecisions(request(), res, PAGE, { slug: '/' });

    expect(res.cookies.get('prepr_decisions')?.value).toMatch(
      /^\d+\|\/@hero:DEVELOPERS$/,
    );
    expect(res.cookies.get('prepr_decisions')?.httpOnly).toBe(false);
    expect(
      new Headers(decisionCalls()[0]![1]!.headers).get('prepr-customer-id'),
    ).toBe('visitor-1');
  });

  it('asks about every group on the page, nested lists included, in one request', async () => {
    const { prepr, request, response, decisionCalls } = await setup();
    await prepr.resolveDecisions(request(), response(), PAGE, { slug: '/' });
    expect(decisionCalls()).toHaveLength(1);
    expect(String(decisionCalls()[0]![1]!.body)).toContain('logos');
  });

  it('asks Prepr at every page view, whatever an earlier view stored', async () => {
    const { prepr, request, response, decisionCalls } = await setup();
    await prepr.resolveDecisions(
      request('prepr_decisions=%2F%40hero%3AX'),
      response(),
      PAGE,
      { slug: '/' },
    );
    await prepr.resolveDecisions(request(), response(), PAGE, { slug: '/' });
    expect(decisionCalls()).toHaveLength(2);
  });

  it('reuses the decision for a reload of the same view within 10 seconds, and asks again after that, for another URL or with UTM parameters', async () => {
    const { prepr, request, response, decisionCalls } = await setup();
    const { NextRequest } = await import('next/server');
    const first = response();
    await prepr.resolveDecisions(request(), first, PAGE, { slug: '/' });
    const stored = first.cookies.get('prepr_decisions')!.value;
    const cookie = `prepr_decisions=${encodeURIComponent(stored)}`;

    const reload = response();
    await prepr.resolveDecisions(request(cookie), reload, PAGE, { slug: '/' });
    expect(decisionCalls()).toHaveLength(1);
    expect(reload.cookies.get('prepr_decisions')).toBeUndefined();

    const old = `prepr_decisions=${encodeURIComponent(stored.replace(/^\d+/, String(Date.now() - 11_000)))}`;
    await prepr.resolveDecisions(request(old), response(), PAGE, { slug: '/' });
    await prepr.resolveDecisions(
      new NextRequest('https://site.test/pricing', { headers: { cookie } }),
      response(),
      PAGE,
      { slug: '/pricing' },
    );
    await prepr.resolveDecisions(
      new NextRequest('https://site.test/?utm_source=ad', {
        headers: { cookie },
      }),
      response(),
      PAGE,
      { slug: '/' },
    );
    expect(decisionCalls()).toHaveLength(4);
  });

  it('asks nothing on a page without segment groups; onlyIf saying no stores the defaults', async () => {
    const plain = await setup({ vary: 'Authorization' });
    const res = plain.response();
    await plain.prepr.resolveDecisions(plain.request(), res, PAGE, {
      slug: '/plain',
    });
    expect(res.cookies.get('prepr_decisions')).toBeUndefined();
    expect(plain.decisionCalls()).toHaveLength(0);

    const skipped = await setup();
    const skippedRes = skipped.response();
    await skipped.prepr.resolveDecisions(
      skipped.request(),
      skippedRes,
      PAGE,
      { slug: '/' },
      { onlyIf: () => false },
    );
    expect(skipped.decisionCalls()).toHaveLength(0);
    expect(skippedRes.cookies.get('prepr_decisions')?.value).toMatch(
      /^\d+\|\/@\*$/,
    );
  });

  it('never throws: when Prepr fails, the page view gets the defaults', async () => {
    const { createPreprClient } = await load();
    const { NextRequest, NextResponse } = await import('next/server');
    const prepr = createPreprClient({
      url: URL_,
      fetch: async () => new Response('down', { status: 503 }),
    });
    const res = NextResponse.next();

    await expect(
      prepr.resolveDecisions(
        new NextRequest('https://site.test/pricing?utm_source=x'),
        res,
        PAGE,
        { slug: '/pricing' },
      ),
    ).resolves.toBeUndefined();
    expect(res.cookies.get('prepr_decisions')?.value).toMatch(
      /^\d+\|\/pricing\?utm_source=x@\*$/,
    );
  });
});
