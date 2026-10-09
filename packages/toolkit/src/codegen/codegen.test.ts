// @vitest-environment node
import { buildSchema, parse } from 'graphql';
import { describe, expect, it } from 'vitest';

import { plugin } from './index';

// `personalize` on a field is what makes it personalizable.
const schema = buildSchema(/* GraphQL */ `
  type Query {
    Page(slug: String): Page
  }
  type Page {
    title: String
    content(personalize: Boolean): [Page_Content]
  }
  union Page_Content = Hero | Banner
  type Hero {
    heading: String
    _context: Context
  }
  type Banner {
    text: String
  }
  type Context {
    kind: String
    group_id: String
    variant_id: String
    variant_key: String
  }
`);

const doc = (source: string) => ({ document: parse(source) });

describe('codegen plugin', () => {
  it('writes the variants and decision query per named operation', () => {
    const out = plugin(schema, [
      doc(
        `query GetPage($slug: String) { Page(slug: $slug) { title content { ...HeroFields } } }`,
      ),
      doc(`fragment HeroFields on Hero { heading }`),
    ]);
    expect(out).toContain('export const GetPageVariantsQuery =');
    expect(out).toContain('export const GetPageDecisionQuery =');
    expect(out).toContain('content(personalize:false)');
    // The fragment from the other document is attached, because it is used.
    expect(out).toContain('fragment HeroFields on Hero');
  });

  it('attaches only the fragments an operation uses', () => {
    const out = plugin(schema, [
      doc(`query GetPage { Page(slug: "/") { content { ...HeroFields } } }`),
      doc(`fragment HeroFields on Hero { heading }`),
      doc(`fragment Unused on Banner { text }`),
    ]);
    expect(out).not.toContain('fragment Unused');
  });

  it('attaches fragments that other fragments use, and no unused ones', () => {
    const out = plugin(schema, [
      doc(`query GetPage { Page(slug: "/") { ...PageFields } }`),
      doc(`fragment PageFields on Page { content { ...HeroFields } }`),
      doc(`fragment HeroFields on Hero { heading }`),
      doc(`fragment Unused on Banner { text }`),
    ]);
    expect(out).toContain('fragment PageFields on Page');
    expect(out).toContain('fragment HeroFields on Hero');
    expect(out).not.toContain('fragment Unused');
  });

  it('skips operations without personalizable fields and anonymous ones', () => {
    const out = plugin(schema, [
      doc(`query Plain { Page(slug: "/") { title } }`),
      doc(`{ Page(slug: "/") { content { ... on Hero { heading } } } }`),
    ]);
    expect(out).not.toContain('PlainVariantsQuery');
    expect(out).not.toContain('VariantsQuery');
  });

  it('fails clearly when two operations share a name', () => {
    expect(() =>
      plugin(schema, [
        doc(
          `query GetPage { Page(slug: "/") { content { ... on Hero { heading } } } }`,
        ),
        doc(
          `query GetPage { Page(slug: "/a") { content { ... on Hero { heading } } } }`,
        ),
      ]),
    ).toThrow(/GetPage/);
  });
});
