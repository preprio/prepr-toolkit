const UPPERCASE_BOUNDARY = /(.)(?=[A-Z])/g;

/**
 * The snake_case GraphQL name for an API id. Fields inside a component keep
 * the API id as is, so callers try the API id first.
 */
export function graphqlFieldName(apiId: string): string {
  return apiId.replace(UPPERCASE_BOUNDARY, '$1_').toLowerCase();
}

/** The key under which `record` holds the field with this API id, if any. */
export function fieldKeyIn(
  record: Record<string | number, unknown>,
  apiId: string,
): string | undefined {
  if (Object.prototype.hasOwnProperty.call(record, apiId)) return apiId;
  const name = graphqlFieldName(apiId);
  return Object.prototype.hasOwnProperty.call(record, name) ? name : undefined;
}
