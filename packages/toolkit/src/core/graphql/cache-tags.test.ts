import { describe, expect, it } from 'vitest';

import {
  PREPR_ANY_ITEM_TAG,
  preprCacheTags,
  preprModelTag,
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

  it('builds model tags from the singular model name', () => {
    expect(preprModelTag('Post')).toBe('prepr:model:Post');
  });
});
