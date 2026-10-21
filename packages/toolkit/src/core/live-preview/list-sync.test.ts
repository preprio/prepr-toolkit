import { describe, expect, it } from 'vitest';

import { indexSnapshot } from './index-snapshot';
import { patchSnapshot, syncListSnapshot } from './patch';

function post() {
  return {
    Post: {
      _id: 'post-1',
      content: [
        { __typename: 'Text', _id: 't1', body: '<p>One</p>', format: null },
        {
          __typename: 'Assets',
          items: [{ _id: 'a1', url: 'https://cdn/a1.jpg' }],
        },
        { __typename: 'Text', _id: 't2', body: '<p>Two</p>', format: null },
      ],
    },
  };
}

describe('syncListSnapshot', () => {
  it('inserts a new Text entry in the queried shape and keeps existing entries as the same objects', () => {
    const data = post();
    const result = syncListSnapshot(
      data,
      indexSnapshot(data),
      'post-1',
      'content',
      [
        { _id: 't1' },
        { _id: 'tmp:1', __typename: 'Text', body: '<p>New</p>', format: null },
        { _id: 'a1' },
        { _id: 't2' },
      ],
    ) as ReturnType<typeof post>;

    expect(result.Post.content).toHaveLength(4);
    expect(result.Post.content[0]).toBe(data.Post.content[0]);
    expect(result.Post.content[1]).toEqual({
      __typename: 'Text',
      _id: 'tmp:1',
      body: '<p>New</p>',
      format: null,
    });
    expect(result.Post.content[2]).toBe(data.Post.content[1]);
  });

  it('removes and reorders entries of any type', () => {
    const data = post();
    const result = syncListSnapshot(
      data,
      indexSnapshot(data),
      'post-1',
      'content',
      [{ _id: 't2' }, { _id: 'a1' }],
    ) as ReturnType<typeof post>;

    expect(result.Post.content).toEqual([
      data.Post.content[2],
      data.Post.content[1],
    ]);
  });

  it('leaves out new entries it cannot build until they are saved', () => {
    const data = post();
    const result = syncListSnapshot(
      data,
      indexSnapshot(data),
      'post-1',
      'content',
      [
        { _id: 't1' },
        { _id: 'tmp:2', __typename: 'Component' },
        { _id: 'a1' },
        { _id: 't2' },
      ],
    );
    expect(result).toBe(data);
  });

  it('ignores a list in which no existing entry matches, so stale ids cannot empty the page', () => {
    const data = post();
    const result = syncListSnapshot(
      data,
      indexSnapshot(data),
      'post-1',
      'content',
      [{ _id: 'other-1', __typename: 'Text', body: '<p>x</p>' }],
    );
    expect(result).toBe(data);
  });

  it('ignores pages that selected no ids on their entries', () => {
    const data = {
      Post: { _id: 'post-1', content: [{ __typename: 'Text', body: 'x' }] },
    };
    const result = syncListSnapshot(
      data,
      indexSnapshot(data),
      'post-1',
      'content',
      [{ _id: 'tmp:1', __typename: 'Text', body: 'y' }],
    );
    expect(result).toBe(data);
  });

  it('lets a body push reach a newly built entry by its temporary id', () => {
    const data = post();
    const synced = syncListSnapshot(
      data,
      indexSnapshot(data),
      'post-1',
      'content',
      [
        { _id: 't1' },
        { _id: 'tmp:1', __typename: 'Text', body: '<p>N</p>', format: null },
        { _id: 'a1' },
        { _id: 't2' },
      ],
    );
    const typed = patchSnapshot(
      synced,
      indexSnapshot(synced),
      'tmp:1',
      'body',
      '<p>Typed</p>',
    ) as ReturnType<typeof post>;
    expect(typed.Post.content[1].body).toBe('<p>Typed</p>');
  });
});

describe('structured list values', () => {
  it("gives a new list entry the queried keys, never the first entry's values", () => {
    const data = {
      Post: {
        _id: 'post-1',
        gallery: [
          { _id: 'a', url: 'https://cdn/a.jpg', mime_type: 'image/png' },
        ],
      },
    };
    const result = patchSnapshot(
      data,
      indexSnapshot(data),
      'post-1',
      'gallery',
      [
        { _id: 'a', url: 'https://cdn/a.jpg' },
        { _id: 'b', url: 'https://cdn/b.mp4' },
      ],
    ) as typeof data;

    expect(result.Post.gallery[1]).toEqual({
      _id: 'b',
      url: 'https://cdn/b.mp4',
      mime_type: null,
    });
  });
});

describe('syncListSnapshot — assets entries', () => {
  it('matches an assets entry by its own _id or by its first asset, so a swapped image keeps its place', () => {
    const data = {
      Post: {
        _id: 'post-1',
        content: [
          { __typename: 'Text', _id: 't1', body: 'x' },
          { __typename: 'Assets', _id: 'e1', items: [{ _id: 'a1' }] },
        ],
      },
    };
    const index = indexSnapshot(data);
    // The editor still knows the block by its pinned first-asset id.
    const byAsset = syncListSnapshot(data, index, 'post-1', 'content', [
      { _id: 'a1' },
      { _id: 't1' },
    ]) as typeof data;
    expect(byAsset.Post.content[0]).toBe(data.Post.content[1]);
    // Or by the entry's own id once the API returns one.
    const byEntry = syncListSnapshot(data, index, 'post-1', 'content', [
      { _id: 't1' },
      { _id: 'e1' },
    ]);
    expect(byEntry).toBe(data);
  });
});
