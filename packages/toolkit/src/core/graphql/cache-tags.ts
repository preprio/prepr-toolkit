import type { DocumentNode, OperationDefinitionNode } from 'graphql';

import type { PreprSchemaInfo } from '../variants';

// Next.js drops tags past these limits with only a console warning, which
// would leave a page silently missing the tag of an item it shows.
const MAX_TAGS = 128;
const MAX_TAG_LENGTH = 256;

/**
 * Tag for pages showing more items than fit in Next.js's tag limits. Every
 * webhook event revalidates it, so those pages refresh on any change.
 */
export const PREPR_ANY_ITEM_TAG = 'prepr:any';

/** Tag on the schema introspection, which a `schema.changed` webhook revalidates. */
export const PREPR_SCHEMA_TAG = 'prepr:schema';

/** @internal */
export const preprItemTag = (id: string): string => `prepr:${id}`;

const NOT_ALPHANUMERIC = /[^a-z0-9]/g;

/**
 * Cache tag for every page listing items of one model. `tagItems` adds it to
 * list queries and to lookups that found nothing; add it yourself with
 * `cacheTag()` for other pages that depend on which items exist.
 * `createPreprWebhookRoute` revalidates it when an item of that model is
 * published, unpublished or deleted.
 *
 * The name is compared case-insensitively and without spaces or
 * punctuation, so the model's name in Prepr (`'Blog post'`, as webhooks send
 * it) and its GraphQL type (`BlogPost`) give the same tag. A model whose API
 * ID was renamed away from its name gets two different tags.
 *
 * @param model The model's singular name in Prepr or its GraphQL type name.
 */
export const preprModelTag = (model: string): string =>
  `prepr:model:${model.toLowerCase().replace(NOT_ALPHANUMERIC, '')}`;

/**
 * @internal Model tags for what a publish can change in a result without
 * touching an item it holds: a list query (a new item joins it) and a
 * single-item lookup that found nothing (the item is published later).
 */
export function preprModelTagsFor(
  document: DocumentNode,
  data: unknown,
  schema: PreprSchemaInfo,
): string[] {
  const operation = document.definitions.find(
    (definition): definition is OperationDefinitionNode =>
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'query',
  );
  const root = schema.types[schema.queryType];
  if (!operation || !root) return [];

  // A union or interface stands for each of its models.
  const models = (type: string) => {
    const members = schema.types[type]?.possibleTypes ?? [];
    return members.length > 0 ? members : [type];
  };
  const tags = new Set<string>();
  for (const selection of operation.selectionSet.selections) {
    if (selection.kind !== 'Field') continue;
    const type = root.fields[selection.name.value]?.type;
    const info = type ? schema.types[type] : undefined;
    if (!type || !info) continue;
    // Prepr's list queries return `{ items, total }`.
    const items = info.fields.items?.type;
    const key = (selection.alias ?? selection.name).value;
    const found =
      typeof data === 'object' &&
      data !== null &&
      (data as Record<string, unknown>)[key] != null;
    const affected = items ? models(items) : found ? [] : models(type);
    for (const model of affected) tags.add(preprModelTag(model));
  }
  return [...tags];
}

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
