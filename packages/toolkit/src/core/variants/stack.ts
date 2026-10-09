import { contextOf } from './resolve';

export function containsKind(value: unknown, kind: string): boolean {
  if (Array.isArray(value))
    return value.some((item) => containsKind(item, kind));
  if (!value || typeof value !== 'object') return false;
  if (contextOf(value)?.kind === kind) return true;
  return Object.values(value).some((child) => containsKind(child, kind));
}

/** A run of stack items that renders the same way: see {@link splitStack}. */
export interface PreprStackBlock<T> {
  key: string;
  items: T[];
  /**
   * Rendered position of the block's first item: a group (whichever variant
   * shows) takes one position, any other item one each. Use it for anything
   * that depends on page position, like which section owns the h1.
   */
  index: number;
  /**
   * Some item in the block (or nested inside one) is a segment variant, so
   * the block depends on the visitor and is decided per request.
   */
  personalized: boolean;
  /**
   * Some item in the block (or nested inside one) is an A/B variant. Without
   * a known bucket, such a block renders once per bucket and the visitor's
   * bucket is picked in the browser before first paint.
   */
  abTest: boolean;
}

/**
 * Splits a variants-query stack into blocks. Each personalization or A/B
 * group becomes one block (a variant can hold a different number of items
 * than the default); consecutive items that never vary are merged.
 */
export function splitStack<T>(items: readonly T[]): PreprStackBlock<T>[] {
  const blocks: PreprStackBlock<T>[] = [];
  // Rendered positions taken so far; a group's variants share one.
  let position = 0;
  const positionsOf = (block: PreprStackBlock<T>) =>
    block.key.startsWith('group:') ? 1 : block.items.length;
  items.forEach((item, index) => {
    const ctx = contextOf(item);
    const groupKey = ctx ? `group:${ctx.group_id}` : null;
    const personalized = containsKind(item, 'PERSONALIZATION');
    const abTest = containsKind(item, 'AB_TEST');
    const last = blocks.at(-1);
    const plain = !groupKey && !personalized && !abTest;
    if (groupKey && last?.key === groupKey) {
      last.personalized ||= personalized;
      last.abTest ||= abTest;
      last.items.push(item);
    } else if (plain && last && !last.personalized && !last.abTest) {
      last.items.push(item);
    } else {
      const last = blocks.at(-1);
      if (last) position = last.index + positionsOf(last);
      blocks.push({
        key: groupKey ?? `items:${index}`,
        items: [item],
        index: position,
        personalized,
        abTest,
      });
    }
  });
  return blocks;
}
