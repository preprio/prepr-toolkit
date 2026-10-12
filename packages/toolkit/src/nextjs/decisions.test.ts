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

  async function decidedCookies(
    prepr: Awaited<ReturnType<typeof setup>>['prepr'],
    request: Awaited<ReturnType<typeof setup>>['request'],
    response: Awaited<ReturnType<typeof setup>>['response'],
  ) {
    const first = response();
    await prepr.resolveDecisions(request(), first, PAGE, { slug: '/' });
    return ['prepr_decisions', 'prepr_refresh']
      .map((name) => `${name}=${first.cookies.get(name)!.value}`)
      .join('; ');
  }

  it('keeps a fresh decision that covers the page, for full loads, navigations and prefetches alike', async () => {
    const { prepr, request, response, decisionCalls } = await setup();
    const { NextRequest } = await import('next/server');
    const cookie = await decidedCookies(prepr, request, response);
    expect(decisionCalls()).toHaveLength(1);

    for (const headers of <Record<string, string>[]>[
      { cookie },
      { cookie, rsc: '1' },
      { cookie, rsc: '1', 'next-router-prefetch': '1' },
    ]) {
      await prepr.resolveDecisions(
        new NextRequest('https://site.test/', { headers }),
        response(),
        PAGE,
        { slug: '/' },
      );
    }
    expect(decisionCalls()).toHaveLength(1);
  });

  it('asks again once the decision is older than freshFor', async () => {
    const { prepr, request, response, decisionCalls } = await setup();
    const { NextRequest } = await import('next/server');
    const cookie = await decidedCookies(prepr, request, response);
    const stale = cookie.replace(/prepr_refresh=\/~\d+/, 'prepr_refresh=/~1');

    await prepr.resolveDecisions(
      new NextRequest('https://site.test/', {
        headers: { cookie: stale, 'next-router-prefetch': '1', rsc: '1' },
      }),
      response(),
      PAGE,
      { slug: '/' },
    );
    expect(decisionCalls()).toHaveLength(2);

    await prepr.resolveDecisions(
      request(cookie),
      response(),
      PAGE,
      { slug: '/' },
      { freshFor: 0 },
    );
    expect(decisionCalls()).toHaveLength(3);
  });

  it('always asks for a first visit or UTM parameters, however fresh the decision', async () => {
    const { prepr, request, response, decisionCalls } = await setup();
    const { NextRequest } = await import('next/server');
    const cookie = await decidedCookies(prepr, request, response);

    await prepr.resolveDecisions(
      new NextRequest('https://site.test/?utm_source=ad', {
        headers: { cookie },
      }),
      response(),
      PAGE,
      { slug: '/' },
    );
    const firstVisit = response();
    firstVisit.headers.set(
      'x-middleware-override-headers',
      'prepr-customer-id,prepr-customer-id-created',
    );
    firstVisit.headers.set(
      'x-middleware-request-prepr-customer-id-created',
      'true',
    );
    await prepr.resolveDecisions(request(cookie), firstVisit, PAGE, {
      slug: '/',
    });
    expect(decisionCalls()).toHaveLength(3);
  });

  it('records a decision time per page, most recent first', async () => {
    const { prepr, response } = await setup();
    const { NextRequest } = await import('next/server');
    const res = response();
    const before = Date.now();

    await prepr.resolveDecisions(
      new NextRequest('https://site.test/pricing', {
        headers: { cookie: 'prepr_refresh=/~5|/pricing~4|//evil.com~3' },
      }),
      res,
      PAGE,
      { slug: 'pricing' },
    );

    const refresh = res.cookies.get('prepr_refresh')!;
    const [pricing, home] = refresh.value.split('|');
    expect(Number(pricing!.split('~')[1])).toBeGreaterThanOrEqual(before);
    expect(pricing!.startsWith('/pricing~')).toBe(true);
    expect(home).toBe('/~5');
    expect(refresh.httpOnly).toBe(false);
  });

  it("does not let another page's fresh decision stand in for this one", async () => {
    const { prepr, request, response, decisionCalls } = await setup();
    const cookie = await decidedCookies(prepr, request, response);
    // `/` was decided long ago; another page just now.
    const mixed = cookie.replace(
      /prepr_refresh=\/~\d+/,
      `prepr_refresh=/other~${Date.now()}|/~1`,
    );

    await prepr.resolveDecisions(request(mixed), response(), PAGE, {
      slug: '/',
    });
    expect(decisionCalls()).toHaveLength(2);
  });

  it("keeps deciding a page after one visitor's answer named none of its groups", async () => {
    // Prepr leaves a group without a default variant out of the answer for a
    // visitor in none of its segments.
    let answer: unknown = {
      data: { Page: { content: [{ heading: 'plain' }] } },
    };
    const { createPreprClient } = await load();
    const { NextRequest, NextResponse } = await import('next/server');
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const body = String(init?.body);
      if (body.includes('__schema'))
        return new Response(JSON.stringify(introspection));
      if (body.includes('AbCheck')) {
        return new Response(JSON.stringify({ data: { Page: null } }), {
          headers: { vary: 'Prepr-Segments' },
        });
      }
      return new Response(JSON.stringify(answer));
    });
    const prepr = createPreprClient({ url: URL_, fetch });
    const visit = () => {
      const res = NextResponse.next();
      return prepr
        .resolveDecisions(new NextRequest('https://site.test/'), res, PAGE, {
          slug: '/',
        })
        .then(() => res);
    };

    await visit();
    answer = decision;
    const member = await visit();

    expect(member.cookies.get('prepr_decisions')?.value).toBe(
      'hero:DEVELOPERS',
    );
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
