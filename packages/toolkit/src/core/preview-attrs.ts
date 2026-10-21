export interface PreviewAttrsTarget {
  /** `_id` of the content item or component that owns the field. */
  id: string | null | undefined;
  /** API field name, or a dotted path below the item (`content.3`). */
  field: string;
  /** Locale of the rendered value, when the site knows it. */
  locale?: string | null;
  /** Site-side id of one entry in a list-like field (`data-prepr-entry-id`). */
  entryId?: string | null;
}

export interface PreviewAttrsOptions {
  /**
   * Whether to emit the attributes at all. Pass `true` only for preview or
   * draft renders, so production HTML carries no edit metadata.
   */
  enabled: boolean;
}

/**
 * Attributes that make an element click-to-edit in the Prepr visual editor,
 * for values that carry no hidden edit link of their own: images, videos,
 * anything rendered from a URL. Spread them onto the element that renders
 * the field:
 *
 * ```tsx
 * <figure {...previewAttrs({ id: post._id, field: 'cover_image' }, { enabled: isPreview })}>
 * ```
 *
 * Returns an empty object when disabled or when there is no id, so it is safe
 * to spread unconditionally.
 */
export function previewAttrs(
  target: PreviewAttrsTarget,
  options: PreviewAttrsOptions,
): Record<string, string> {
  if (!options.enabled || !target.id || !target.field) return {};
  const attrs: Record<string, string> = {
    'data-prepr-encoded': '',
    'data-prepr-id': target.id,
    'data-prepr-field': target.field,
  };
  if (target.locale) attrs['data-prepr-locale'] = target.locale;
  if (target.entryId) attrs['data-prepr-entry-id'] = target.entryId;
  return attrs;
}
