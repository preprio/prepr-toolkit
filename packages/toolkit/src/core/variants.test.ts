// @vitest-environment node
import { parse } from 'graphql';
import { print } from 'graphql/language/printer.js';
import { describe, expect, it } from 'vitest';

import {
  PREPR_CONTEXT_ALIAS as CTX,
  PREPR_DEFAULT_VARIANT,
  decisionsFrom,
  preprVariantProps,
  personalizationPaths,
  resolveVariants,
  splitStack,
  toAbProbeDocument,
  toDecisionDocument,
  toSchemaInfo,
  toVariantsDocument,
  type PreprSchemaInfo,
} from './variants';

// A slice of a real Prepr schema: a page stack of components, a component
// (Cards) with a nested stack of *models*, and a component with personalized
// buttons. Field arguments mark which fields are personalizable.
const ref = (name: string) => ({ name: null, ofType: { name } });
const field = (name: string, type: string, personalize = false) => ({
  name,
  args: personalize ? [{ name: 'personalize' }] : [],
  type: ref(type),
});
const schema: PreprSchemaInfo = toSchemaInfo({
  __schema: {
    queryType: { name: 'Query' },
    types: [
      {
        name: 'Query',
        fields: [{ ...field('Page', 'Page'), args: [{ name: 'slug' }] }],
      },
      {
        name: 'Page',
        fields: [
          field('_id', 'String'),
          field('_context', 'Context'),
          field('title', 'String'),
          field('content', 'Page_Content', true),
        ],
      },
      {
        name: 'Page_Content',
        possibleTypes: [
          { name: 'Hero' },
          { name: 'Cards' },
          { name: 'Banner' },
        ],
      },
      {
        name: 'Hero',
        fields: [
          field('_id', 'String'),
          field('_context', 'Context'),
          field('heading', 'String'),
          field('buttons', 'Button', true),
        ],
      },
      {
        name: 'Button',
        fields: [field('_context', 'Context'), field('text', 'String')],
      },
      {
        name: 'Cards',
        fields: [
          field('_id', 'String'),
          field('_context', 'Context'),
          field('cards', 'Cards_Cards', true),
        ],
      },
      {
        name: 'Cards_Cards',
        possibleTypes: [{ name: 'Post' }, { name: 'Product' }],
      },
      {
        name: 'Post',
        fields: [
          field('_id', 'String'),
          field('_context', 'Context'),
          field('title', 'String'),
        ],
      },
      {
        name: 'Product',
        fields: [
          field('_id', 'String'),
          field('_context', 'Context'),
          field('name', 'String'),
        ],
      },
      // No _context: never gets a context selection.
      { name: 'Banner', fields: [field('text', 'String')] },
      {
        name: 'Context',
        fields: [
          field('kind', 'String'),
          field('group_id', 'String'),
          field('variant_id', 'String'),
          field('variant_key', 'String'),
        ],
      },
    ],
  },
});

const PAGE_QUERY = /* GraphQL */ `
  query GetPage($slug: String, $unused: String) {
    Page(slug: $slug) {
      title
      content {
        __typename
        ... on Hero {
          heading
          _context {
            variant_key
          }
          buttons {
            text
          }
        }
        ... on Cards {
          ...CardsFields
        }
      }
    }
  }
  fragment CardsFields on Cards {
    cards {
      ... on Post {
        title
      }
      ... on Product {
        name
      }
    }
  }
`;

const compact = (document: unknown) =>
  print(document as never).replace(/\s+/g, ' ');

describe('toVariantsDocument', () => {
  const printed = compact(toVariantsDocument(PAGE_QUERY, schema));

  it('adds personalize: false to every personalizable field, at any depth', () => {
    expect(printed).toContain('content(personalize: false)');
    expect(printed).toContain('buttons(personalize: false)');
    expect(printed).toContain('cards(personalize: false)');
    expect(printed.match(/personalize: false/g)).toHaveLength(3);
  });

  it('selects _context under an alias on every item type, models included', () => {
    const ctxOf = (type: string) =>
      `... on ${type} { ${CTX}: _context { kind group_id variant_id variant_key } _preprType: __typename }`;
    expect(printed).toContain(ctxOf('Post'));
    expect(printed).toContain(ctxOf('Product'));
    expect(printed).toContain(ctxOf('Hero'));
    expect(printed).not.toContain('... on Banner {');
  });

  it("keeps the caller's own fields and _context selection", () => {
    expect(printed).toContain('_context { variant_key }');
    expect(printed).toContain('heading');
    expect(() =>
      parse(print(toVariantsDocument(PAGE_QUERY, schema))),
    ).not.toThrow();
  });
});

describe('toDecisionDocument', () => {
  const decision = toDecisionDocument(PAGE_QUERY, schema);
  const printed = compact(decision);

  it('keeps only the paths to personalizable fields, with item contexts', () => {
    expect(printed).not.toContain('title');
    expect(printed).not.toContain('heading');
    expect(printed).not.toContain('variant_key');
    expect(printed).toContain('Page(slug: $slug)');
    expect(printed).toContain(`buttons { ${CTX}: _context`);
    expect(printed).toContain(`... on Post { ${CTX}: _context`);
  });

  it('leaves the variant key out: only rendering needs it', () => {
    expect(printed).toContain(`${CTX}: _context { kind group_id variant_id }`);
  });

  it('inlines fragments and drops unused variables', () => {
    expect(printed).not.toContain('fragment ');
    expect(printed).toContain('query GetPageDecision($slug: String)');
    expect(printed).not.toContain('$unused');
  });

  it('is null when nothing in the query is personalizable', () => {
    expect(
      toDecisionDocument('{ Page(slug: "/") { title } }', schema),
    ).toBeNull();
  });
});

describe('resolving variants', () => {
  const ctx = (kind: string, group: string, variant: string) => ({
    [CTX]: { kind, group_id: group, variant_id: variant },
  });
  // A variants-query result: a group with a default, a group WITHOUT a
  // default (only "small companies"), an A/B group, and a plain Cards item
  // whose nested model stack is personalized.
  const content = [
    {
      _id: 'hero-default',
      ...ctx('PERSONALIZATION', 'g-hero', PREPR_DEFAULT_VARIANT),
    },
    { _id: 'hero-acme', ...ctx('PERSONALIZATION', 'g-hero', 'ACME-CORP') },
    {
      _id: 'banner-small',
      ...ctx('PERSONALIZATION', 'g-banner', 'SMALL-COMPANIES'),
    },
    { _id: 'cta-a', ...ctx('AB_TEST', 'g-cta', 'A') },
    { _id: 'cta-b', ...ctx('AB_TEST', 'g-cta', 'B') },
    {
      _id: 'cards',
      cards: [
        {
          _id: 'post-default',
          ...ctx('PERSONALIZATION', 'g-posts', PREPR_DEFAULT_VARIANT),
        },
        {
          _id: 'post-small',
          ...ctx('PERSONALIZATION', 'g-posts', 'SMALL-COMPANIES'),
        },
      ],
    },
    { _id: 'plain' },
  ];
  const ids = (items: { _id: string }[]) => items.map((item) => item._id);

  it('shows defaults and the A/B bucket without decisions', () => {
    const resolved = resolveVariants(content, { bucket: 'B' });
    expect(ids(resolved)).toEqual(['hero-default', 'cta-b', 'cards', 'plain']);
    expect(ids(resolved[2]!.cards!)).toEqual(['post-default']);
  });

  it('applies decisions per group, at any depth, for a visitor in several segments', () => {
    const decisions = decisionsFrom({
      Page: {
        content: [
          ctx('PERSONALIZATION', 'g-hero', 'ACME-CORP'),
          ctx('PERSONALIZATION', 'g-banner', 'SMALL-COMPANIES'),
          { cards: [ctx('PERSONALIZATION', 'g-posts', 'SMALL-COMPANIES')] },
        ],
      },
    });
    const resolved = resolveVariants(content, { decisions, bucket: 'A' });
    // The banner has no default variant and still appears for its segment.
    expect(ids(resolved)).toEqual([
      'hero-acme',
      'banner-small',
      'cta-a',
      'cards',
      'plain',
    ]);
    expect(ids(resolved[3]!.cards!)).toEqual(['post-small']);
  });

  it('splits a stack into blocks: segment groups stream, A/B groups switch', () => {
    const blocks = splitStack(content);
    expect(
      blocks.map((block) => [
        block.key,
        ids(block.items),
        block.personalized,
        block.abTest,
      ]),
    ).toEqual([
      ['group:g-hero', ['hero-default', 'hero-acme'], true, false],
      ['group:g-banner', ['banner-small'], true, false],
      ['group:g-cta', ['cta-a', 'cta-b'], false, true],
      // An item with a personalized nested stack varies per visitor.
      ['items:5', ['cards'], true, false],
      ['items:6', ['plain'], false, false],
    ]);
  });

  it('numbers blocks by rendered position: a group takes one slot', () => {
    // hero group (2 variants) → 0, banner group → 1, A/B group → 2,
    // cards → 3, plain → 4.
    expect(splitStack(content).map((block) => block.index)).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });
});

describe('decision pruned to the groups a page actually has', () => {
  const ctx = (kind: string, group: string, variant: string) => ({
    [CTX]: { kind, group_id: group, variant_id: variant },
  });

  it('finds the response paths of lists holding segment groups, at any depth', () => {
    const data = {
      Page: {
        content: [
          { ...ctx('AB_TEST', 'g-ab', 'A') },
          { cards: [{ ...ctx('PERSONALIZATION', 'g-posts', 'SMALL') }] },
          { buttons: [{ text: 'plain' }] },
        ],
      },
    };
    expect([...personalizationPaths(data)]).toEqual([
      ['Page.content.cards', new Set(['*'])],
    ]);
  });

  it('keeps only the fields on those paths', () => {
    const printed = compact(
      toDecisionDocument(
        PAGE_QUERY,
        schema,
        new Map([['Page.content.cards', new Set(['*'])]]),
      ),
    );
    // The path down to the cards is kept, as plain traversal...
    expect(printed).toContain('Page(slug: $slug) { content {');
    expect(printed).toContain(`cards { ... on Post { ${CTX}: _context`);
    // ...but the stack itself is not asked about, and neither are buttons.
    expect(printed).not.toContain(`... on Hero { ${CTX}`);
    expect(printed).not.toContain('buttons');
  });

  it('asks only about the item types that hold groups', () => {
    // Variants data from the toolkit's own query carries each item's type.
    const data = {
      Page: {
        content: [
          { _preprType: 'Hero', ...ctx('PERSONALIZATION', 'g-hero', 'X') },
          { _preprType: 'Banner' },
          { _preprType: 'Cards', cards: [{ _preprType: 'Post' }] },
        ],
      },
    };
    const paths = personalizationPaths(data);
    expect([...paths]).toEqual([['Page.content', new Set(['Hero'])]]);

    const printed = compact(toDecisionDocument(PAGE_QUERY, schema, paths));
    expect(printed).toContain(`... on Hero { ${CTX}: _context`);
    // Cards can appear in the stack too, but holds no group here.
    expect(printed).not.toContain(`... on Cards { ${CTX}`);
  });

  it('follows aliases in response paths', () => {
    const aliased = `query { Page(slug: "/") { body: content { ... on Hero { heading } } } }`;
    const printed = compact(
      toDecisionDocument(
        aliased,
        schema,
        new Map([['Page.body', new Set(['Hero'])]]),
      ),
    );
    expect(printed).toContain(`body: content { ... on Hero { ${CTX}`);
  });

  it('asks nothing when the page has no segment groups', () => {
    expect(toDecisionDocument(PAGE_QUERY, schema, new Map())).toBeNull();
  });
});

describe('toAbProbeDocument', () => {
  it('keeps every path to items, without leaves, fragments or unused variables', () => {
    const query = `
      query GetPage($slug: String, $width: Int) {
        Page(slug: $slug) {
          title
          cover { url(width: $width) }
          content { ... on Hero { heading } ...CardsFields }
        }
      }
      fragment CardsFields on Cards { cards { ... on Post { title } } }
    `;
    expect(compact(toAbProbeDocument(query))).toBe(
      'query GetPageAbCheck($slug: String) { __typename Page(slug: $slug) { __typename cover { __typename } content { __typename ... on Cards { __typename cards { __typename } } } } }',
    );
  });
});

describe('preprVariantProps', () => {
  it('gives a grouped item its variant key, and anything else nothing', () => {
    const item = {
      [CTX]: {
        kind: 'PERSONALIZATION',
        group_id: 'g',
        variant_id: 'X',
        variant_key: 'key-x',
      },
    };
    expect(preprVariantProps(item)).toEqual({
      'data-prepr-variant-key': 'key-x',
    });
    expect(preprVariantProps({ _id: 'plain' })).toEqual({});
    expect(preprVariantProps(null)).toEqual({});
  });
});

describe('toDecisionDocument topLevelOnly', () => {
  it('asks only about the first personalizable list on each path', () => {
    const printed = compact(
      toDecisionDocument(PAGE_QUERY, schema, undefined, { topLevelOnly: true }),
    );
    expect(printed).toContain(`content { ... on Hero { ${CTX}: _context`);
    // Lists nested in the items (buttons, cards) are left out.
    expect(printed).not.toContain('buttons');
    expect(printed).not.toContain('cards');
  });
});
