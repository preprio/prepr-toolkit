// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { normalizeQuery, parsePatchLog } from './normalize-query';

// Shaped after a real marketing site's page query: sections in a stack,
// a single text-group component inside a section, an aliased enum, dynamic
// content with text and assets entries, and an interface condition.
const PAGE_QUERY = /* GraphQL */ `
  query Page($slug: String!) {
    Page(slug: $slug) {
      _id
      _slug
      sections {
        __typename
        ... on Component {
          _id
        }
        ...SideBySide
        ...ContentSection
      }
    }
  }

  fragment SideBySide on SideBySide {
    _id
    background
    image {
      url
      width
      height
    }
    content {
      __typename
      ... on TextGroup {
        ...TextGroup
      }
    }
  }

  fragment TextGroup on TextGroup {
    _id
    headline
    headline_style
    content {
      __typename
      ... on Text {
        ...TextContent
      }
    }
    ctas {
      ...Button
    }
  }

  fragment TextContent on Text {
    _id
    body
    format
    text
  }

  fragment Button on Button {
    _id
    value
    link {
      __typename
      ... on Page {
        _slug
      }
    }
  }

  fragment ContentSection on Content {
    _id
    background
    blocks {
      __typename
      ... on LogoGroup {
        ...LogoGroupBlock
      }
      ... on RichContent {
        ...RichContentBlock
      }
    }
    content_width
  }

  fragment LogoGroupBlock on LogoGroup {
    _id
    internal_title
    logoStyle: style
    logos {
      _id
      full_color {
        url
        width
        height
      }
    }
  }

  fragment RichContentBlock on RichContent {
    _id
    content {
      __typename
      ... on Text {
        ...TextContent
      }
      ... on Assets {
        items {
          _id
          url(width: 1000)
          thumb: url(width: 200)
          caption
        }
      }
    }
  }
`;

function pageResult() {
  return {
    Page: {
      _id: 'page-1',
      _slug: 'home',
      sections: [
        {
          __typename: 'SideBySide',
          _id: 'sbs-1',
          background: 'WHITE',
          image: { url: 'https://cdn/a.jpg', width: 800, height: 600 },
          content: {
            __typename: 'TextGroup',
            _id: 'sha1-of-component',
            headline: 'Headless CMS',
            headline_style: 'H2',
            content: [
              {
                __typename: 'Text',
                _id: 'text-1',
                body: '<p>Intro</p>',
                format: null,
                text: 'Intro',
              },
            ],
            ctas: [
              {
                _id: 'btn-1',
                value: 'Try free',
                link: { __typename: 'Page', _slug: 'signup' },
              },
            ],
          },
        },
        {
          __typename: 'Content',
          _id: 'content-1',
          background: 'GRAY',
          content_width: 'DEFAULT',
          blocks: [
            {
              __typename: 'LogoGroup',
              _id: 'logos-1',
              internal_title: 'Customers',
              logoStyle: 'COLOR',
              logos: [
                {
                  _id: 'logo-1',
                  full_color: {
                    url: 'https://cdn/l1.svg',
                    width: 1,
                    height: 1,
                  },
                },
              ],
            },
            {
              __typename: 'RichContent',
              _id: 'rich-1',
              content: [
                {
                  __typename: 'Text',
                  _id: 'text-2',
                  body: '<p>One</p>',
                  format: null,
                  text: 'One',
                },
                {
                  __typename: 'Assets',
                  items: [
                    {
                      _id: 'asset-1',
                      url: 'https://cdn/w_1000/x.jpg',
                      thumb: 'https://cdn/w_200/x.jpg',
                      caption: 'Old',
                    },
                  ],
                },
                {
                  __typename: 'Text',
                  _id: 'text-3',
                  body: '<p>Two</p>',
                  format: null,
                  text: 'Two',
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

describe('normalizeQuery', () => {
  it('returns the result untouched without a log, without reading the query', () => {
    const result = pageResult();
    expect(normalizeQuery('not { graphql', result)).toBe(result);
    expect(normalizeQuery('not { graphql', result, { log: [] })).toBe(result);
  });

  it('patches a single component through the item that holds it', () => {
    const result = pageResult();
    const next = normalizeQuery(PAGE_QUERY, result, {
      log: [
        {
          type: 'field',
          itemId: 'sbs-1',
          field: 'content.headline_style',
          value: 'H1',
        },
      ],
    });
    expect(next.Page.sections[0].content?.headline_style).toBe('H1');
    expect(result.Page.sections[0].content?.headline_style).toBe('H2');
    // Only the path to the change is cloned.
    expect(next.Page.sections[1]).toBe(result.Page.sections[1]);
    expect(next.Page.sections[0].image).toBe(result.Page.sections[0].image);
  });

  it('accepts the editor API id spelling of a field', () => {
    const next = normalizeQuery(PAGE_QUERY, pageResult(), {
      log: [
        {
          type: 'field',
          itemId: 'sbs-1',
          field: 'content.headlineStyle',
          value: 'H3',
        },
      ],
    });
    expect(next.Page.sections[0].content?.headline_style).toBe('H3');
  });

  it('writes a field selected under an alias to the alias', () => {
    const next = normalizeQuery(PAGE_QUERY, pageResult(), {
      log: [
        { type: 'field', itemId: 'logos-1', field: 'style', value: 'MONO' },
      ],
    });
    const logos = next.Page.sections[1].blocks?.[0] as Record<string, unknown>;
    expect(logos.logoStyle).toBe('MONO');
    expect('style' in logos).toBe(false);
  });

  it('writes every alias of the same field', () => {
    const next = normalizeQuery(PAGE_QUERY, pageResult(), {
      log: [
        {
          type: 'field',
          itemId: 'asset-1',
          field: 'url',
          value: 'https://cdn/y.jpg',
        },
      ],
    });
    const assets = next.Page.sections[1].blocks?.[1].content?.[1] as {
      items: Array<{ url: string; thumb: string }>;
    };
    expect(assets.items[0].url).toBe('https://cdn/y.jpg');
    expect(assets.items[0].thumb).toBe('https://cdn/y.jpg');
  });

  it('patches a dynamic content entry by position below its owner', () => {
    const next = normalizeQuery(PAGE_QUERY, pageResult(), {
      log: [
        {
          type: 'field',
          itemId: 'rich-1',
          field: 'content.2.body',
          value: '<p>Changed</p>',
        },
      ],
    });
    expect(next.Page.sections[1].blocks?.[1].content?.[2].body).toBe(
      '<p>Changed</p>',
    );
  });

  it('accepts zero-padded indexes and editor list containers', () => {
    const next = normalizeQuery(PAGE_QUERY, pageResult(), {
      log: [
        {
          type: 'field',
          itemId: 'logos-1',
          field: 'logos.items.000.items.full_color',
          value: { url: 'https://cdn/l2.svg', width: 2, height: 2 },
        },
      ],
    });
    const logos = next.Page.sections[1].blocks?.[0] as {
      logos: Array<{ full_color: { url: string; width: number } }>;
    };
    expect(logos.logos[0].full_color).toEqual({
      url: 'https://cdn/l2.svg',
      width: 2,
      height: 2,
    });
  });

  it('patches every occurrence of an item', () => {
    const result = pageResult();
    const duplicate = { ...result.Page.sections[0] };
    result.Page.sections.push(duplicate as never);
    const next = normalizeQuery(PAGE_QUERY, result, {
      log: [
        { type: 'field', itemId: 'sbs-1', field: 'background', value: 'DARK' },
      ],
    });
    expect(next.Page.sections[0].background).toBe('DARK');
    expect(next.Page.sections[2].background).toBe('DARK');
  });

  it('applies the log in order, the latest value winning', () => {
    const next = normalizeQuery(PAGE_QUERY, pageResult(), {
      log: [
        { type: 'field', itemId: 'btn-1', field: 'value', value: 'A' },
        { type: 'field', itemId: 'btn-1', field: 'value', value: 'B' },
      ],
    });
    expect(next.Page.sections[0].content?.ctas?.[0].value).toBe('B');
  });

  it('leaves fields the query did not select alone', () => {
    const result = pageResult();
    const next = normalizeQuery(PAGE_QUERY, result, {
      log: [
        {
          type: 'field',
          itemId: 'sbs-1',
          field: 'image_position',
          value: 'LEFT',
        },
      ],
    });
    expect(next).toBe(result);
  });

  it('reorders a dynamic content list and keeps patching by id afterwards', () => {
    const result = pageResult();
    const next = normalizeQuery(PAGE_QUERY, result, {
      log: [
        {
          type: 'list',
          itemId: 'rich-1',
          field: 'content',
          entries: [
            { _id: 'text-3', __typename: 'Text' },
            { _id: 'asset-1', __typename: 'Assets' },
            { _id: 'text-2', __typename: 'Text' },
          ],
        },
        {
          type: 'field',
          itemId: 'text-2',
          field: 'body',
          value: '<p>Moved</p>',
        },
      ],
    });
    const content = next.Page.sections[1].blocks?.[1].content as Array<{
      _id?: string;
      body?: string;
    }>;
    expect(content.map((c) => c._id ?? 'assets')).toEqual([
      'text-3',
      'assets',
      'text-2',
    ]);
    expect(content[2].body).toBe('<p>Moved</p>');
    // The moved entries are the same objects, so their rendering is reused.
    expect(content[0]).toBe(result.Page.sections[1].blocks?.[1].content?.[2]);
  });

  it('keeps the response envelope', () => {
    const response = { data: pageResult(), errors: [{ message: 'partial' }] };
    const next = normalizeQuery(PAGE_QUERY, response, {
      log: [
        { type: 'field', itemId: 'page-1', field: '_slug', value: 'start' },
      ],
    });
    expect(next.data.Page._slug).toBe('start');
    expect(next.errors).toBe(response.errors);
    expect(response.data.Page._slug).toBe('home');
  });

  it('reads a graphql-js DocumentNode', () => {
    const doc = {
      kind: 'Document',
      definitions: [
        {
          kind: 'OperationDefinition',
          operation: 'query',
          name: { kind: 'Name', value: 'Logos' },
          selectionSet: {
            kind: 'SelectionSet',
            selections: [
              {
                kind: 'Field',
                name: { kind: 'Name', value: 'LogoGroup' },
                arguments: [],
                selectionSet: {
                  kind: 'SelectionSet',
                  selections: [
                    {
                      kind: 'FragmentSpread',
                      name: { kind: 'Name', value: 'L' },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          kind: 'FragmentDefinition',
          name: { kind: 'Name', value: 'L' },
          typeCondition: {
            kind: 'NamedType',
            name: { kind: 'Name', value: 'LogoGroup' },
          },
          selectionSet: {
            kind: 'SelectionSet',
            selections: [
              { kind: 'Field', name: { kind: 'Name', value: '_id' } },
              {
                kind: 'Field',
                alias: { kind: 'Name', value: 'logoStyle' },
                name: { kind: 'Name', value: 'style' },
              },
            ],
          },
        },
      ],
    } as const;
    const next = normalizeQuery(
      doc,
      { LogoGroup: { _id: 'logos-1', logoStyle: 'COLOR' } },
      {
        log: [
          { type: 'field', itemId: 'logos-1', field: 'style', value: 'MONO' },
        ],
      },
    );
    expect(next.LogoGroup.logoStyle).toBe('MONO');
  });

  it('reads a string-like document such as a typed document string', () => {
    const doc = new String('{ Post { _id title } }');
    const next = normalizeQuery(
      doc,
      { Post: { _id: 'p', title: 'Old' } },
      { log: [{ type: 'field', itemId: 'p', field: 'title', value: 'New' }] },
    );
    expect(next.Post.title).toBe('New');
  });

  it('falls back to literal paths when the query cannot be read', () => {
    const next = normalizeQuery(
      'this is not graphql {',
      { Post: { _id: 'p', title: 'Old' } },
      { log: [{ type: 'field', itemId: 'p', field: 'title', value: 'New' }] },
    );
    expect(next.Post.title).toBe('New');
  });

  it('accepts the log as JSON text', () => {
    const next = normalizeQuery(PAGE_QUERY, pageResult(), {
      log: JSON.stringify([
        { type: 'field', itemId: 'page-1', field: '_slug', value: 'json' },
      ]),
    });
    expect(next.Page._slug).toBe('json');
  });
});

describe('parsePatchLog', () => {
  it('drops malformed and hostile entries and never throws', () => {
    expect(parsePatchLog(undefined)).toEqual([]);
    expect(parsePatchLog('{nope')).toEqual([]);
    expect(parsePatchLog({ type: 'field' })).toEqual([]);
    const log = parsePatchLog([
      { type: 'field', itemId: 'a', field: 'title', value: 'ok' },
      { type: 'field', itemId: '', field: 'title', value: 'x' },
      { type: 'field', itemId: 'a', field: 'title', value: () => 1 },
      {
        type: 'field',
        itemId: 'a',
        field: 'image',
        value: { url: 'javascript:alert(1)' },
      },
      {
        type: 'field',
        itemId: 'a',
        field: 'x',
        value: { __proto__: { a: 1 } },
      },
      { type: 'list', itemId: 'a', field: 'content', entries: [{ nope: 1 }] },
      { type: 'other', itemId: 'a', field: 'title', value: 'x' },
      null,
    ]);
    expect(log).toEqual([
      { type: 'field', itemId: 'a', field: 'title', value: 'ok' },
    ]);
  });

  it('ignores path segments that reach the prototype', () => {
    const result = { Post: { _id: 'p', title: 'Old' } };
    const next = normalizeQuery('{ Post { _id title } }', result, {
      log: [
        { type: 'field', itemId: 'p', field: '__proto__.polluted', value: 'x' },
        { type: 'field', itemId: 'p', field: 'constructor', value: 'x' },
      ],
    });
    expect(next).toBe(result);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps only the newest entries of an oversized log', () => {
    const log = Array.from({ length: 600 }, (_, i) => ({
      type: 'field',
      itemId: 'a',
      field: 'title',
      value: String(i),
    }));
    const parsed = parsePatchLog(log);
    expect(parsed).toHaveLength(500);
    expect(parsed.at(-1)).toMatchObject({ value: '599' });
  });
});

describe('normalizeQuery edit links', () => {
  it('keeps the hidden edit link of the text it replaces', async () => {
    const { vercelStegaCombine, vercelStegaSplit } =
      await import('@vercel/stega');
    const link = {
      origin: 'prepr.io',
      href: 'https://x.prepr.io/content/edit/p',
    };
    const result = {
      Post: { _id: 'p', title: vercelStegaCombine('Old', link) },
    };
    const next = normalizeQuery('{ Post { _id title } }', result, {
      log: [{ type: 'field', itemId: 'p', field: 'title', value: 'New' }],
    });
    const split = vercelStegaSplit(next.Post.title);
    expect(split.cleaned).toBe('New');
    expect(split.encoded).toBe(vercelStegaSplit(result.Post.title).encoded);
  });
});

describe('normalizeQuery new list entries', () => {
  const add = (entries: unknown[]) =>
    normalizeQuery(PAGE_QUERY, pageResult(), {
      log: [{ type: 'list', itemId: 'page-1', field: 'sections', entries }],
    });

  it('builds a new section in the shape the query selects for its type', () => {
    const next = add([
      { _id: 'sbs-1' },
      {
        _id: 'new-1',
        typeName: 'Side by side',
        fields: {
          background: 'DARK',
          content: {
            headline: 'Fresh',
            headline_style: 'H1',
            content: [
              {
                __typename: 'Text',
                _id: 't9',
                body: '<p>Hi</p>',
                format: null,
                text: 'Hi',
              },
            ],
          },
          image_position: 'LEFT',
        },
      },
      { _id: 'content-1' },
    ]);
    const sections = next.Page.sections as unknown as Array<
      Record<string, unknown>
    >;
    expect(sections.map((s) => s._id)).toEqual(['sbs-1', 'new-1', 'content-1']);
    expect(sections[1]).toEqual({
      __typename: 'SideBySide',
      _id: 'new-1',
      background: 'DARK',
      image: null,
      content: {
        __typename: 'TextGroup',
        _id: null,
        headline: 'Fresh',
        headline_style: 'H1',
        content: [
          {
            __typename: 'Text',
            _id: 't9',
            body: '<p>Hi</p>',
            format: null,
            text: 'Hi',
          },
        ],
        ctas: null,
      },
    });
  });

  it('builds nested list entries by their own type', () => {
    const next = add([
      { _id: 'sbs-1' },
      { _id: 'content-1' },
      {
        _id: 'content-2',
        __typename: 'Content',
        fields: {
          background: 'WHITE',
          blocks: [
            {
              __typename: 'LogoGroup',
              _id: 'lg-2',
              internal_title: 'New',
              style: 'GRAY',
            },
          ],
          content_width: 'NARROW',
        },
      },
    ]);
    const added = (
      next.Page.sections as unknown as Array<Record<string, unknown>>
    )[2];
    expect(added).toEqual({
      __typename: 'Content',
      _id: 'content-2',
      background: 'WHITE',
      blocks: [
        {
          __typename: 'LogoGroup',
          _id: 'lg-2',
          internal_title: 'New',
          logoStyle: 'GRAY',
          logos: null,
        },
      ],
      content_width: 'NARROW',
    });
  });

  it('leaves a new entry of a type the query does not know to the save', () => {
    const next = add([
      { _id: 'sbs-1' },
      { _id: 'x', typeName: 'Pricing table', fields: { title: 'x' } },
      { _id: 'content-1' },
    ]);
    expect(
      (next.Page.sections as Array<{ _id: string }>).map((s) => s._id),
    ).toEqual(['sbs-1', 'content-1']);
  });

  it('rejects hostile field values', () => {
    expect(
      parsePatchLog([
        {
          type: 'list',
          itemId: 'p',
          field: 'sections',
          entries: [
            { _id: 'n', fields: { image: { url: 'javascript:alert(1)' } } },
          ],
        },
      ]),
    ).toEqual([]);
  });
});

describe('normalizeQuery edits inside a new entry', () => {
  it('creates an empty nested component in the queried shape when an edit needs it', () => {
    const next = normalizeQuery(PAGE_QUERY, pageResult(), {
      log: [
        {
          type: 'list',
          itemId: 'page-1',
          field: 'sections',
          entries: [
            { _id: 'sbs-1' },
            { _id: 'content-1' },
            {
              _id: 'new-1',
              __typename: 'SideBySide',
              fields: { content: null },
            },
          ],
        },
        {
          type: 'field',
          itemId: 'new-1',
          field: 'content.headline',
          value: 'Typed',
        },
        {
          type: 'field',
          itemId: 'new-1',
          field: 'content.headlineStyle',
          value: 'H1',
        },
      ],
    });
    const added = (
      next.Page.sections as unknown as Array<Record<string, unknown>>
    )[2];
    expect(added.content).toEqual({
      __typename: 'TextGroup',
      _id: null,
      headline: 'Typed',
      headline_style: 'H1',
      content: null,
      ctas: null,
    });
  });

  it('does not invent objects for fields the query leaves out', () => {
    const result = pageResult();
    const next = normalizeQuery(PAGE_QUERY, result, {
      log: [
        { type: 'field', itemId: 'sbs-1', field: 'missing.title', value: 'x' },
      ],
    });
    expect(next).toBe(result);
  });
});

describe('normalizeQuery lists inside a new entry', () => {
  const addSection = {
    type: 'list',
    itemId: 'page-1',
    field: 'sections',
    entries: [
      { _id: 'sbs-1' },
      { _id: 'content-1' },
      { _id: 'new-1', __typename: 'SideBySide', fields: { content: null } },
    ],
  };

  it('adds the first stack entry to a list that is still empty', () => {
    const next = normalizeQuery(PAGE_QUERY, pageResult(), {
      log: [
        addSection,
        {
          type: 'list',
          itemId: 'new-1',
          field: 'content.ctas',
          entries: [
            { _id: 'btn-new', __typename: 'Button', fields: { value: 'Go' } },
          ],
        },
        { type: 'field', itemId: 'btn-new', field: 'value', value: 'Go now' },
      ],
    });
    const added = (
      next.Page.sections as unknown as Array<{ content: { ctas: unknown } }>
    )[2];
    expect(added.content.ctas).toEqual([
      { _id: 'btn-new', value: 'Go now', link: null },
    ]);
  });

  it('adds the first text block to dynamic content that is still empty', () => {
    const next = normalizeQuery(PAGE_QUERY, pageResult(), {
      log: [
        addSection,
        {
          type: 'list',
          itemId: 'new-1',
          field: 'content.content',
          entries: [
            {
              _id: 'tmp:1',
              __typename: 'Text',
              body: '<p>Test</p>',
              fields: { body: '<p>Test</p>', format: null, text: 'Test' },
            },
          ],
        },
        {
          type: 'field',
          itemId: 'tmp:1',
          field: 'body',
          value: '<p>Test 2</p>',
        },
      ],
    });
    const added = (
      next.Page.sections as unknown as Array<{ content: { content: unknown } }>
    )[2];
    expect(added.content.content).toEqual([
      {
        __typename: 'Text',
        _id: 'tmp:1',
        body: '<p>Test 2</p>',
        format: null,
        text: 'Test',
      },
    ]);
  });
});
