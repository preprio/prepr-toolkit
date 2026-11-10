import { decodeStega } from './stega/clean';

/** The field an element shows, for `previewAttrs`. */
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

/** Options of `previewAttrs`. */
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
 * Returns an empty object when disabled or when there is no target or id, so
 * it is safe to spread unconditionally.
 */
export function previewAttrs(
  target: PreviewAttrsTarget | null | undefined,
  options: PreviewAttrsOptions,
): Record<string, string> {
  if (!options.enabled || !target?.id || !target.field) return {};
  const attrs: Record<string, string> = {
    'data-prepr-encoded': '',
    'data-prepr-id': target.id,
    'data-prepr-field': target.field,
  };
  if (target.locale) attrs['data-prepr-locale'] = target.locale;
  if (target.entryId) attrs['data-prepr-entry-id'] = target.entryId;
  return attrs;
}

/** Options of `stegaTarget`. */
export interface StegaTargetOptions {
  /**
   * A field next to the encoded one, in the same item or component, to target
   * instead: a dotted path that replaces the encoded field's last segment
   * (`products`, or `products.items.2` for one entry of it).
   */
  field?: string;
}

/** Only parsed for its path and query; the base is never requested. */
const URL_BASE = 'https://prepr.invalid';

/**
 * The edit target behind a text value Prepr returned with a hidden edit link,
 * for {@link previewAttrs}. Reach for it when the field to edit carries no
 * link of its own, such as remote content or a list of references, but a
 * text field of the same component does: the component's title points the
 * way to its `products`.
 *
 * ```tsx
 * const products = stegaTarget(block.title, { field: 'products' });
 * <article {...previewAttrs(products, { enabled: isPreview })}>
 * ```
 *
 * Returns null for a value without an edit link (a production render, or a
 * value Prepr does not encode). Works on the server and in the browser.
 */
export function stegaTarget(
  value: string | null | undefined,
  options: StegaTargetOptions = {},
): PreviewAttrsTarget | null {
  const decoded = value ? decodeStega(value) : null;
  if (!decoded) return null;
  let url: URL;
  let id: string;
  try {
    url = new URL(decoded.href, URL_BASE);
    id = decodeURIComponent(url.pathname.split('/').pop() ?? '');
  } catch {
    return null;
  }
  const field = url.searchParams.get('field');
  if (!id || !field) return null;
  return {
    id,
    field: options.field
      ? `${field.slice(0, field.lastIndexOf('.') + 1)}${options.field}`
      : field,
    locale: url.searchParams.get('locale'),
  };
}
