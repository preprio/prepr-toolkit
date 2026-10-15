import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';

import type { PreprSchemaInfo } from '../variants';
import {
  PREPR_ANY_ITEM_TAG,
  preprCacheTags,
  preprModelTag,
  preprModelTagsFor,
} from './cache-tags';

describe('preprCacheTags', () => {
  it('tags every item at any depth, once each', () => {
    const data = {
      Page: {
        _id: 'page',
        title: 'Home',
        content: [
          { _id: 'hero', image: { _id: 'asset', url: 'x' } },
          { _id: 'hero' },
          { cta: { link: { _id: 'post' } } },
        ],
      },
    };
    expect(preprCacheTags(data).sort()).toEqual(
      ['prepr:asset', 'prepr:hero', 'prepr:page', 'prepr:post'].sort(),
    );
  });

  it('covers every variant of a variants: true result', () => {
    const data = {
      Page: {
        _id: 'page',
        content: [
          {
            _context: { group_id: 'g' },
            _id: 'default',
            variants: [{ _id: 'segment-a' }, { _id: 'segment-b' }],
          },
        ],
      },
    };
    expect(preprCacheTags(data)).toEqual(
      expect.arrayContaining([
        'prepr:default',
        'prepr:segment-a',
        'prepr:segment-b',
      ]),
    );
  });

  it('ignores non-string and empty ids, and non-object input', () => {
    expect(preprCacheTags({ a: { _id: 1 }, b: { _id: '' } })).toEqual([]);
    expect(preprCacheTags(null)).toEqual([]);
    expect(preprCacheTags('text')).toEqual([]);
  });

  it('falls back to the any-item tag past 128 items', () => {
    const items = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ _id: `item-${i}` }));
    expect(preprCacheTags(items(128))).toHaveLength(128);
    expect(preprCacheTags(items(129))).toEqual([PREPR_ANY_ITEM_TAG]);
  });

  it('falls back to the any-item tag for an id past the tag length limit', () => {
    expect(preprCacheTags({ _id: 'x'.repeat(251) })).toEqual([
      PREPR_ANY_ITEM_TAG,
    ]);
  });

  it('walks deeply nested results without overflowing the call stack', () => {
    let deep: Record<string, unknown> = { _id: 'leaf' };
    for (let i = 0; i < 100_000; i++) deep = { child: deep };
    expect(preprCacheTags(deep)).toEqual(['prepr:leaf']);
  });

  it('gives the Prepr model name and its GraphQL type the same tag', () => {
    expect(preprModelTag('Post')).toBe('prepr:model:post');
    expect(preprModelTag('Blog post')).toBe(preprModelTag('BlogPost'));
  });
});

const type = (
  fields: Record<string, string>,
  possibleTypes: string[] = [],
) => ({
  fields: Object.fromEntries(
    Object.entries(fields).map(([name, t]) => [
      name,
      { type: t, personalizable: false },
    ]),
  ),
  possibleTypes,
  hasContext: false,
});

const schema: PreprSchemaInfo = {
  queryType: 'Query',
  types: {
    Query: type({
      Page: 'Page',
      BlogPosts: 'BlogPosts',
      ContentItems: 'ContentItems',
      Navigation: 'Navigation',
    }),
    Page: type({ _id: 'String', title: 'String' }),
    BlogPost: type({ _id: 'String' }),
    BlogPosts: type({ items: 'BlogPost', total: 'Int' }),
    ContentItems: type({ items: 'ContentItem', total: 'Int' }),
    ContentItem: type({}, ['Page', 'BlogPost']),
    Navigation: type({ _id: 'String' }),
  },
};

describe('preprModelTagsFor', () => {
  const tags = (query: string, data: unknown) =>
    preprModelTagsFor(parse(query), data, schema);

  it('tags a single-item lookup that found nothing, so publishing it refreshes the page', () => {
    expect(tags('{ Page(slug: "new") { _id } }', { Page: null })).toEqual([
      'prepr:model:page',
    ]);
  });

  it('leaves a lookup that found its item to the item tag', () => {
    expect(tags('{ Page { _id } }', { Page: { _id: 'p' } })).toEqual([]);
  });

  it('tags list queries with the model of their items, so new items appear', () => {
    expect(
      tags('{ BlogPosts { items { _id } } }', { BlogPosts: { items: [] } }),
    ).toEqual(['prepr:model:blogpost']);
  });

  it('tags every model a union list can hold', () => {
    expect(tags('{ ContentItems { items { _id } } }', {})).toEqual([
      'prepr:model:page',
      'prepr:model:blogpost',
    ]);
  });

  it('reads aliased fields and handles several queries in one operation', () => {
    expect(
      tags('{ home: Page { _id } nav: Navigation { _id } }', {
        home: null,
        nav: { _id: 'n' },
      }),
    ).toEqual(['prepr:model:page']);
  });

  it('ignores mutations, unknown fields and missing data', () => {
    expect(tags('mutation { Page { _id } }', null)).toEqual([]);
    expect(tags('{ Unknown { _id } }', null)).toEqual([]);
  });
});
