// @vitest-environment node
//
// The client builds real `Headers`/`Response` objects; happy-dom's versions
// accept values undici rejects, so this suite runs under node.

import { parse, type DocumentNode } from 'graphql';
import { print } from 'graphql/language/printer.js';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  PAGE_QUERY,
  PAGE_QUERY_SENT,
  caught,
  respond,
  setup,
} from './test-helpers';

// Wrap print so a test can count calls; behavior is unchanged.
vi.mock('graphql/language/printer.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('graphql/language/printer.js')>();
  return { ...actual, print: vi.fn(actual.print) };
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
