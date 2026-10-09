import {
  PREPR_CONTEXT_ALIAS,
  PREPR_DEFAULT_VARIANT,
  PREPR_TYPE_ALIAS,
} from './constants';

/** The variant ids Prepr chose for one visitor, per personalization group. */
export type PreprDecisions = ReadonlyMap<string, readonly string[]>;

/**
 * Lists that hold segment personalization groups, by response path (keys
 * joined with `.`, list positions left out), with the item types in those
 * groups. `*` stands for "type unknown", which keeps every type.
 */
export type PreprGroupPaths = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * Where a variants result holds segment personalization groups, and of which
 * item types. A/B groups are left out: they resolve from the bucket, not a
 * decision.
 */
export function personalizationPaths(data: unknown): Map<string, Set<string>> {
  const paths = new Map<string, Set<string>>();
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (contextOf(item)?.kind === 'PERSONALIZATION') {
          const record = item as Record<string, unknown>;
          const type = record[PREPR_TYPE_ALIAS] ?? record.__typename;
          const types = paths.get(path) ?? new Set<string>();
          types.add(typeof type === 'string' ? type : '*');
          paths.set(path, types);
        }
        walk(item, path);
      }
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key !== PREPR_CONTEXT_ALIAS && key !== PREPR_TYPE_ALIAS)
        walk(child, path ? `${path}.${key}` : key);
    }
  };
  walk(data, '');
  return paths;
}

export interface ItemContext {
  kind?: string | null;
  group_id?: string | null;
  variant_id?: string | null;
  variant_key?: string | null;
}

export function contextOf(item: unknown): ItemContext | null {
  if (!item || typeof item !== 'object') return null;
  const context = (item as Record<string, unknown>)[PREPR_CONTEXT_ALIAS];
  const ctx = context as ItemContext | null | undefined;
  return ctx?.kind && ctx.group_id ? ctx : null;
}

/**
 * Variant ids per group from a decision response, de-duplicated and in
 * Prepr's order. A visitor in several segments can get more than one variant
 * of the same group, so each entry is a list.
 */
export function decisionsFrom(data: unknown): PreprDecisions {
  const decisions = new Map<string, string[]>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    const ctx = contextOf(value);
    if (ctx?.group_id && ctx.variant_id) {
      const ids = decisions.get(ctx.group_id) ?? [];
      if (!ids.includes(ctx.variant_id)) ids.push(ctx.variant_id);
      decisions.set(ctx.group_id, ids);
    }
    Object.values(value).forEach(walk);
  };
  walk(data);
  return decisions;
}

export interface ResolveVariantsOptions {
  /**
   * The visitor's per-group variants (from a decision query). Without it,
   * personalization groups show their default variant.
   */
  decisions?: PreprDecisions;
  /** The visitor's A/B bucket. Without it, A/B groups use the decision, then `A`. */
  bucket?: string;
}

function chosenVariants(
  ctx: ItemContext,
  options: ResolveVariantsOptions,
): readonly string[] {
  const decided = options.decisions?.get(ctx.group_id!);
  if (ctx.kind === 'AB_TEST') {
    return options.bucket ? [options.bucket] : (decided ?? ['A']);
  }
  return decided ?? [PREPR_DEFAULT_VARIANT];
}

/**
 * Keeps, in every list of a variants query result, only the variants this
 * visitor gets, at any depth (page stacks, nested stacks, personalized
 * buttons). Items outside a group are kept as they are.
 */
export function resolveVariants<T>(
  data: T,
  options: ResolveVariantsOptions = {},
): T {
  const resolve = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value
        .filter((item) => {
          const ctx = contextOf(item);
          return (
            !ctx || chosenVariants(ctx, options).includes(ctx.variant_id ?? '')
          );
        })
        .map(resolve);
    }
    if (!value || typeof value !== 'object') return value;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) out[key] = resolve(child);
    return out;
  };
  return resolve(data) as T;
}
