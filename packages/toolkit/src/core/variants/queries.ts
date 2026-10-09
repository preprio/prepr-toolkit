import { resolveQuery } from '../graphql/document';
import type { PreprDocument } from '../graphql/types';
import { toDecisionDocument } from './decision-document';
import { personalizationPaths } from './resolve';
import type { PreprSchemaInfo } from './schema';
import { toVariantsDocument } from './variants-document';

/**
 * The schema facts the query rewrites need, from `loadPreprSchema`. Pass it
 * along; its shape is not part of the public API.
 */
export type PreprSchema = PreprSchemaInfo;

/**
 * Your query, asking for every personalization and A/B variant: what
 * `query(..., { variants: true })` sends, as a string for your own GraphQL
 * client. The result is the same for every visitor, so cache it like any
 * other content query, and render it with `resolveVariants` or `PreprStack`.
 *
 * A query without personalizable fields comes back unchanged (minified).
 */
export function toVariantsQuery(
  document: PreprDocument<unknown, unknown> | string,
  schema: PreprSchema,
): string {
  return resolveQuery(toVariantsDocument(document, schema));
}

/**
 * The per-visitor decision query for the same query: send it with the
 * visitor's Prepr headers, never cached, and pass the response's `data` to
 * `decisionsFrom`.
 *
 * Pass the variants result as `from` whenever you have it: the query then
 * asks only about the lists that hold segment groups on this page, which is
 * a few hundred bytes instead of the whole page and markedly faster for a
 * visitor Prepr has not seen before. Without `from` it asks about every
 * personalizable list. `topLevelOnly` stops at the first personalizable list
 * on each path, for middleware that decides only the top of a stack.
 *
 * Null when there is nothing to decide: send no request then.
 */
export function toDecisionQuery(
  document: PreprDocument<unknown, unknown> | string,
  schema: PreprSchema,
  options: { from?: unknown; topLevelOnly?: boolean } = {},
): string | null {
  const paths =
    options.from === undefined ? undefined : personalizationPaths(options.from);
  if (paths && paths.size === 0) return null;
  const decision = toDecisionDocument(document, schema, paths, {
    topLevelOnly: !paths && options.topLevelOnly,
  });
  return decision ? resolveQuery(decision) : null;
}
