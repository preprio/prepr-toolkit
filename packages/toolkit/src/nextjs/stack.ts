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
import { applyPreprDecisions, startPreprDecision } from './decision-switch';
import { PreprDecisionApplier, PreprVariantTracking } from './components';

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
   * from a URL segment): A/B tests then render that bucket only. Leave it out
   * to render both variants, and let this page view's decision pick the
   * visitor's, like a segment group's.
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

const VARIANT_ATTRIBUTE = 'data-prepr-v';
const DEFAULT_ATTRIBUTE = 'data-prepr-default';
const NESTED_ATTRIBUTE = 'data-prepr-nested';

// Variants stay hidden until this view's decision shows one: no variant, the
// default included, paints before it is decided. A hidden variant never
// reaches 50% visibility, so the tracking pixel records no impression for it.
const GROUP_BASE_CSS = `[${VARIANT_ATTRIBUTE}]{display:none}[${VARIANT_ATTRIBUTE}][data-prepr-show]{display:contents}`;
// Without JavaScript nothing is decided: the default variants show.
const NOSCRIPT_HTML = `<style>[${VARIANT_ATTRIBUTE}][${DEFAULT_ATTRIBUTE}]{display:contents}</style>`;
// Defines the decision switch and asks for this page load's decision, once
// per stack; each personalized block calls the switch right after its HTML,
// so a decision that is already in shows it before it paints.
const DECISION_SCRIPT = `window.__preprApply=${applyPreprDecisions.toString()};(${startPreprDecision.toString()})();`;
const APPLY_SCRIPT = '__preprApply()';

type StackRender<T> = PreprStackProps<T>['render'];

function variantKeysOf(items: unknown[]): string[] {
  return items.flatMap((item) => {
    const key = preprVariantProps(item)['data-prepr-variant-key'];
    return key ? [key] : [];
  });
}

function renderItems<T>(
  items: T[],
  render: StackRender<T>,
  options: {
    bucket?: string;
    decisions?: PreprDecisions;
    index: number;
    track?: boolean;
    defaultVariant: boolean;
  },
): ReactNode {
  const resolved = resolveVariants(items, {
    decisions: options.decisions,
    bucket: options.bucket,
  });
  const content = render(resolved, {
    index: options.index,
    defaultVariant: options.defaultVariant,
  });
  const variantKeys = options.track ? variantKeysOf(resolved) : [];
  return variantKeys.length > 0
    ? createElement(PreprVariantTracking, { variantKeys }, content)
    : content;
}

/**
 * Every group in `items` the decision picks a variant for, at any depth: the
 * segment personalization groups, and the A/B tests unless the bucket is
 * known. Each with its variants in order and its default variant.
 */
function decidedGroups(
  items: unknown[],
  bucket: string | undefined,
): Map<string, { variants: Set<string>; fallback: string }> {
  const groups = new Map<string, { variants: Set<string>; fallback: string }>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    const ctx = contextOf(value);
    const decided =
      ctx?.kind === 'PERSONALIZATION' || (ctx?.kind === 'AB_TEST' && !bucket);
    if (decided && ctx.variant_id) {
      const group = groups.get(ctx.group_id!) ?? {
        variants: new Set<string>(),
        fallback: ctx.kind === 'AB_TEST' ? 'A' : PREPR_DEFAULT_VARIANT,
      };
      group.variants.add(ctx.variant_id);
      groups.set(ctx.group_id!, group);
    }
    Object.values(value).forEach(walk);
  };
  walk(items);
  return groups;
}

/**
 * Every variant combination of one varying block, each in a hidden wrapper
 * listing its `group:variant` pairs. A top-level group renders once per
 * variant. An item with groups nested inside renders once per combination of
 * their variants, the default included, since the item shows for visitors in
 * none of the segments too.
 */
function renderVariants<T>(
  block: { key: string; items: T[]; index: number },
  groups: Map<string, { variants: Set<string>; fallback: string }>,
  render: StackRender<T>,
  options: { bucket?: string; track?: boolean },
): ReactNode {
  const top = block.key.startsWith('group:')
    ? block.key.slice('group:'.length)
    : undefined;
  const nested = !(top !== undefined && groups.size === 1);
  const choices = [...groups].map(([group, { variants, fallback }]) => {
    const ids = nested ? [fallback, ...variants] : [...variants];
    return [...new Set(ids)].map((variant) => [group, variant] as const);
  });
  const combinations = choices.reduce<(readonly [string, string])[][]>(
    (all, pairs) => all.flatMap((combo) => pairs.map((p) => [...combo, p])),
    [[]],
  );
  return combinations.map((combination) => {
    const pairs = combination.map(([group, variant]) => `${group}:${variant}`);
    const isDefault = combination.every(
      ([group, variant]) => variant === groups.get(group)!.fallback,
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
      renderItems(block.items, render, {
        bucket: options.bucket,
        decisions: new Map(combination.map(([g, v]) => [g, [v]])),
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
 * - Every A/B test and segment personalization group, at the top of the
 *   stack or nested inside an item, renders every variant, hidden. The page
 *   is the same for every visitor and never waits for Prepr: an inline script
 *   asks `createPreprProxy` for this page view's decision while the page
 *   loads, and shows the visitor's variant when it answers. A click's
 *   decision (requested by `PreprPersonalizationSwitch`) is in before the
 *   next page paints. Nothing streams, and the default variant never shows
 *   first to be replaced.
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
  const blocks = splitStack(items).map((block) => ({
    ...block,
    groups: decidedGroups(block.items, bucket),
  }));
  const varies = blocks.some((block) => block.groups.size > 0);

  return createElement(
    Fragment,
    null,
    varies &&
      createElement(
        Fragment,
        { key: 'prepr-switch' },
        createElement('style', {
          nonce,
          dangerouslySetInnerHTML: { __html: GROUP_BASE_CSS },
        }),
        createElement('noscript', {
          dangerouslySetInnerHTML: { __html: NOSCRIPT_HTML },
        }),
        createElement('script', {
          nonce,
          dangerouslySetInnerHTML: { __html: DECISION_SCRIPT },
        }),
        createElement(PreprDecisionApplier),
      ),
    ...blocks.map((block) => {
      if (block.groups.size === 0) {
        return createElement(
          Fragment,
          { key: block.key },
          renderItems(block.items, render, {
            bucket,
            index: block.index,
            track: trackVariants,
            defaultVariant: true,
          }),
        );
      }
      return createElement(
        Fragment,
        { key: block.key },
        renderVariants(block, block.groups, render, {
          bucket,
          track: trackVariants,
        }),
        createElement('script', {
          nonce,
          dangerouslySetInnerHTML: { __html: APPLY_SCRIPT },
        }),
      );
    }),
  );
}
