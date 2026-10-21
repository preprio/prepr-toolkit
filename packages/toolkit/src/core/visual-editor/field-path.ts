const INDEX_SEGMENT = /^\d+$/;
const WORD_SEPARATORS = /[_-]+/g;

/**
 * Field paths travel in two spellings: the editor pads list indices to three
 * digits (`stack.items.000.title`) while the stega payload may not
 * (`stack.items.0.title`). Both sides are compared in this normalized form.
 */
export function normalizeFieldPath(path: string): string {
  return path
    .split('.')
    .map((segment) =>
      INDEX_SEGMENT.test(segment)
        ? String(Number.parseInt(segment, 10))
        : segment,
    )
    .join('.');
}

// Leaf names that say nothing on their own — a button's `value` — so the
// label leads with the field that holds them.
const GENERIC_LEAVES = new Set(['value', 'text', 'body', 'content', 'label']);

function humanize(name: string): string {
  const words = name.replace(WORD_SEPARATORS, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Human label for a field path: the last named segment, title-cased.
 * `stack.items.000.meta_title` → `Meta title`; a generic leaf is prefixed
 * with its parent, `ctas.items.000.value` → `Ctas › Value`.
 */
export function fieldLabel(path: string | null | undefined): string {
  if (!path) return 'Edit';
  // `items` is the list container in stack and component paths, never a name
  // an editor would recognise.
  const segments = path
    .split('.')
    .filter((s) => s && s !== 'items' && !INDEX_SEGMENT.test(s));
  const name = segments[segments.length - 1];
  if (!name) return 'Edit';
  const parent = segments[segments.length - 2];
  if (parent && GENERIC_LEAVES.has(name)) {
    return `${humanize(parent)} › ${humanize(name)}`;
  }
  return humanize(name);
}

export interface FieldLookup {
  field: string;
  id?: string;
}

/**
 * The first tagged element rendering `field` (and `id`, when given). The
 * values arrive over postMessage, so they are compared as strings and never
 * interpolated into a selector.
 */
export function findFieldElement(lookup: FieldLookup): HTMLElement | null {
  if (!lookup.field) return null;
  const wanted = normalizeFieldPath(lookup.field);
  const candidates = document.querySelectorAll<HTMLElement>(
    '[data-prepr-encoded]',
  );
  for (const candidate of candidates) {
    const field = candidate.getAttribute('data-prepr-field');
    if (!field || normalizeFieldPath(field) !== wanted) continue;
    if (lookup.id && candidate.getAttribute('data-prepr-id') !== lookup.id) {
      continue;
    }
    return candidate;
  }
  return null;
}
