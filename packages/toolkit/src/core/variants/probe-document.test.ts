// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { toAbProbeDocument } from './probe-document';
import { compact } from './test-fixtures';

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
