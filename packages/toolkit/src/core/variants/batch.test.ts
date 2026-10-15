import { parse, print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { batchDocuments } from './batch';

const PAGE = parse(
  'query PageDecision($slug: String, $locale: String) { Page(slug: $slug, locale: $locale) { content { _context { group_id } } } }',
);

describe('batchDocuments', () => {
  it('merges two pages of the same query without their variables clashing', () => {
    const batch = batchDocuments([
      { document: PAGE, variables: { slug: '/', locale: 'en' } },
      { document: PAGE, variables: { slug: '/pricing' } },
    ]);
    const printed = print(batch.document);
    expect(printed).toContain(
      'p0_Page: Page(slug: $p0_slug, locale: $p0_locale)',
    );
    expect(printed).toContain(
      'p1_Page: Page(slug: $p1_slug, locale: $p1_locale)',
    );
    expect(printed).toContain('$p0_slug: String');
    expect(printed).toContain('$p1_locale: String');
    // An unset variable stays unset rather than becoming null.
    expect(batch.variables).toEqual({
      p0_slug: '/',
      p0_locale: 'en',
      p1_slug: '/pricing',
    });
  });

  it('keeps aliases and aliases fields inside root inline fragments', () => {
    const batch = batchDocuments([
      {
        document: parse(
          '{ home: Page { _id } ... on Query { nav: Navigation { _id } } }',
        ),
      },
    ]);
    const printed = print(batch.document);
    expect(printed).toContain('p0_home: Page');
    expect(printed).toContain('p0_nav: Navigation');
  });

  it('splits the answer back up per query, telling p1_ from p10_', () => {
    const batch = batchDocuments([]);
    const data = { p1_Page: 'one', p10_Page: 'ten', p1_nav: 'nav' };
    expect(batch.split(data, 1)).toEqual({ Page: 'one', nav: 'nav' });
    expect(batch.split(data, 10)).toEqual({ Page: 'ten' });
    expect(batch.split(null, 0)).toEqual({});
  });
});
