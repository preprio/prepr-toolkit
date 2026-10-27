import { vercelStegaCombine, vercelStegaSplit } from '@vercel/stega';
import { describe, expect, it } from 'vitest';

import { decodeStega } from '../stega/clean';
import { annotateEditLinks } from './edit-links';

const EDITOR = 'https://acme.prepr.io/content/edit';

/** Text as Prepr's API returns it in edit mode. */
function encoded(text: string, itemId: string, field?: string): string {
  const query = field ? `?locale=en-US&field=${field}` : '?locale=en-US';
  return vercelStegaCombine(
    text,
    { origin: 'prepr.io', href: `${EDITOR}/${itemId}${query}` },
    false,
  );
}

function link(value: unknown): URL {
  return new URL(decodeStega(value as string)!.href);
}

describe('annotateEditLinks', () => {
  const page = () => ({
    Page: {
      _id: 'page-1',
      title: encoded('Home', 'page-1', 'title'),
      content: [
        {
          __typename: 'Hero',
          _id: 'hero-1',
          heading: encoded('Welcome', 'page-1', 'content.0.heading'),
          buttons: [
            {
              _id: 'btn-1',
              text: encoded('Go', 'page-1', 'content.0.buttons.0.text'),
            },
          ],
        },
        {
          __typename: 'Text',
          _id: 'text-1',
          body: encoded('<p>Hello</p>', 'page-1'),
        },
      ],
    },
  });

  it('adds the entry id to text inside a list entry', () => {
    const out = annotateEditLinks(page());
    expect(link(out.Page.content[0].heading).searchParams.get('entry')).toBe(
      'hero-1',
    );
    // Visible text is unchanged.
    expect(
      vercelStegaSplit(out.Page.content[0].heading as string).cleaned,
    ).toBe('Welcome');
  });

  it('uses the nearest entry for nested lists', () => {
    const out = annotateEditLinks(page());
    const button = link(out.Page.content[0].buttons![0]!.text);
    expect(button.searchParams.get('entry')).toBe('btn-1');
    expect(button.searchParams.get('field')).toBe('content.0.buttons.0.text');
  });

  it("gives a Text entry's link its field path", () => {
    const out = annotateEditLinks(page());
    const text = link(out.Page.content[1].body);
    expect(text.searchParams.get('entry')).toBe('text-1');
    expect(text.searchParams.get('field')).toBe('content.1');
  });

  it('names the field by its API name under an alias', () => {
    const data = {
      Page: {
        _id: 'page-1',
        blocks: [
          { __typename: 'Text', _id: 'text-1', body: encoded('Hi', 'page-1') },
        ],
      },
    };
    const out = annotateEditLinks(
      data,
      '{ Page { _id blocks: content { ... on Text { _id body } } } }',
    );
    expect(link(out.Page.blocks[0].body).searchParams.get('field')).toBe(
      'content.0',
    );
  });

  it('leaves text outside list entries, and plain text, untouched', () => {
    const data = page();
    const out = annotateEditLinks(data);
    expect(out.Page.title).toBe(data.Page.title);
    const plain = {
      Page: { _id: 'p', content: [{ _id: 'x', body: 'plain' }] },
    };
    expect(annotateEditLinks(plain)).toBe(plain);
  });

  it('does not add a field when the link points at another item', () => {
    const data = {
      Page: {
        _id: 'page-1',
        content: [{ _id: 'text-1', body: encoded('Hi', 'other-item') }],
      },
    };
    const url = link(annotateEditLinks(data).Page.content[0].body);
    expect(url.searchParams.get('entry')).toBe('text-1');
    expect(url.searchParams.has('field')).toBe(false);
  });

  it('is idempotent', () => {
    const once = annotateEditLinks(page());
    expect(annotateEditLinks(once)).toBe(once);
  });
});
