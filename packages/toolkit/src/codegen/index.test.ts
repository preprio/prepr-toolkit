// @vitest-environment node
import { buildSchema, parse, print, validate } from 'graphql';
import { describe, expect, it } from 'vitest';

import { addPreprIds, preprIds } from './index';

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

function run(query: string): string {
  const document = addPreprIds(parse(query), schema);
  expect(validate(schema, document)).toEqual([]);
  return print(document);
}

describe('addPreprIds', () => {
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
});
