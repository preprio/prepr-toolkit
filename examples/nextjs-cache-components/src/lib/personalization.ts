import type { GetPageVariantsQuery } from '@/gql/graphql';

export type VariantElement = NonNullable<
  GetPageVariantsQuery['Page']
>['content'][number];

type Context = {
  kind?: string | null;
  group_id?: string | null;
  variant_id?: string | null;
};

function contextOf(element: VariantElement): Context | null {
  return (
    ('_context' in element && (element._context as Context | null)) || null
  );
}

/**
 * A run of page elements. Plain runs are the same for every visitor; a group
 * holds every variant of one personalization or A/B group, in Prepr's order.
 */
export type Block =
  | { kind: 'plain'; elements: VariantElement[] }
  | {
      kind: 'PERSONALIZATION' | 'AB_TEST';
      groupId: string;
      elements: VariantElement[];
    };

/** Splits the `personalize: false` content into plain runs and groups. */
export function toBlocks(elements: VariantElement[]): Block[] {
  const blocks: Block[] = [];
  for (const element of elements) {
    const ctx = contextOf(element);
    const groupId = ctx?.kind && ctx.group_id ? ctx.group_id : null;
    const last = blocks.at(-1);
    if (groupId === null) {
      if (last?.kind === 'plain') last.elements.push(element);
      else blocks.push({ kind: 'plain', elements: [element] });
    } else if (last && last.kind !== 'plain' && last.groupId === groupId) {
      last.elements.push(element);
    } else {
      blocks.push({
        kind: ctx!.kind === 'AB_TEST' ? 'AB_TEST' : 'PERSONALIZATION',
        groupId,
        elements: [element],
      });
    }
  }
  return blocks;
}

/** The elements of the given variants, in the order the variants are listed. */
export function pickVariants(
  elements: VariantElement[],
  variantIds: readonly string[],
): VariantElement[] {
  return variantIds.flatMap((id) =>
    elements.filter((element) => contextOf(element)?.variant_id === id),
  );
}

/**
 * Variant ids per group from a personalized decision query, de-duplicated and
 * in Prepr's order. A visitor in several segments can get more than one
 * variant of the same group, so this is a list, not a single id.
 */
export function decisionsByGroup(
  elements: ReadonlyArray<object>,
): Map<string, string[]> {
  const decisions = new Map<string, string[]>();
  for (const element of elements) {
    const ctx =
      '_context' in element ? (element._context as Context | null) : null;
    if (!ctx?.group_id || !ctx.variant_id) continue;
    const ids = decisions.get(ctx.group_id) ?? [];
    if (!ids.includes(ctx.variant_id)) ids.push(ctx.variant_id);
    decisions.set(ctx.group_id, ids);
  }
  return decisions;
}

export const DEFAULT_VARIANT = 'ALL_OTHER_USERS';
