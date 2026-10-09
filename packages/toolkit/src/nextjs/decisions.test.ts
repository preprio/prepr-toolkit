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

  it("stores the visitor's variant per group, asked with the forwarded visitor headers", async () => {
    const { prepr, request, response, decisionCalls } = await setup();
    const res = response();

    await prepr.resolveDecisions(request(), res, PAGE, { slug: '/' });

    expect(res.cookies.get('prepr_decisions')?.value).toBe('hero:DEVELOPERS');
    expect(res.cookies.get('prepr_decisions')?.httpOnly).toBe(false);
    expect(
      new Headers(decisionCalls()[0]![1]!.headers).get('prepr-customer-id'),
    ).toBe('visitor-1');
  });

  it('keeps groups other pages stored', async () => {
    const { prepr, request, response } = await setup();
    const res = response();

    await prepr.resolveDecisions(
      request('prepr_decisions=other:B2B~hero:X'),
      res,
      PAGE,
      { slug: '/' },
    );

    expect(res.cookies.get('prepr_decisions')?.value).toBe(
      'hero:DEVELOPERS~other:B2B',
    );
  });

  it('asks Prepr nothing per visitor on a page without segment groups, or when onlyIf says no', async () => {
    const plain = await setup({ vary: 'Authorization' });
    const res = plain.response();
    await plain.prepr.resolveDecisions(plain.request(), res, PAGE, {
      slug: '/plain',
    });
    expect(res.cookies.get('prepr_decisions')).toBeUndefined();
    expect(plain.decisionCalls()).toHaveLength(0);

    const skipped = await setup();
    await skipped.prepr.resolveDecisions(
      skipped.request(),
      skipped.response(),
      PAGE,
      { slug: '/' },
      { onlyIf: () => false },
    );
    expect(skipped.decisionCalls()).toHaveLength(0);
  });

  it('reuses the stored decision for the rest of the visit, and asks again when the context changes', async () => {
    const { prepr, request, response, decisionCalls } = await setup();
    const { NextRequest } = await import('next/server');
    const first = response();
    await prepr.resolveDecisions(request(), first, PAGE, { slug: '/' });
    const cookie = `prepr_decisions=${first.cookies.get('prepr_decisions')!.value}`;
    expect(decisionCalls()).toHaveLength(1);

    // Same visit, cookie covers the page: no request.
    await prepr.resolveDecisions(request(cookie), response(), PAGE, {
      slug: '/',
    });
    expect(decisionCalls()).toHaveLength(1);

    // UTM parameters can change the segment.
    await prepr.resolveDecisions(
      new NextRequest('https://site.test/?utm_source=ad', {
        headers: { cookie },
      }),
      response(),
      PAGE,
      { slug: '/' },
    );
    expect(decisionCalls()).toHaveLength(2);

    // So can a first visit, and reuse can be turned off.
    const fresh = response();
    fresh.headers.set(
      'x-middleware-override-headers',
      'prepr-customer-id,prepr-customer-id-created',
    );
    fresh.headers.set('x-middleware-request-prepr-customer-id-created', 'true');
    await prepr.resolveDecisions(request(cookie), fresh, PAGE, { slug: '/' });
    await prepr.resolveDecisions(
      request(cookie),
      response(),
      PAGE,
      { slug: '/' },
      { reuse: false },
    );
    expect(decisionCalls()).toHaveLength(4);
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
