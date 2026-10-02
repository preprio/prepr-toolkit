// @vitest-environment node
//
// The client builds real `Headers`/`Response` objects; happy-dom's versions
// accept values undici rejects, so this suite runs under node.
import { parse, print, type DocumentNode } from 'graphql';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createPreprClient } from './graphql';
import { PreprError } from './server';

// Wrap print so a test can count calls; behavior is unchanged.
vi.mock('graphql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('graphql')>();
  return { ...actual, print: vi.fn(actual.print) };
});

const TOKEN = 'secret-token-123';
const GRAPHQL_URL = `https://graphql.prepr.io/${TOKEN}`;
const PAGE_QUERY = 'query GetPage($slug: String) { Page(slug: $slug) { _id } }';

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
      query: PAGE_QUERY,
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

    expect(sentQuery()).toBe(PAGE_QUERY);
  });

  it('prints a DocumentNode without loc, as codegen emits it', async () => {
    const { client, sentQuery } = setup(respond({ data: {} }));

    await client.query(codegenDocument(PAGE_QUERY), { slug: '/' });

    expect(sentQuery()).toContain('query GetPage($slug: String)');
    expect(sentQuery()).toContain('Page(slug: $slug)');
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
      __apiType?: (variables: {
        slug: string;
      }) => { Page: { _id: string } | null };
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
      init: { cache: 'force-cache', next: { revalidate: 60 } } as RequestInit & {
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
