// @vitest-environment node
import { parse } from 'graphql';
import { print } from 'graphql/language/printer.js';
import { describe, expect, it } from 'vitest';

import { PREPR_CONTEXT_ALIAS as CTX } from './constants';
import { PAGE_QUERY, compact, schema } from './test-fixtures';
import { toVariantsDocument } from './variants-document';

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
