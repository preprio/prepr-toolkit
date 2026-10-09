// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { PREPR_CONTEXT_ALIAS as CTX, PREPR_DEFAULT_VARIANT } from './constants';
import { decisionsFrom, resolveVariants } from './resolve';
import { splitStack } from './stack';

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
