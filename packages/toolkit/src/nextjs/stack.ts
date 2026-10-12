import {
  createElement,
  Fragment,
  Suspense,
  type ReactElement,
  type ReactNode,
} from 'react';

import { isFrameworkSignal } from '../core/graphql';
import {
  PREPR_CONTEXT_ALIAS,
  PREPR_DEFAULT_VARIANT,
  preprVariantProps,
  resolveVariants,
  splitStack,
  type PreprDecisions,
} from '../core/variants';
import { applyPreprAbBucket, applyPreprDecisions } from './ab-switch';
import {
  PreprAbSwitch,
  PreprPersonalizationSwitch,
  PreprVariantTracking,
} from './components';

export interface PreprStackProps<T> {
  /** A stack (e.g. `page.content`) from a query run with `variants: true`. */
  items: readonly T[];
  /**
   * The visitor's decisions, as a promise from `decide()`. Only the parts
   * that vary per segment wait for it; a failed decision falls back to the
   * default variants instead of failing the page.
   */
  decisions: Promise<PreprDecisions>;
  /**
   * Renders resolved stack items, e.g. your section switch. `index` is the
   * position of the block's first item in the whole stack, for anything that
   * depends on page position, such as which section owns the h1 or the
   * priority image.
   *
   * `placeholder` is true while this render only stands in for the visitor's
   * variant of a segment group (the default variant, shown until the
   * decision streams in). Leave `data-prepr-variant-key` off it: the tracking
   * pixel would count an impression of a variant the visitor may never get.
   *
   * `defaultVariant` is false for the variants that are in the page but
   * hidden unless the visitor gets them: the other buckets of an A/B test and
   * the other segment variants above the fold. Give only the default variant
   * `priority` images, and the others `loading="lazy"`: the browser downloads
   * a hidden eager image anyway, but skips a hidden lazy one.
   */
  render: (
    items: T[],
    position: { index: number; placeholder: boolean; defaultVariant: boolean },
  ) => ReactNode;
  /**
   * The visitor's A/B bucket, when the route already knows it (for example
   * from a URL segment). Leave it out to render both variants of each A/B
   * test and pick the visitor's in the browser before first paint.
   */
  bucket?: string;
  /** Nonce for the inline A/B switch script, under a strict CSP. */
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
  /**
   * How many blocks, from the top, are on screen before the visitor scrolls.
   * Default `1`; set it higher when more sections fit on the first screen
   * (take the larger screen when it differs per device), or `0` to stream
   * every segment group.
   *
   * Their segment groups do not stream: every variant is in the cached page,
   * and the variant the proxy decided (`prepr.resolveDecisions`) shows before
   * first paint, so nothing on screen changes while the page loads. Without
   * a decision (no cookie yet, or the proxy's lookup failed) the default
   * variant shows. Costs the HTML of the other variants; see `defaultVariant`
   * in `render` to keep their images from downloading. An item with a
   * segment group nested inside it keeps streaming.
   */
  aboveTheFold?: number;
}

const AB_ATTRIBUTE = 'data-prepr-ab';
const AB_BUCKETS = ['A', 'B'] as const;

// The variant wrappers never affect layout, and only A shows by default: what
// visitors without JavaScript, crawlers and anonymous visitors get.
const AB_BASE_CSS = `[${AB_ATTRIBUTE}]{display:contents}[${AB_ATTRIBUTE}]:not([${AB_ATTRIBUTE}="A"]){display:none}`;

// Runs while the HTML is parsed, so the visitor's variant is the first one
// painted. A hidden variant never reaches 50% visibility, so the tracking
// pixel never records an impression for it.
const AB_SWITCH_SCRIPT = `(${applyPreprAbBucket.toString()})();(${applyPreprDecisions.toString()})()`;

const GROUP_ATTRIBUTE = 'data-prepr-group';
const VARIANT_ATTRIBUTE = 'data-prepr-variant';
const DEFAULT_ATTRIBUTE = 'data-prepr-default';

// Segment variants of above-the-fold groups: no layout effect, and only the
// default shows until the switch script applies the proxy's decision.
const GROUP_BASE_CSS = `[${GROUP_ATTRIBUTE}]{display:contents}[${GROUP_ATTRIBUTE}]:not([${DEFAULT_ATTRIBUTE}]){display:none}`;

/**
 * Renders items for every A/B bucket the visitor might have, each in a
 * wrapper the switch script shows or hides; or for the known bucket only.
 */
type StackRender<T> = PreprStackProps<T>['render'];

function variantKeysOf(items: unknown[]): string[] {
  return items.flatMap((item) => {
    const key = preprVariantProps(item)['data-prepr-variant-key'];
    return key ? [key] : [];
  });
}

function renderBuckets<T>(
  items: T[],
  render: StackRender<T>,
  options: {
    bucket?: string;
    decisions?: PreprDecisions;
    abTest: boolean;
    index: number;
    track?: boolean;
    placeholder?: boolean;
    defaultVariant?: boolean;
  },
): ReactNode {
  const {
    bucket,
    decisions,
    abTest,
    index,
    track,
    placeholder = false,
    defaultVariant = true,
  } = options;
  const renderVariant = (variant: string | undefined, key?: string) => {
    const resolved = resolveVariants(items, { decisions, bucket: variant });
    const ab = abTest && !bucket ? variant : undefined;
    const content = render(resolved, {
      index,
      placeholder,
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

/**
 * Every variant of one segment group, each in a wrapper the switch script
 * shows or hides.
 */
function renderAllVariants<T>(
  block: { key: string; items: T[]; index: number },
  render: StackRender<T>,
  options: { bucket?: string; track?: boolean },
): ReactNode {
  const group = block.key.slice('group:'.length);
  const variants = [
    ...new Set(
      block.items.flatMap((item) => {
        const ctx = (item as Record<string, unknown>)[PREPR_CONTEXT_ALIAS] as
          { variant_id?: string } | undefined;
        return ctx?.variant_id ? [ctx.variant_id] : [];
      }),
    ),
  ];
  return variants.map((variant) =>
    createElement(
      'div',
      {
        key: variant,
        [GROUP_ATTRIBUTE]: group,
        [VARIANT_ATTRIBUTE]: variant,
        ...(variant === PREPR_DEFAULT_VARIANT
          ? { [DEFAULT_ATTRIBUTE]: '' }
          : {}),
      },
      renderBuckets(block.items, render, {
        bucket: options.bucket,
        decisions: new Map([[group, [variant]]]),
        abTest: false,
        index: block.index,
        track: options.track,
        defaultVariant: variant === PREPR_DEFAULT_VARIANT,
      }),
    ),
  );
}

async function PersonalizedBlock<T>({
  items,
  decisions,
  bucket,
  abTest,
  index,
  render,
  track,
}: {
  items: T[];
  decisions: Promise<PreprDecisions>;
  bucket?: string;
  abTest: boolean;
  index: number;
  render: StackRender<T>;
  track?: boolean;
}): Promise<ReactNode> {
  const decided = await decisions.catch((error: unknown) => {
    // Next.js control flow must reach Next; anything else degrades to the
    // default variant rather than an error page.
    if (isFrameworkSignal(error)) throw error;
    return undefined;
  });
  return renderBuckets(items, render, {
    bucket,
    decisions: decided,
    abTest,
    index,
    track,
  });
}

/**
 * Renders a personalized stack with Cache Components / Partial Prerendering.
 *
 * - Items that never vary render in the static shell.
 * - A/B tests render in the static shell too, once per bucket; a tiny inline
 *   script shows the visitor's bucket (from `resolvePreprBucket`'s cookie)
 *   before first paint, so no variant streams or swaps in. `A` is the
 *   default. Pass `bucket` instead when the route already knows it.
 * - Each segment-personalized group, and each item with segment content
 *   nested inside it, gets its own `<Suspense>` boundary: the default
 *   variant (possibly empty) is the fallback, and this visitor's variant
 *   streams in once `decisions` resolves. Because `items` holds every
 *   variant, a group with no default variant still gets its place.
 *
 * @example
 * const data = await getPage(slug); // 'use cache' + query(..., { variants: true })
 * <PreprStack
 *   items={data.Page.content}
 *   decisions={prepr.decide(PageDocument, { slug }, { from: data })}
 *   render={(items, { index }) => <Sections sections={items} offset={index} />}
 * />
 */
export function PreprStack<T>({
  items,
  decisions,
  render,
  bucket,
  nonce,
  trackVariants = false,
  aboveTheFold = 1,
}: PreprStackProps<T>): ReactElement {
  // Blocks that never wait would leave a rejection unobserved.
  decisions.catch(() => undefined);
  const blocks = splitStack(items);
  const decidedInProxy = (block: (typeof blocks)[number]) =>
    block.index < aboveTheFold &&
    block.personalized &&
    !block.abTest &&
    block.key.startsWith('group:');
  const hasDecided = blocks.some(decidedInProxy);
  const needsSwitch =
    (!bucket && blocks.some((block) => block.abTest)) || hasDecided;

  return createElement(
    Fragment,
    null,
    needsSwitch &&
      createElement(
        Fragment,
        { key: 'prepr-ab' },
        createElement('style', {
          nonce,
          dangerouslySetInnerHTML: {
            __html: AB_BASE_CSS + (hasDecided ? GROUP_BASE_CSS : ''),
          },
        }),
        createElement('script', {
          nonce,
          dangerouslySetInnerHTML: { __html: AB_SWITCH_SCRIPT },
        }),
        createElement(PreprAbSwitch),
        hasDecided &&
          createElement(PreprPersonalizationSwitch, { refresh: false }),
      ),
    ...blocks.map((block) => {
      if (decidedInProxy(block)) {
        return createElement(
          Fragment,
          { key: block.key },
          renderAllVariants(block, render, { bucket, track: trackVariants }),
        );
      }
      // A fallback is only on screen until the visitor's variant arrives, so
      // it is tagged only where it is final: blocks that never stream.
      const fallback = renderBuckets(block.items, render, {
        bucket,
        abTest: block.abTest,
        index: block.index,
        track: trackVariants && !block.personalized,
        placeholder: block.personalized,
      });
      if (!block.personalized) {
        return createElement(Fragment, { key: block.key }, fallback);
      }
      return createElement(
        Suspense,
        { key: block.key, fallback },
        createElement(PersonalizedBlock<T>, {
          items: block.items,
          decisions,
          bucket,
          abTest: block.abTest,
          index: block.index,
          render,
          track: trackVariants,
        }),
      );
    }),
  );
}
