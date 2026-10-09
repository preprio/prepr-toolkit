import { contextOf } from './resolve';

/** The attribute Prepr's tracking pixel reads impressions and conversions from. */
export interface PreprVariantProps {
  'data-prepr-variant-key'?: string;
}

/**
 * Attributes that let Prepr's tracking pixel count impressions of this item's
 * variant, for an item from a query run with `variants: true`. Spread them on
 * the element that shows the item; an item outside any personalization or A/B
 * group gets none.
 *
 * Items rendered by the Next.js `PreprStack` are tagged for you. Reach for this
 * for items nested inside them (cards, buttons, models in a section) and in
 * frameworks without `PreprStack`.
 *
 * @example
 * <article {...preprVariantProps(card)}>…</article>
 */
export function preprVariantProps(item: unknown): PreprVariantProps {
  const key = contextOf(item)?.variant_key;
  return key ? { 'data-prepr-variant-key': key } : {};
}
