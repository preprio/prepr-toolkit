/**
 * Alias under which the toolkit selects `_context { kind group_id variant_id }`
 * on personalizable items. An alias keeps it apart from any `_context`
 * selection of your own (such as `variant_key` for impression tracking).
 */
export const PREPR_CONTEXT_ALIAS = '_preprContext';

/**
 * Alias under which the toolkit selects each personalizable item's
 * `__typename`, so the decision query can ask only about the item types that
 * hold groups, whether or not your query selects `__typename`.
 */
export const PREPR_TYPE_ALIAS = '_preprType';

/** Prepr's variant id for visitors outside every targeted segment. */
export const PREPR_DEFAULT_VARIANT = 'ALL_OTHER_USERS';
