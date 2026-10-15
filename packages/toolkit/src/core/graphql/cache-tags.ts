// Next.js drops tags past these limits with only a console warning, which
// would leave a page silently missing the tag of an item it shows.
const MAX_TAGS = 128;
const MAX_TAG_LENGTH = 256;

/**
 * Tag for pages showing more items than fit in Next.js's tag limits. Every
 * webhook event revalidates it, so those pages refresh on any change.
 */
export const PREPR_ANY_ITEM_TAG = 'prepr:any';

/** @internal */
export const preprItemTag = (id: string): string => `prepr:${id}`;

/**
 * Cache tag for every page listing items of one model, for `cacheTag()` on
 * index and list pages. `createPreprWebhookRoute` revalidates it when an item
 * of that model is published, unpublished or deleted, so new items appear.
 *
 * @param model The model's singular name as shown in Prepr, e.g. `'Post'`.
 */
export const preprModelTag = (model: string): string => `prepr:model:${model}`;

/**
 * Cache tags for every Prepr item in a query result: `prepr:<_id>` for each
 * object with a string `_id`, at any depth. Pair it with `cacheTag()` inside
 * `'use cache'`, and a publish webhook revalidates only the pages that show
 * the changed item. Run the query with `variants: true` so the tags cover
 * every variant's items, not only those of one visitor.
 *
 * Next.js accepts at most 128 tags of 256 characters per `cacheTag()` call.
 * A result past either limit returns `[PREPR_ANY_ITEM_TAG]` instead, which
 * every webhook event revalidates.
 *
 * @param data A parsed JSON query result, such as `query()`'s `data`.
 */
export function preprCacheTags(data: unknown): string[] {
  const tags = new Set<string>();
  // A stack instead of recursion: deep results cannot overflow the call stack.
  const stack: unknown[] = [data];
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value !== 'object' || value === null) continue;
    const id = (value as { _id?: unknown })._id;
    if (typeof id === 'string' && id !== '') {
      const tag = preprItemTag(id);
      if (tag.length > MAX_TAG_LENGTH) return [PREPR_ANY_ITEM_TAG];
      tags.add(tag);
      if (tags.size > MAX_TAGS) return [PREPR_ANY_ITEM_TAG];
    }
    for (const child of Object.values(value)) stack.push(child);
  }
  return [...tags];
}
