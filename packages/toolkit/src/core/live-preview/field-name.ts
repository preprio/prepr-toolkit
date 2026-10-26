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

/**
 * A Text entry holds one value the API exposes three ways: `body` (as
 * stored), `html` and `text` (tags stripped). The editor only ever sends
 * `body`, so a change to it must reach whichever of the three the query
 * selected.
 */
export const TEXT_BODY_FIELDS: ReadonlyArray<{ name: string; plain: boolean }> =
  [
    { name: 'body', plain: false },
    { name: 'html', plain: false },
    { name: 'text', plain: true },
  ];

const TAG_PATTERN = /<[^>]+>/g;

/** `text` as the API derives it from a Text entry's HTML `body`. */
export function plainTextFromHtml(html: string): string {
  return html.replace(TAG_PATTERN, '');
}

/** Whether a record is a Text entry, or untyped and shaped like one. */
export function isTextEntry(record: Record<string, unknown>): boolean {
  const typename = record.__typename;
  if (typeof typename === 'string') return typename === 'Text';
  return 'html' in record || ('text' in record && 'format' in record);
}
