// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { toDecisionQuery, toVariantsQuery } from './queries';
import { PAGE_QUERY, schema } from './test-fixtures';

describe('toVariantsQuery', () => {
  it('returns the minified variants query as a string', () => {
    const query = toVariantsQuery(PAGE_QUERY, schema);
    expect(typeof query).toBe('string');
    expect(query).toContain('content(personalize:false)');
    expect(query).toContain(
      '_preprContext:_context{kind group_id variant_id variant_key}',
    );
    expect(query).not.toMatch(/\n/);
  });

  it('leaves a query without personalizable fields as it is, minified', () => {
    expect(toVariantsQuery('{ Page(slug: "/") { title } }', schema)).toBe(
      '{Page(slug:"/"){title}}',
    );
  });
});

describe('toDecisionQuery', () => {
  it('asks about every personalizable list without `from`', () => {
    const query = toDecisionQuery(PAGE_QUERY, schema)!;
    expect(query).toContain('_preprContext:_context{...c}');
    expect(query).not.toContain('heading');
  });

  it('narrows to the groups the variants result holds with `from`', () => {
    const from = {
      Page: {
        content: [
          {
            _preprType: 'Hero',
            _preprContext: {
              kind: 'PERSONALIZATION',
              group_id: 'g',
              variant_id: 'X',
            },
          },
        ],
      },
    };
    const query = toDecisionQuery(PAGE_QUERY, schema, { from })!;
    expect(query).toContain('...on Hero{_preprContext:_context');
    expect(query).not.toContain('cards');
  });

  it('is null when there is nothing to decide', () => {
    expect(toDecisionQuery('{ Page(slug: "/") { title } }', schema)).toBeNull();
    expect(
      toDecisionQuery(PAGE_QUERY, schema, { from: { Page: { content: [] } } }),
    ).toBeNull();
  });
});
