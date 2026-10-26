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

  it('finds a field the data holds under its GraphQL name by its API id', () => {
    const data = {
      Page: { _id: 'p', headline_style: 'H2', heroBlock: { title: 'Old' } },
    };
    const index = indexSnapshot(data);
    const styled = patchSnapshot(
      data,
      index,
      'p',
      'headlineStyle',
      'H1',
    ) as typeof data;
    expect(styled.Page.headline_style).toBe('H1');
    const nested = patchSnapshot(
      data,
      index,
      'p',
      'heroBlock.title',
      'New',
    ) as typeof data;
    expect(nested.Page.heroBlock.title).toBe('New');
  });

  it('patches every occurrence of the item, immutably, with structural sharing', () => {
    const result = patchSnapshot(
      snapshot,
      index,
      'hero-1',
      'heading',
      'Hello',
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
      snapshot,
    );
  });

  it('skips fields whose current value is not scalar or null', () => {
    expect(patchSnapshot(snapshot, index, 'hero-1', 'image', 'x')).toBe(
      snapshot,
    );
  });

  it('skips fields that were never selected in this snapshot', () => {
    expect(patchSnapshot(snapshot, index, 'hero-1', 'subtitle', 'x')).toBe(
      snapshot,
    );
  });

  it('patches a field whose current value is null', () => {
    const withNull = { item: { _id: 'i-1', caption: null } };
    const result = patchSnapshot(
      withNull,
      indexSnapshot(withNull),
      'i-1',
      'caption',
      'now set',
    ) as typeof withNull;
    expect(result.item.caption).toBe('now set');
  });

  it('returns the same reference when the value is already current', () => {
    expect(patchSnapshot(snapshot, index, 'hero-1', 'heading', 'Hi')).toBe(
      snapshot,
    );
  });

  it('patches a dotted path below the item, for values without an _id', () => {
    const post = {
      Post: {
        _id: 'post-1',
        content: [
          { __typename: 'Text', body: '<p>One</p>' },
          { __typename: 'Text', body: '<p>Two</p>' },
        ],
      },
    };
    const result = patchSnapshot(
      post,
      indexSnapshot(post),
      'post-1',
      'content.1.body',
      '<p>Changed</p>',
    ) as typeof post;

    expect(result.Post.content[1].body).toBe('<p>Changed</p>');
    expect(result.Post.content[0]).toBe(post.Post.content[0]);
    expect(post.Post.content[1].body).toBe('<p>Two</p>');
  });

  it('leaves the snapshot alone when a dotted path does not resolve', () => {
    const result = patchSnapshot(
      snapshot,
      index,
      'page-1',
      'content.9.heading',
      'x',
    );
    expect(result).toBe(snapshot);
  });

  it('refuses prototype keys in a dotted path', () => {
    const result = patchSnapshot(
      snapshot,
      index,
      'page-1',
      '__proto__.polluted',
      'x',
    );
    expect(result).toBe(snapshot);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  describe('structured values (assets)', () => {
    const post = {
      Post: {
        _id: 'post-1',
        cover_image: {
          url: 'https://cdn/w_800/old.jpg',
          width: 800,
          height: 600,
        },
        gallery: [{ _id: 'a', url: 'https://cdn/a.jpg', width: 10 }],
        empty: null,
      },
    };
    const index = indexSnapshot(post);

    it('updates only the keys the query selected', () => {
      const result = patchSnapshot(post, index, 'post-1', 'cover_image', {
        _id: 'new',
        url: 'https://cdn/w_800/new.jpg',
        width: 1200,
        height: 900,
        name: 'not queried',
      }) as typeof post;
      expect(result.Post.cover_image).toEqual({
        url: 'https://cdn/w_800/new.jpg',
        width: 1200,
        height: 900,
      });
      expect(post.Post.cover_image.url).toBe('https://cdn/w_800/old.jpg');
    });

    it('unwraps a list pushed into a single-asset field', () => {
      const result = patchSnapshot(post, index, 'post-1', 'cover_image', [
        { url: 'https://cdn/w_800/list.jpg', width: 1, height: 1 },
      ]) as typeof post;
      expect(result.Post.cover_image.url).toBe('https://cdn/w_800/list.jpg');
    });

    it('maps a list onto the queried entry shape', () => {
      const result = patchSnapshot(post, index, 'post-1', 'gallery', [
        { _id: 'b', url: 'https://cdn/b.jpg', width: 20, extra: 'x' },
      ]) as typeof post;
      expect(result.Post.gallery).toEqual([
        { _id: 'b', url: 'https://cdn/b.jpg', width: 20 },
      ]);
    });

    it('writes into an empty field as-is and clears with null', () => {
      const filled = patchSnapshot(post, index, 'post-1', 'empty', {
        url: 'https://cdn/c.jpg',
      }) as { Post: { empty: unknown } };
      expect(filled.Post.empty).toEqual({ url: 'https://cdn/c.jpg' });

      const cleared = patchSnapshot(
        post,
        index,
        'post-1',
        'cover_image',
        null,
      ) as {
        Post: { cover_image: unknown };
      };
      expect(cleared.Post.cover_image).toBeNull();
    });
  });
});

describe('patchSnapshot edit links', () => {
  it('keeps the hidden edit link of the text it replaces', async () => {
    const { vercelStegaCombine, vercelStegaSplit } =
      await import('@vercel/stega');
    const snapshot = {
      Post: {
        _id: 'p',
        body: vercelStegaCombine('<p>Old</p>', {
          origin: 'prepr.io',
          href: 'https://x/content/edit/p',
        }),
      },
    };
    const next = patchSnapshot(
      snapshot,
      indexSnapshot(snapshot),
      'p',
      'body',
      '<p>New</p>',
    ) as typeof snapshot;
    expect(vercelStegaSplit(next.Post.body).cleaned).toBe('<p>New</p>');
    expect(vercelStegaSplit(next.Post.body).encoded).toBe(
      vercelStegaSplit(snapshot.Post.body).encoded,
    );
  });
});

describe('patchSnapshot Text body', () => {
  it('writes a body change to the html and text the snapshot holds', () => {
    const data = {
      Article: {
        _id: 'a',
        elements: [
          { __typename: 'Text', _id: 't', html: '<p>Old</p>', text: 'Old' },
        ],
      },
    };
    const next = patchSnapshot(
      data,
      indexSnapshot(data),
      't',
      'body',
      '<p>New</p>',
    ) as typeof data;
    expect(next.Article.elements[0]).toMatchObject({
      html: '<p>New</p>',
      text: 'New',
    });
  });

  it('keeps writing body itself when the snapshot holds it', () => {
    const data = { Text: { __typename: 'Text', _id: 't', body: 'Old' } };
    const next = patchSnapshot(
      data,
      indexSnapshot(data),
      't',
      'body',
      'New',
    ) as typeof data;
    expect(next.Text.body).toBe('New');
  });

  it('does not alias body on other types', () => {
    const data = { Quote: { __typename: 'Quote', _id: 'q', text: 'Ann' } };
    const next = patchSnapshot(data, indexSnapshot(data), 'q', 'body', 'X');
    expect(next).toBe(data);
  });
});
