import type { GetPageBySlugQuery } from '@/gql/graphql';

export type PageElement = NonNullable<
  GetPageBySlugQuery['Page']
>['content'][number];

/**
 * A run of page elements: either plain content, or one personalization group
 * (an adaptive section in Prepr). A group is replaced as a whole because a
 * variant can contain a different number of elements than the default.
 */
export type Block =
  | { groupId: null; elements: PageElement[] }
  | { groupId: string; elements: PageElement[] };

/**
 * Prepr sets `_context.group_id` on elements that come from a personalization
 * or A/B group; everything else is the same for every visitor.
 */
export function groupOf(element: PageElement): string | null {
  return ('_context' in element && element._context?.group_id) || null;
}

/** Splits elements into consecutive runs of plain content and groups. */
export function toBlocks(elements: PageElement[]): Block[] {
  const blocks: Block[] = [];
  for (const element of elements) {
    const groupId = groupOf(element);
    const last = blocks.at(-1);
    if (last && last.groupId === groupId) last.elements.push(element);
    else blocks.push({ groupId, elements: [element] } as Block);
  }
  return blocks;
}
