// @vitest-environment node
import { buildSchema, parse, print, validate } from 'graphql';
import { describe, expect, it } from 'vitest';

import { normalizeQuery } from '../core/live-preview/normalize-query';
import { addPreprIds, createPreprIds, preprIds } from './index';

// The shapes that matter in a Prepr schema: models and components carry
// `_id`; collections, the root and helper types like `_FocalPoint` do not;
// dynamic content and references are unions.
const SDL = `
  interface Model { _id: String! }
  interface Component { _id: String! }
  type _FocalPoint { x: Int y: Int }
  type Asset { _id: String! url: String focal_point: _FocalPoint }
  type Hero implements Component { _id: String! title: String image: Asset }
  type Text { _id: String! body: String }
  union Page_Sections = Hero | Text
  type Page implements Model {
    _id: String!
    title: String
    sections: [Page_Sections!]!
    seo: SEO
  }
  type SEO implements Component { _id: String! title: String }
  type Pages { items: [Page!]! total: Int! }
  type Query { Page(slug: String): Page Pages(limit: Int): Pages }
`;
const schema = buildSchema(SDL);

function run(query: string, typename = true): string {
  const document = addPreprIds(parse(query), schema, { typename });
  expect(validate(schema, document)).toEqual([]);
  return print(document);
}

describe('addPreprIds', () => {
  it('adds only _id by default, leaving union types as they are', () => {
    const document = addPreprIds(
      parse(`{ Page { sections { ... on Hero { title } } } }`),
      schema,
    );
    expect(validate(schema, document)).toEqual([]);
    const out = print(document);
    expect(out.match(/_id/g)).toHaveLength(2);
    expect(out).not.toContain('__typename');
  });

  it('adds _id and __typename on every level that has them', () => {
    expect(run(`query { Page(slug: "/") { title seo { title } } }`))
      .toMatchInlineSnapshot(`
      "{
        Page(slug: "/") {
          _id
          __typename
          title
          seo {
            _id
            __typename
            title
          }
        }
      }"
    `);
  });

  it('puts _id inside the members of a union, never on the union', () => {
    expect(
      run(
        `{ Page { sections { ... on Hero { title } ... on Text { body } } } }`,
      ),
    ).toMatchInlineSnapshot(`
      "{
        Page {
          _id
          __typename
          sections {
            __typename
            ... on Hero {
              _id
              __typename
              title
            }
            ... on Text {
              _id
              __typename
              body
            }
          }
        }
      }"
    `);
  });

  it('skips _id on collections and helper types without one', () => {
    expect(run(`{ Pages { items { image: title } total } }`))
      .toMatchInlineSnapshot(`
      "{
        Pages {
          __typename
          items {
            _id
            __typename
            image: title
          }
          total
        }
      }"
    `);
    const focal = run(
      `{ Page { sections { ... on Hero { image { focal_point { x } } } } } }`,
    );
    expect(focal).toContain('focal_point {\n');
    expect(focal).not.toMatch(/focal_point \{\s+_id/);
  });

  it('leaves fields already selected alone', () => {
    const out = run(`{ Page { __typename _id title } }`);
    expect(out.match(/_id/g)).toHaveLength(1);
    expect(out.match(/__typename/g)).toHaveLength(1);
  });

  it('adds _id when it is only selected under an alias', () => {
    expect(run(`{ Page { id: _id } }`)).toMatch(
      /_id\n\s+__typename\n\s+id: _id/,
    );
  });

  it('covers fragments', () => {
    expect(
      run(
        `fragment HeroParts on Hero { title } { Page { sections { ...HeroParts } } }`,
      ),
    ).toMatch(/fragment HeroParts on Hero \{\n\s+_id\n\s+__typename\n\s+title/);
  });

  // A second `_id` next to the spread sits outside the fragment's masked
  // type, so `makeFragmentData` alone no longer builds the parent.
  it('leaves _id to a fragment spread on the same type', () => {
    expect(
      run(
        `fragment PageParts on Page { title } { Page { ...PageParts } }`,
        false,
      ),
    ).toMatchInlineSnapshot(`
      "fragment PageParts on Page {
        _id
        title
      }

      {
        Page {
          ...PageParts
        }
      }"
    `);
  });

  it('leaves _id to a fragment on an interface the type implements', () => {
    const out = run(
      `fragment Ids on Model { __typename } { Page { ...Ids title } }`,
      false,
    );
    expect(out.match(/_id/g)).toHaveLength(1);
    expect(out).toMatch(/fragment Ids on Model \{\n\s+_id/);
  });

  it('still adds _id next to a spread that does not cover the type', () => {
    // Behind a directive the fragment can be left out of the response.
    expect(
      run(
        `fragment PageParts on Page { title }
         query ($full: Boolean!) { Page { ...PageParts @include(if: $full) } }`,
        false,
      ),
    ).toMatch(/Page \{\n\s+_id\n\s+\.\.\.PageParts/);
    // A fragment on one member says nothing about the interface.
    const schemaWithNode = buildSchema(
      SDL + ` extend type Query { node: Model }`,
    );
    const document = addPreprIds(
      parse(`fragment PageParts on Page { title } { node { ...PageParts } }`),
      schemaWithNode,
    );
    expect(validate(schemaWithNode, document)).toEqual([]);
    expect(print(document)).toMatch(/node \{\n\s+_id\n\s+\.\.\.PageParts/);
    // A fragment the document does not define.
    expect(
      print(addPreprIds(parse(`{ Page { ...Elsewhere } }`), schema)),
    ).toMatch(/Page \{\n\s+_id\n\s+\.\.\.Elsewhere/);
  });

  it('selects an optional _id behind @include(if: true)', () => {
    const document = addPreprIds(
      parse(`{ Page { title seo { _id title } } }`),
      schema,
      { optionalInTypes: true },
    );
    expect(validate(schema, document)).toEqual([]);
    expect(print(document)).toMatchInlineSnapshot(`
      "{
        Page {
          _id @include(if: true)
          title
          seo {
            _id
            title
          }
        }
      }"
    `);
  });

  it('keeps live preview working on a query with an optional _id', () => {
    const document = addPreprIds(parse(`{ Page { title } }`), schema, {
      optionalInTypes: true,
    });
    const next = normalizeQuery(
      document,
      { Page: { _id: 'p1', title: 'Stored' } },
      {
        log: [{ type: 'field', itemId: 'p1', field: 'title', value: 'Typed' }],
      },
    );
    expect(next).toEqual({ Page: { _id: 'p1', title: 'Typed' } });
  });
});

describe('preprIds (codegen document transform)', () => {
  it('transforms every document against the SDL codegen passes', () => {
    const [file, empty] = preprIds.transform({
      documents: [
        { location: 'page.graphql', document: parse(`{ Page { title } }`) },
        { location: 'empty.graphql' },
      ],
      schema: parse(SDL),
    });
    expect(file.location).toBe('page.graphql');
    expect(print(file.document!)).toContain('_id');
    expect(empty).toEqual({ location: 'empty.graphql' });
  });

  it('passes options through createPreprIds', () => {
    const [file] = createPreprIds({ typename: true }).transform({
      documents: [{ document: parse(`{ Page { title } }`) }],
      schema: parse(SDL),
    });
    expect(print(file!.document!)).toContain('__typename');
  });

  it('finds the fragment a query spreads in another file', () => {
    const [query, fragment] = createPreprIds({
      optionalInTypes: true,
    }).transform({
      documents: [
        { document: parse(`{ Page { ...PageParts } }`) },
        { document: parse(`fragment PageParts on Page { title }`) },
      ],
      schema: parse(SDL),
    });
    expect(print(query!.document!)).not.toContain('_id');
    expect(print(fragment!.document!)).toContain('_id @include(if: true)');
  });
});
