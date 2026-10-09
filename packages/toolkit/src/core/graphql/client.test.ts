// @vitest-environment node
//
// The client builds real `Headers`/`Response` objects; happy-dom's versions
// accept values undici rejects, so this suite runs under node.

import { describe, expect, it, vi } from 'vitest';

import { createPreprClient } from './client';
import { GRAPHQL_URL, respond } from './test-helpers';

describe('createPreprClient options', () => {
  it('rejects an empty url with MISSING_TOKEN', () => {
    expect(() => createPreprClient({ url: '' })).toThrow(
      expect.objectContaining({ code: 'MISSING_TOKEN' }),
    );
  });

  it('rejects a non-https url with INVALID_TOKEN', () => {
    expect(() =>
      createPreprClient({ url: 'http://graphql.prepr.io/x' }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_TOKEN' }));
  });

  it('rejects an unparseable url with INVALID_TOKEN', () => {
    expect(() => createPreprClient({ url: 'https://' })).toThrow(
      expect.objectContaining({ code: 'INVALID_TOKEN' }),
    );
  });
});

describe('variants and decide', () => {
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
              { name: 'title', args: [], type: ref('String') },
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
  const QUERY =
    'query GetPage($slug: String) { Page(slug: $slug) { title content { ... on Hero { heading } } } }';

  function schemaSetup(answer: unknown) {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) =>
      String(init?.body).includes('__schema')
        ? respond(introspection)
        : respond(answer),
    );
    const client = createPreprClient({
      url: GRAPHQL_URL,
      fetch,
      stega: 'none',
    });
    const sent = () =>
      fetch.mock.calls
        .map((call) => JSON.parse(call[1]!.body as string).query as string)
        .filter((q) => !q.includes('__schema'));
    return { client, fetch, sent };
  }

  it('asks for every variant with variants: true', async () => {
    const { client, sent } = schemaSetup({ data: { Page: null } });

    await client.query(QUERY, { slug: '/' }, { variants: true });

    expect(sent()[0]).toContain('content(personalize:false)');
    expect(sent()[0]).toContain('_preprContext:_context');
  });

  it('decides with a cut-down query and returns variants per group', async () => {
    const { client, sent, fetch } = schemaSetup({
      data: {
        Page: {
          content: [
            {
              _preprContext: {
                kind: 'PERSONALIZATION',
                group_id: 'g1',
                variant_id: 'SEG',
              },
            },
          ],
        },
      },
    });

    const decisions = await client.decide(
      QUERY,
      { slug: '/' },
      {
        headers: { 'Prepr-Customer-Id': 'c1' },
      },
    );

    expect(decisions.get('g1')).toEqual(['SEG']);
    expect(sent()[0]).not.toContain('heading');
    expect(sent()[0]).not.toContain('title');
    const decisionInit = fetch.mock.calls.at(-1)![1]!;
    expect(new Headers(decisionInit.headers).get('Prepr-Customer-Id')).toBe(
      'c1',
    );
    expect(decisionInit.cache).toBe('no-store');
  });

  it('asks only about fields that hold groups, given the variants result', async () => {
    const { client, sent, fetch } = schemaSetup({ data: { Page: null } });

    const none = await client.decide(
      QUERY,
      { slug: '/' },
      {
        headers: {},
        from: { Page: { title: 'x', content: [{ heading: 'plain' }] } },
      },
    );

    // No segment groups on the page: no decision request at all.
    expect(none.size).toBe(0);
    expect(sent()).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();

    await client.decide(
      QUERY,
      { slug: '/' },
      {
        headers: {},
        from: {
          Page: {
            content: [
              {
                _preprContext: {
                  kind: 'PERSONALIZATION',
                  group_id: 'g',
                  variant_id: 'X',
                },
              },
            ],
          },
        },
      },
    );
    expect(sent()[0]).toContain('_preprContext');
  });

  it('tells whether a page has an A/B test from Vary, without the schema', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) =>
      respond(
        { data: { Page: { __typename: 'Page' } } },
        String(init?.body).includes('"/ab"')
          ? { vary: 'Authorization, Prepr-ABTesting5050' }
          : { vary: 'Authorization, Prepr-Segments' },
      ),
    );
    const client = createPreprClient({ url: GRAPHQL_URL, fetch });

    expect(await client.hasAbTests(QUERY, { slug: '/ab' })).toBe(true);
    expect(await client.hasAbTests(QUERY, { slug: '/ab' })).toBe(true);
    expect(await client.hasAbTests(QUERY, { slug: '/' })).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);

    const init = fetch.mock.calls[0]![1]!;
    // Leaf fields dropped, no schema introspection, no visitor headers.
    expect(JSON.parse(init.body as string).query).toBe(
      'query GetPageAbCheck($slug:String){__typename Page(slug:$slug){__typename content{__typename}}}',
    );
    expect(new Headers(init.headers).get('Prepr-Customer-Id')).toBeNull();
  });

  it('errs toward true when the A/B check fails', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      respond('down', {}, 503),
    );
    const client = createPreprClient({ url: GRAPHQL_URL, fetch });

    expect(await client.hasAbTests(QUERY, { slug: '/' })).toBe(true);
  });

  it('introspects the schema once per client', async () => {
    const { client, fetch } = schemaSetup({ data: { Page: null } });

    await client.query(QUERY, { slug: '/' }, { variants: true });
    await client.decide(QUERY, { slug: '/' }, { headers: {} });
    await client.query(QUERY, { slug: '/a' }, { variants: true });

    const introspections = fetch.mock.calls.filter((call) =>
      String(call[1]?.body).includes('__schema'),
    );
    expect(introspections).toHaveLength(1);
  });
});
