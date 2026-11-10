/**
 * The list item a click landed in, when the field's value is a rich text
 * list: one field, but each `<li>` is its own line for the editor.
 */
export function listItemIn(
  encoded: HTMLElement,
  target: EventTarget | null,
): { element: HTMLElement; index: number } | null {
  if (!(target instanceof Element)) return null;
  const li = target.closest('li');
  if (!li || !encoded.contains(li) || !li.parentElement) return null;
  const items = Array.from(li.parentElement.children).filter(
    (child) => child.tagName === 'LI',
  );
  return { element: li as HTMLElement, index: items.indexOf(li) };
}

/** The `block`-th `<li>` of a rich text list field, if it has one. */
export function nthListItem(
  encoded: HTMLElement,
  block: number,
): HTMLElement | null {
  const list = encoded.querySelector('ul, ol');
  if (!list) return null;
  const items = Array.from(list.children).filter(
    (child) => child.tagName === 'LI',
  );
  return (items[block] as HTMLElement | undefined) ?? null;
}
