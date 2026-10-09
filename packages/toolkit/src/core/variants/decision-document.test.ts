// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { PREPR_CONTEXT_ALIAS as CTX } from './constants';
import { toDecisionDocument } from './decision-document';
import { personalizationPaths } from './resolve';
import { PAGE_QUERY, compact, schema } from './test-fixtures';

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
