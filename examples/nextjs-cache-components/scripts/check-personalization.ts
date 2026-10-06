// Runnable check for the grouping logic: node --experimental-strip-types scripts/check-personalization.ts
import assert from 'node:assert/strict';
import {
  DEFAULT_VARIANT,
  decisionsByGroup,
  pickVariants,
  toBlocks,
  type VariantElement,
} from '../src/lib/personalization.ts';

const el = (
  id: string,
  ctx?: { kind: string; group_id: string; variant_id: string },
) =>
  ({
    __typename: 'Hero',
    _id: id,
    ...(ctx && { _context: ctx }),
  }) as unknown as VariantElement;
const p = (group: string, variant: string) => ({
  kind: 'PERSONALIZATION',
  group_id: group,
  variant_id: variant,
});

// `personalize: false` content: a plain section, a group with NO default
// variant (only "small companies"), then a group with a default.
const content = [
  el('intro'),
  el('banner-small', p('g-banner', 'SMALL-COMPANIES')),
  el('hero-default', p('g-hero', DEFAULT_VARIANT)),
  el('hero-acme', p('g-hero', 'ACME-CORP')),
];
const blocks = toBlocks(content);
assert.deepEqual(
  blocks.map((b) => (b.kind === 'plain' ? 'plain' : b.groupId)),
  ['plain', 'g-banner', 'g-hero'],
);

const banner = blocks[1];
// Not targeted: the default variant is empty, so the fallback renders nothing...
assert.deepEqual(pickVariants(banner.elements, [DEFAULT_VARIANT]), []);
// ...but the group still has a boundary, so a targeted visitor gets the banner.
const decisions = decisionsByGroup([
  { _context: p('g-banner', 'SMALL-COMPANIES') },
  { _context: p('g-hero', 'ACME-CORP') },
]);
assert.deepEqual(
  pickVariants(banner.elements, decisions.get('g-banner')!).map((e) => e._id),
  ['banner-small'],
);
// Several segments: each group resolves on its own.
assert.deepEqual(
  pickVariants(blocks[2].elements, decisions.get('g-hero')!).map((e) => e._id),
  ['hero-acme'],
);
console.log('personalization grouping: ok');
