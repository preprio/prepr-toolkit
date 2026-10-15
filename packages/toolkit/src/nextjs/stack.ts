import {
  createElement,
  Fragment,
  type ReactElement,
  type ReactNode,
} from 'react';

import {
  PREPR_DEFAULT_VARIANT,
  preprVariantProps,
  resolveVariants,
  splitStack,
  type PreprDecisions,
} from '../core/variants';
import { contextOf } from '../core/variants/resolve';
import { applyPreprAbBucket, applyPreprDecisions } from './ab-switch';
import {
  PreprAbSwitch,
  PreprDecisionApplier,
  PreprVariantTracking,
} from './components';

export interface PreprStackProps<T> {
  /** A stack (e.g. `page.content`) from a query run with `variants: true`. */
  items: readonly T[];
  /**
   * Renders resolved stack items, e.g. your section switch. `index` is the
   * position of the block's first item in the whole stack, for anything that
   * depends on page position, such as which section owns the h1 or the
   * priority image.
   *
   * `defaultVariant` is false for the variants that are in the page but
   * hidden unless the visitor gets them: the other buckets of an A/B test and
   * the segment variants. Give only the default variant `priority` images,
   * and the others `loading="lazy"`: the browser downloads a hidden eager
   * image anyway, but skips a hidden lazy one.
   */
  render: (
    items: T[],
    position: { index: number; defaultVariant: boolean },
  ) => ReactNode;
  /**
   * The visitor's A/B bucket, when the route already knows it (for example
   * from a URL segment). Leave it out to render both variants of each A/B
   * test and pick the visitor's in the browser before first paint.
   */
  bucket?: string;
  /** Nonce for the inline scripts, under a strict CSP. */
  nonce?: string;
  /**
   * Tag each personalization and A/B variant for Prepr's tracking pixel, so
   * it counts impressions (and clicks on `data-prepr-variant-event` elements
   * inside) without `data-prepr-variant-key` in your components. Default
   * `false`.
   *
   * Each item's key goes on the element `render` returns for it, in order,
   * once the page has hydrated. Each variant gets a wrapper with
   * `display: contents`: it takes no box, but CSS child combinators (`>`) and
   * `:first-child` from the stack's parent no longer reach the sections. Lists
   * nested inside an item are not tagged; use `preprVariantProps` there.
   */
  trackVariants?: boolean;
}

const AB_ATTRIBUTE = 'data-prepr-ab';
const AB_BUCKETS = ['A', 'B'] as const;

// The variant wrappers never affect layout, and only A shows by default: what
// visitors without JavaScript, crawlers and anonymous visitors get.
const AB_BASE_CSS = `[${AB_ATTRIBUTE}]{display:contents}[${AB_ATTRIBUTE}]:not([${AB_ATTRIBUTE}="A"]){display:none}`;

// Runs while the HTML is parsed, so the visitor's variant is the first one
// painted. A hidden variant never reaches 50% visibility, so the tracking
// pixel never records an impression for it.
const AB_SWITCH_SCRIPT = `(${applyPreprAbBucket.toString()})();`;

const VARIANT_ATTRIBUTE = 'data-prepr-v';
const DEFAULT_ATTRIBUTE = 'data-prepr-default';
const NESTED_ATTRIBUTE = 'data-prepr-nested';

// Segment variants stay hidden until this view's decision shows one: no
// variant, the default included, paints before it is decided.
const GROUP_BASE_CSS = `[${VARIANT_ATTRIBUTE}]{display:none}[${VARIANT_ATTRIBUTE}][data-prepr-show]{display:contents}`;
// Without JavaScript nothing is decided: the default variants show.
const NOSCRIPT_HTML = `<style>[${VARIANT_ATTRIBUTE}][${DEFAULT_ATTRIBUTE}]{display:contents}</style>`;
// Defines the decision switch once per stack; each personalized block calls
// it right after its HTML, so the parser never paints it undecided.
const DECISION_SCRIPT = `window.__preprApply=${applyPreprDecisions.toString()};`;
const APPLY_SCRIPT = '__preprApply()';

type StackRender<T> = PreprStackProps<T>['render'];

function variantKeysOf(items: unknown[]): string[] {
  return items.flatMap((item) => {
    const key = preprVariantProps(item)['data-prepr-variant-key'];
    return key ? [key] : [];
  });
}

/**
 * Renders items for every A/B bucket the visitor might have, each in a
 * wrapper the switch script shows or hides; or for the known bucket only.
 */
function renderBuckets<T>(
  items: T[],
  render: StackRender<T>,
  options: {
    bucket?: string;
    decisions?: PreprDecisions;
    abTest: boolean;
    index: number;
    track?: boolean;
    defaultVariant?: boolean;
  },
): ReactNode {
  const {
    bucket,
    decisions,
    abTest,
    index,
    track,
    defaultVariant = true,
  } = options;
  const renderVariant = (variant: string | undefined, key?: string) => {
    const resolved = resolveVariants(items, { decisions, bucket: variant });
    const ab = abTest && !bucket ? variant : undefined;
    const content = render(resolved, {
      index,
      defaultVariant: defaultVariant && (ab === undefined || ab === 'A'),
    });
    const variantKeys = track ? variantKeysOf(resolved) : [];
    if (variantKeys.length > 0) {
      return createElement(
        PreprVariantTracking,
        { key, variantKeys, ab },
        content,
      );
    }
    if (ab) return createElement('div', { key, [AB_ATTRIBUTE]: ab }, content);
    return content;
  };
  if (!abTest || bucket) return renderVariant(bucket);
  return AB_BUCKETS.map((variant) => renderVariant(variant, variant));
}

/** Every segment group in `items`, at any depth, with its variants in order. */
function segmentGroups(items: unknown[]): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    const ctx = contextOf(value);
    if (ctx?.kind === 'PERSONALIZATION' && ctx.variant_id) {
      const variants = groups.get(ctx.group_id!) ?? new Set<string>();
      variants.add(ctx.variant_id);
      groups.set(ctx.group_id!, variants);
    }
    Object.values(value).forEach(walk);
  };
  walk(items);
  return groups;
}

/**
 * Every variant combination of one personalized block, each in a hidden
 * wrapper listing its `group:variant` pairs. A top-level group renders once
 * per variant. An item with groups nested inside renders once per
 * combination of their variants, the default included, since the item shows
 * for visitors in none of the segments too.
 */
function renderVariants<T>(
  block: { key: string; items: T[]; index: number; abTest: boolean },
  render: StackRender<T>,
  options: { bucket?: string; track?: boolean },
): ReactNode {
  const groups = segmentGroups(block.items);
  const top = block.key.startsWith('group:')
    ? block.key.slice('group:'.length)
    : undefined;
  const nested = !(top !== undefined && groups.size === 1);
  const choices = [...groups].map(([group, variants]) => {
    const ids = nested ? [PREPR_DEFAULT_VARIANT, ...variants] : [...variants];
    return [...new Set(ids)].map((variant) => [group, variant] as const);
  });
  const combinations = choices.reduce<(readonly [string, string])[][]>(
    (all, pairs) => all.flatMap((combo) => pairs.map((p) => [...combo, p])),
    [[]],
  );
  return combinations.map((combination) => {
    const pairs = combination.map(([group, variant]) => `${group}:${variant}`);
    const isDefault = combination.every(
      ([, variant]) => variant === PREPR_DEFAULT_VARIANT,
    );
    return createElement(
      'div',
      {
        key: pairs.join(' '),
        [VARIANT_ATTRIBUTE]: pairs.join(' '),
        ...(isDefault ? { [DEFAULT_ATTRIBUTE]: '' } : {}),
        ...(nested ? { [NESTED_ATTRIBUTE]: '' } : {}),
        // The decision script marks the shown wrapper before hydration.
        suppressHydrationWarning: true,
      },
      renderBuckets(block.items, render, {
        bucket: options.bucket,
        decisions: new Map(combination.map(([g, v]) => [g, [v]])),
        abTest: block.abTest,
        index: block.index,
        track: options.track,
        defaultVariant: isDefault,
      }),
    );
  });
}

/**
 * Renders a personalized stack, entirely in the prerendered page.
 *
 * - Items that never vary render as they are.
 * - A/B tests render once per bucket; a tiny inline script shows the
 *   visitor's bucket (from `resolvePreprBucket`'s cookie) before first paint.
 *   `A` is the default. Pass `bucket` instead when the route already knows it.
 * - Every segment personalization group, at the top of the stack or nested
 *   inside an item, renders every variant, hidden. This page view's decision
 *   (made by `createPreprProxy` for a page load, or requested by
 *   `PreprPersonalizationSwitch` for a client-side navigation) shows the
 *   visitor's variant before first paint. Nothing streams, and the default
 *   variant never shows first to be replaced.
 *
 * The page carries the HTML of every variant: an item with nested groups
 * repeats once per combination of their variants.
 *
 * @example
 * const data = await getPage(slug); // 'use cache' + query(..., { variants: true })
 * <PreprStack
 *   items={data.Page.content}
 *   render={(items, { index }) => <Sections sections={items} offset={index} />}
 * />
 */
export function PreprStack<T>({
  items,
  render,
  bucket,
  nonce,
  trackVariants = false,
}: PreprStackProps<T>): ReactElement {
  const blocks = splitStack(items);
  const abSwitch = !bucket && blocks.some((block) => block.abTest);
  const personalized = blocks.some((block) => block.personalized);

  return createElement(
    Fragment,
    null,
    (abSwitch || personalized) &&
      createElement(
        Fragment,
        { key: 'prepr-switch' },
        createElement('style', {
          nonce,
          dangerouslySetInnerHTML: {
            __html: AB_BASE_CSS + (personalized ? GROUP_BASE_CSS : ''),
          },
        }),
        personalized &&
          createElement('noscript', {
            dangerouslySetInnerHTML: { __html: NOSCRIPT_HTML },
          }),
        createElement('script', {
          nonce,
          dangerouslySetInnerHTML: {
            __html:
              (abSwitch ? AB_SWITCH_SCRIPT : '') +
              (personalized ? DECISION_SCRIPT : ''),
          },
        }),
        abSwitch && createElement(PreprAbSwitch),
        personalized && createElement(PreprDecisionApplier),
      ),
    ...blocks.map((block) => {
      if (!block.personalized) {
        return createElement(
          Fragment,
          { key: block.key },
          renderBuckets(block.items, render, {
            bucket,
            abTest: block.abTest,
            index: block.index,
            track: trackVariants,
          }),
        );
      }
      return createElement(
        Fragment,
        { key: block.key },
        renderVariants(block, render, { bucket, track: trackVariants }),
        createElement('script', {
          nonce,
          dangerouslySetInnerHTML: { __html: APPLY_SCRIPT },
        }),
      );
    }),
  );
}
