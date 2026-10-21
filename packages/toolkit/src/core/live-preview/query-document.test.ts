// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { collectFields, readQueryDocument } from './query-document';

describe('readQueryDocument', () => {
  it('skips arguments, variables, directives, strings and comments', () => {
    const doc = readQueryDocument(`
      # leading comment
      query Posts($where: PostWhereInput = { title: "a)b{" }, $n: Int!) @cached {
        Posts(where: $where, limit: $n, sort: [publish_on_DESC]) {
          items @include(if: true) {
            _id
            title(locale: """block ) { string \\""" """) # trailing
            cover: cover_image { url(width: -1.5e3) }
          }
        }
      }
    `);
    const root = collectFields(doc.operation, undefined, doc);
    expect([...root.keys()]).toEqual(['Posts']);
    const posts = root.get('Posts')!;
    expect(posts.hasArgs).toBe(true);
    const items = collectFields(posts.selections, undefined, doc).get('items')!;
    const fields = collectFields(items.selections, undefined, doc);
    expect([...fields.keys()]).toEqual(['_id', 'title', 'cover']);
    expect(fields.get('cover')!.name).toBe('cover_image');
  });

  it('picks the named operation', () => {
    const source = '{ A { _id } } query B { B { _id } }';
    const doc = readQueryDocument(source, 'B');
    expect([...collectFields(doc.operation, undefined, doc).keys()]).toEqual([
      'B',
    ]);
  });

  it('rejects input that is not an executable document', () => {
    expect(() => readQueryDocument('type Query { a: String }')).toThrow(
      SyntaxError,
    );
    expect(() => readQueryDocument('{ a ')).toThrow(SyntaxError);
    expect(() => readQueryDocument('{ a(x: "open) }')).toThrow(SyntaxError);
  });
});

describe('collectFields', () => {
  const doc = readQueryDocument(`
    {
      item {
        __typename
        ... on Component { _id }
        ... on Hero { title: heading }
        ... on Quote { title: author }
        ...Shared
      }
    }
    fragment Shared on Hero { image { url } }
  `);
  const item = collectFields(doc.operation, undefined, doc).get('item')!;

  it('prefers the branch whose type condition names the object', () => {
    expect(collectFields(item.selections, 'Hero', doc).get('title')!.name).toBe(
      'heading',
    );
    expect(
      collectFields(item.selections, 'Quote', doc).get('title')!.name,
    ).toBe('author');
  });

  it('keeps fields from interface and union conditions', () => {
    const fields = collectFields(item.selections, 'Hero', doc);
    expect(fields.has('_id')).toBe(true);
    expect(fields.has('image')).toBe(true);
  });

  it('does not loop on a fragment that spreads itself', () => {
    const cyclic = readQueryDocument(`
      { a { ...F } }
      fragment F on A { _id ...F }
    `);
    const a = collectFields(cyclic.operation, 'A', cyclic).get('a')!;
    expect([...collectFields(a.selections, 'A', cyclic).keys()]).toEqual([
      '_id',
    ]);
  });
});
