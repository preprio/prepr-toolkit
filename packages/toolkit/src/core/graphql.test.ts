// @vitest-environment node
//
// The client builds real `Headers`/`Response` objects; happy-dom's versions
// accept values undici rejects, so this suite runs under node.
import { vercelStegaCombine } from '@vercel/stega';
import { parse, type DocumentNode } from 'graphql';
import { print } from 'graphql/language/printer.js';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createEventClient, createPreprClient } from './graphql';
import { PreprError } from './server';
import { stegaClean } from './stega/clean';

// Wrap print so a test can count calls; behavior is unchanged.
vi.mock('graphql/language/printer.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('graphql/language/printer.js')>();
  return { ...actual, print: vi.fn(actual.print) };
});

const TOKEN = 'secret-token-123';
const GRAPHQL_URL = `https://graphql.prepr.io/${TOKEN}`;
const PAGE_QUERY = 'query GetPage($slug: String) { Page(slug: $slug) { _id } }';
// What the client sends: the same query without insignificant whitespace.
const PAGE_QUERY_SENT = 'query GetPage($slug:String){Page(slug:$slug){_id}}';

function respond(
  body: unknown,
  headers: Record<string, string> = {},
  status = 200,
): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers,
  });
}

function setup(
  response: Response | Error,
  options: { preview?: boolean } = {},
) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const client = createPreprClient({ url: GRAPHQL_URL, fetch, ...options });
  const init = () => fetch.mock.calls[0]?.[1] as RequestInit;
  const sentQuery = () => JSON.parse(init().body as string).query as string;
  return { client, fetch, init, sentQuery };
}

async function caught(promise: Promise<unknown>): Promise<PreprError> {
  const error = await promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PreprError);
  return error as PreprError;
}

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

describe('query request', () => {
  it('POSTs the query and variables as JSON to the url', async () => {
    const { client, fetch, init } = setup(respond({ data: { Page: null } }));

    await client.query(PAGE_QUERY, { slug: '/' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(GRAPHQL_URL);
    expect(init().method).toBe('POST');
    expect(new Headers(init().headers).get('content-type')).toBe(
      'application/json',
    );
    expect(JSON.parse(init().body as string)).toEqual({
      query: PAGE_QUERY_SENT,
      variables: { slug: '/' },
    });
  });

  it('resolves with the response data', async () => {
    const { client } = setup(respond({ data: { Page: { _id: 'p1' } } }));

    const result = await client.query(PAGE_QUERY, { slug: '/' });

    expect(result.data).toEqual({ Page: { _id: 'p1' } });
  });

  it('prefers a per-query fetch over the client fetch', async () => {
    const { client, fetch } = setup(respond({ data: {} }));
    const perQuery = vi.fn<typeof globalThis.fetch>(async () =>
      respond({ data: { ok: true } }),
    );

    await client.query(PAGE_QUERY, undefined, { fetch: perQuery });

    expect(perQuery).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('query size', () => {
  it("strips indentation and comments, which count against Prepr's size limit", async () => {
    const { client, sentQuery } = setup(respond({ data: {} }));
    const indented = `
      # A comment
      query GetPage($slug: String) {
        Page(slug: $slug) {
          _id
        }
      }
    `;

    await client.query(indented, { slug: '/' });

    expect(sentQuery()).toBe(PAGE_QUERY_SENT);
  });

  it('explains an HTTP 412 as a query that is too long', async () => {
    const { client } = setup(respond('', {}, 412));

    const error = await caught(client.query(PAGE_QUERY));

    expect(error.message).toContain('27,500 characters');
  });
});

describe('document resolution', () => {
  // Mirrors graphql-codegen's TypedDocumentString (documentMode: 'string').
  class TypedDocumentString<TResult, TVariables> extends String {
    declare __apiType?: (variables: TVariables) => TResult;
    constructor(private value: string) {
      super(value);
    }
    override toString(): string {
      return this.value;
    }
  }

  // Codegen's default client-preset output: plain JSON AST without `loc`.
  const codegenDocument = (query: string) =>
    JSON.parse(
      JSON.stringify(parse(query), (key, value) =>
        key === 'loc' ? undefined : value,
      ),
    ) as DocumentNode;

  it('sends a TypedDocumentString as its query text', async () => {
    const { client, sentQuery } = setup(respond({ data: {} }));

    await client.query(
      new TypedDocumentString<{ Page: null }, { slug: string }>(PAGE_QUERY),
      { slug: '/' },
    );

    expect(sentQuery()).toBe(PAGE_QUERY_SENT);
  });

  it('prints a DocumentNode without loc, as codegen emits it', async () => {
    const { client, sentQuery } = setup(respond({ data: {} }));

    await client.query(codegenDocument(PAGE_QUERY), { slug: '/' });

    expect(sentQuery()).toBe(PAGE_QUERY_SENT);
  });

  it('prints each DocumentNode once, however often it is queried', async () => {
    const document = parse(PAGE_QUERY);
    vi.mocked(print).mockClear();

    for (let i = 0; i < 3; i++) {
      const { client } = setup(respond({ data: {} }));
      await client.query(document, { slug: '/' });
    }

    expect(vi.mocked(print)).toHaveBeenCalledTimes(1);
  });

  it('rejects a value that is not a document with INVALID_DOCUMENT', async () => {
    const { client, fetch } = setup(respond({ data: {} }));

    const error = await caught(client.query({ foo: 1 } as unknown as string));

    expect(error.code).toBe('INVALID_DOCUMENT');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('infers data from a TypedDocumentNode-shaped document', async () => {
    const { client } = setup(respond({ data: { Page: { _id: 'p1' } } }));
    const document = parse(PAGE_QUERY) as DocumentNode & {
      __apiType?: (variables: { slug: string }) => {
        Page: { _id: string } | null;
      };
    };

    const { data } = await client.query(document, { slug: '/' });

    expectTypeOf(data).toEqualTypeOf<{ Page: { _id: string } | null }>();
  });
});

describe('query errors', () => {
  it('maps a non-2xx response to HTTP_ERROR with status and operation', async () => {
    const { client } = setup(respond('oops', {}, 500));

    const error = await caught(client.query(PAGE_QUERY));

    expect(error.code).toBe('HTTP_ERROR');
    expect(error.message).toContain('500');
    expect(error.message).toContain('GetPage');
  });

  it('maps a fetch rejection to FETCH_ERROR and keeps the cause', async () => {
    const cause = new TypeError('fetch failed');
    const { client } = setup(cause);

    const error = await caught(client.query(PAGE_QUERY));

    expect(error.code).toBe('FETCH_ERROR');
    expect(error.originalError).toBe(cause);
  });

  it('maps a non-JSON body to INVALID_RESPONSE', async () => {
    const { client } = setup(respond('<html>'));

    expect((await caught(client.query(PAGE_QUERY))).code).toBe(
      'INVALID_RESPONSE',
    );
  });

  it('maps a JSON body that is not an object to INVALID_RESPONSE', async () => {
    const { client } = setup(respond('42'));

    expect((await caught(client.query(PAGE_QUERY))).code).toBe(
      'INVALID_RESPONSE',
    );
  });

  it('maps GraphQL errors to GRAPHQL_ERROR with every message', async () => {
    const { client } = setup(
      respond({
        data: null,
        errors: [{ message: 'Unknown field' }, { message: 'Bad slug' }],
      }),
    );

    const error = await caught(client.query(PAGE_QUERY));

    expect(error.code).toBe('GRAPHQL_ERROR');
    expect(error.message).toContain('Unknown field; Bad slug');
    expect(error.context).toBe('GetPage');
  });

  it('maps a response without data to INVALID_RESPONSE', async () => {
    const { client } = setup(respond({}));

    expect((await caught(client.query(PAGE_QUERY))).code).toBe(
      'INVALID_RESPONSE',
    );
  });

  it('names an anonymous operation in errors', async () => {
    const { client } = setup(respond('oops', {}, 502));

    const error = await caught(client.query('{ Page { _id } }'));

    expect(error.context).toBe('anonymous');
  });

  it('never puts the url or token in an error message or context', async () => {
    const failures: (Response | Error)[] = [
      respond('oops', {}, 500),
      new TypeError('fetch failed'),
      respond('<html>'),
      respond({ errors: [{ message: 'x' }] }),
      respond({}),
    ];

    for (const failure of failures) {
      const { client } = setup(failure);
      const error = await caught(client.query(PAGE_QUERY));
      expect(error.message).not.toContain(TOKEN);
      expect(error.context ?? '').not.toContain(TOKEN);
    }
  });
});

describe('query personalization and caching', () => {
  it('reports personalized from the response Vary header', async () => {
    const { client } = setup(respond({ data: {} }, { Vary: 'Prepr-Segments' }));

    expect((await client.query(PAGE_QUERY)).personalized).toBe(true);
  });

  it('reports not personalized for a plain response', async () => {
    const { client } = setup(respond({ data: {} }));

    expect((await client.query(PAGE_QUERY)).personalized).toBe(false);
  });

  it('leaves the cache alone and keeps init.next for a headerless query', async () => {
    const { client, init } = setup(respond({ data: {} }));

    await client.query(PAGE_QUERY, undefined, {
      init: { next: { tags: ['x'] } } as RequestInit & { next?: unknown },
    });

    expect(init().cache).toBeUndefined();
    expect((init() as { next?: unknown }).next).toEqual({ tags: ['x'] });
  });

  it('forwards headers and forces no-store, dropping init.next', async () => {
    const { client, init } = setup(respond({ data: {} }));

    await client.query(PAGE_QUERY, undefined, {
      headers: { 'Prepr-Segments': 'vip' },
      init: {
        cache: 'force-cache',
        next: { revalidate: 60 },
      } as RequestInit & {
        next?: unknown;
      },
    });

    expect(new Headers(init().headers).get('Prepr-Segments')).toBe('vip');
    expect(init().cache).toBe('no-store');
    expect((init() as { next?: unknown }).next).toBeUndefined();
  });

  it('forces no-store for an empty headers object', async () => {
    const { client, init } = setup(respond({ data: {} }));

    await client.query(PAGE_QUERY, undefined, { headers: {} });

    expect(init().cache).toBe('no-store');
  });

  it('forces no-store in preview', async () => {
    const { client, init } = setup(respond({ data: {} }), { preview: true });

    await client.query(PAGE_QUERY, undefined, {
      init: { cache: 'force-cache' },
    });

    expect(init().cache).toBe('no-store');
  });

  it('keeps Content-Type even when the caller sends another one', async () => {
    const { client, init } = setup(respond({ data: {} }));

    await client.query(PAGE_QUERY, undefined, {
      headers: { 'Content-Type': 'text/plain' },
    });

    expect(new Headers(init().headers).get('content-type')).toBe(
      'application/json',
    );
  });

  it('rethrows a fetch error carrying a digest untouched', async () => {
    const signal = Object.assign(new Error('Dynamic server usage'), {
      digest: 'DYNAMIC_SERVER_USAGE',
    });
    const { client } = setup(signal);

    await expect(client.query(PAGE_QUERY)).rejects.toBe(signal);
  });
});

describe('stega cleaning', () => {
  const payload = { origin: 'prepr.io', href: 'https://prepr.io/edit/1' };
  // `false` forces encoding; the default skips values that look like URLs.
  const title = vercelStegaCombine('Hello', payload, false);
  const imageUrl = vercelStegaCombine(
    'https://cdn.prepr.io/a.jpg',
    payload,
    false,
  );
  const body = {
    data: { Page: { title, imageUrl, _slug: title, href: title } },
  };

  type Page = {
    Page: { title: string; imageUrl: string; _slug: string; href: string };
  };

  it('strips every string by default outside preview', async () => {
    const { client } = setup(respond(body));

    const { data } = await client.query<Page, undefined>(PAGE_QUERY);

    expect(data.Page).toEqual({
      title: 'Hello',
      imageUrl: 'https://cdn.prepr.io/a.jpg',
      _slug: 'Hello',
      href: 'Hello',
    });
  });

  it('strips only URL-like keys by default in preview', async () => {
    const { client } = setup(respond(body), { preview: true });

    const { data } = await client.query<Page, undefined>(PAGE_QUERY);

    expect(data.Page.imageUrl).toBe('https://cdn.prepr.io/a.jpg');
    expect(data.Page._slug).toBe('Hello');
    expect(data.Page.href).toBe('Hello');
    expect(data.Page.title).not.toBe('Hello');
    expect(stegaClean(data.Page.title)).toBe('Hello');
  });

  it("leaves markers in place with stega: 'none'", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => respond(body));
    const client = createPreprClient({
      url: GRAPHQL_URL,
      fetch,
      stega: 'none',
    });

    const { data } = await client.query<Page, undefined>(PAGE_QUERY);

    expect(data.Page.imageUrl).toBe(imageUrl);
  });

  it('cleans markers written as JSON unicode escapes', async () => {
    const escaped = JSON.stringify(body).replace(
      /[\u200b-\u200d\u2060-\u2063\ufeff]/g,
      (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
    const { client } = setup(respond(escaped));

    const { data } = await client.query<Page, undefined>(PAGE_QUERY);

    expect(data.Page.title).toBe('Hello');
  });

  it('returns identical data for a body without markers', async () => {
    const plain = {
      data: { Page: { title: 'Hello', imageUrl: 'https://x/a.jpg' } },
    };
    const { client } = setup(respond(plain));

    expect((await client.query(PAGE_QUERY)).data).toEqual(plain.data);
  });
});

describe('createEventClient', () => {
  type FakeEvent = { headers: Headers; fetch?: typeof globalThis.fetch };

  function eventSetup() {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      respond({ data: {} }),
    );
    const client = createEventClient<FakeEvent>(
      { url: GRAPHQL_URL, fetch },
      { headers: (e) => e.headers, fetch: (e) => e.fetch },
    );
    const init = () => fetch.mock.calls[0]?.[1] as RequestInit;
    return { client, fetch, init };
  }

  const event: FakeEvent = {
    headers: new Headers({
      'Prepr-Segments': 'vip',
      Cookie: 'session=secret',
      Authorization: 'Bearer secret',
    }),
  };

  it('forwards only Prepr headers from the event with personalize', async () => {
    const { client, init } = eventSetup();

    await client.query(PAGE_QUERY, undefined, { personalize: true, event });

    const sent = new Headers(init().headers);
    expect(sent.get('Prepr-Segments')).toBe('vip');
    expect(sent.get('Cookie')).toBeNull();
    expect(sent.get('Authorization')).toBeNull();
    expect(init().cache).toBe('no-store');
  });

  it('lets caller headers win over the request headers', async () => {
    const { client, init } = eventSetup();

    await client.query(PAGE_QUERY, undefined, {
      personalize: true,
      event,
      headers: { 'Prepr-Segments': 'override' },
    });

    expect(new Headers(init().headers).get('Prepr-Segments')).toBe('override');
  });

  it('sends no Prepr headers and stays cacheable without personalize', async () => {
    const { client, init } = eventSetup();

    await client.query(PAGE_QUERY, undefined, { event });

    expect(new Headers(init().headers).get('Prepr-Segments')).toBeNull();
    expect(init().cache).toBeUndefined();
  });

  it('rejects personalize without an event with CONTEXT_ERROR', async () => {
    const { client, fetch } = eventSetup();

    const error = await caught(
      client.query(PAGE_QUERY, undefined, {
        personalize: true,
      } as unknown as { personalize: true; event: FakeEvent }),
    );

    expect(error.code).toBe('CONTEXT_ERROR');
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the adapter's per-event fetch", async () => {
    const { client, fetch } = eventSetup();
    const eventFetch = vi.fn<typeof globalThis.fetch>(async () =>
      respond({ data: {} }),
    );

    await client.query(PAGE_QUERY, undefined, {
      event: { ...event, fetch: eventFetch },
    });

    expect(eventFetch).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('custom headers', () => {
  it('sends client-level headers and keeps the request cacheable', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      respond({ data: {} }),
    );
    const client = createPreprClient({
      url: GRAPHQL_URL,
      fetch,
      headers: { 'X-Api-Version': '2' },
    });

    await client.query(PAGE_QUERY);

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('X-Api-Version')).toBe('2');
    expect(init.cache).toBeUndefined();
  });

  it('merges init.headers instead of dropping them, and forces no-store', async () => {
    const { client, init } = setup(respond({ data: {} }));

    await client.query(PAGE_QUERY, undefined, {
      init: { headers: { 'X-Trace': 'abc' } },
    });

    expect(new Headers(init().headers).get('X-Trace')).toBe('abc');
    expect(init().cache).toBe('no-store');
  });

  it('layers client, init and query headers, query winning', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      respond({ data: {} }),
    );
    const client = createPreprClient({
      url: GRAPHQL_URL,
      fetch,
      headers: { 'X-Layer': 'client', 'X-Client': '1' },
    });

    await client.query(PAGE_QUERY, undefined, {
      init: { headers: { 'X-Layer': 'init', 'X-Init': '1' } },
      headers: { 'X-Layer': 'query', 'Content-Type': 'text/plain' },
    });

    const sent = new Headers((fetch.mock.calls[0]?.[1] as RequestInit).headers);
    expect(sent.get('X-Layer')).toBe('query');
    expect(sent.get('X-Client')).toBe('1');
    expect(sent.get('X-Init')).toBe('1');
    expect(sent.get('content-type')).toBe('application/json');
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

describe('fastlyQuery', () => {
  const decode = (value: string) =>
    new TextDecoder().decode(
      Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
    );

  it('sends a GET with the body base64-encoded in Fastly-Query', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      respond({ data: {} }),
    );
    const client = createPreprClient({
      url: GRAPHQL_URL,
      fetch,
      fastlyQuery: true,
    });

    await client.query(PAGE_QUERY, { slug: 'café' });

    const init = fetch.mock.calls[0]![1]!;
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    const header = new Headers(init.headers).get('Fastly-Query')!;
    expect(JSON.parse(decode(header))).toEqual({
      query: PAGE_QUERY_SENT,
      variables: { slug: 'café' },
    });
    expect(new Headers(init.headers).get('Content-Type')).toBe(
      'application/json',
    );
  });

  it('falls back to POST when the query is too large for a header', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      respond({ data: {} }),
    );
    const client = createPreprClient({
      url: GRAPHQL_URL,
      fetch,
      fastlyQuery: true,
    });

    await client.query(PAGE_QUERY, { blob: 'x'.repeat(100 * 1024) });

    const init = fetch.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Fastly-Query')).toBeNull();
  });

  it('is off by default', async () => {
    const { client, init } = setup(respond({ data: {} }));
    await client.query(PAGE_QUERY);
    expect(init().method).toBe('POST');
  });
});
