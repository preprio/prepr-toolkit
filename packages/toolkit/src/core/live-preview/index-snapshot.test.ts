import { describe, expect, it } from 'vitest';

import { indexSnapshot } from './index-snapshot';

describe('indexSnapshot', () => {
  it('indexes nested items and arrays by _id with full paths', () => {
    const data = {
      Page: {
        _id: 'page-1',
        title: 'Home',
        content: [
          { _id: 'hero-1', __typename: 'Hero', heading: 'Hi' },
          {
            _id: 'feature-1',
            __typename: 'Feature',
            cta: { items: [{ _id: 'btn-1', label: 'Go' }] },
          },
        ],
      },
    };

    const index = indexSnapshot(data);

    expect(index.get('page-1')).toEqual([['Page']]);
    expect(index.get('hero-1')).toEqual([['Page', 'content', 0]]);
    expect(index.get('btn-1')).toEqual([
      ['Page', 'content', 1, 'cta', 'items', 0],
    ]);
  });

  it('records every occurrence of a duplicated id', () => {
    const shared = { _id: 'btn-1', label: 'Go' };
    const data = { a: { ...shared }, b: { ...shared } };

    const index = indexSnapshot(data);

    expect(index.get('btn-1')).toEqual([['a'], ['b']]);
  });

  it('survives cyclic references without infinite looping', () => {
    const node: Record<string, unknown> = { _id: 'x-1' };
    node.self = node;

    const index = indexSnapshot({ node });

    expect(index.get('x-1')).toEqual([['node']]);
  });

  it('returns an empty index for scalars and null', () => {
    expect(indexSnapshot(null).size).toBe(0);
    expect(indexSnapshot('text').size).toBe(0);
  });
});
