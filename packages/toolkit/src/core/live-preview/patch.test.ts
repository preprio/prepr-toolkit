import { describe, expect, it } from 'vitest';

import { indexSnapshot } from './index-snapshot';
import { patchSnapshot } from './patch';

describe('patchSnapshot', () => {
  const snapshot = {
    Page: {
      _id: 'page-1',
      title: 'Home',
      content: [
        { _id: 'hero-1', heading: 'Hi', image: { url: 'a.jpg' } },
        { _id: 'hero-1', heading: 'Hi' },
      ],
    },
  };
  const index = indexSnapshot(snapshot);

  it('patches every occurrence of the item, immutably, with structural sharing', () => {
    const result = patchSnapshot(
      snapshot,
      index,
      'hero-1',
      'heading',
      'Hello'
    ) as typeof snapshot;

    expect(result.Page.content[0].heading).toBe('Hello');
    expect(result.Page.content[1].heading).toBe('Hello');
    // untouched original
    expect(snapshot.Page.content[0].heading).toBe('Hi');
    // clones along changed paths only
    expect(result).not.toBe(snapshot);
    expect(result.Page).not.toBe(snapshot.Page);
    // untouched subtree keeps identity
    expect(result.Page.content[0].image).toBe(snapshot.Page.content[0].image);
  });

  it('returns the same reference for an unknown item', () => {
    expect(patchSnapshot(snapshot, index, 'nope', 'heading', 'x')).toBe(
      snapshot
    );
  });

  it('skips fields whose current value is not scalar or null', () => {
    expect(patchSnapshot(snapshot, index, 'hero-1', 'image', 'x')).toBe(
      snapshot
    );
  });

  it('skips fields that were never selected in this snapshot', () => {
    expect(patchSnapshot(snapshot, index, 'hero-1', 'subtitle', 'x')).toBe(
      snapshot
    );
  });

  it('patches a field whose current value is null', () => {
    const withNull = { item: { _id: 'i-1', caption: null } };
    const result = patchSnapshot(
      withNull,
      indexSnapshot(withNull),
      'i-1',
      'caption',
      'now set'
    ) as typeof withNull;
    expect(result.item.caption).toBe('now set');
  });

  it('returns the same reference when the value is already current', () => {
    expect(patchSnapshot(snapshot, index, 'hero-1', 'heading', 'Hi')).toBe(
      snapshot
    );
  });
});
