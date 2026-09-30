import type { StegaDecodedData } from './clean';

// Single owner of the text-node walk + attribute-tagging contract shared by
// elements.ts and auto-clean.ts.

const IGNORED_ANCESTORS = 'script, style, noscript';

/** Skip nodes under an ignored ancestor, and blank text. */
export function isIgnoredTextNode(node: Node): boolean {
  if (node.parentElement?.closest(IGNORED_ANCESTORS)) return true;
  return !node.textContent?.trim();
}

export function walkTextNodes(root: Node, visit: (node: Text) => void): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      isIgnoredTextNode(node)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  let node: Node | null;
  while ((node = walker.nextNode())) {
    visit(node as Text);
  }
}

/**
 * The element the overlay should attach to for a given encoded text node.
 *
 * Prefers the closest `[data-prepr-edit-target]` ancestor, which lets a site
 * carry the encoded payload in a visually hidden node while the outline and
 * click target land on the element a visitor can actually reach. Without that
 * opt-in the parent is used, and a parent that renders no box is rejected —
 * the overlay measures `getBoundingClientRect()` and hover resolves through
 * `closest()` from the moused-over element, so a hidden node would be tagged
 * but permanently uneditable.
 */
export function resolveEditTarget(node: Text): HTMLElement | null {
  const parent = node.parentElement;
  if (!parent) return null;

  const editTarget = parent.closest<HTMLElement>('[data-prepr-edit-target]');
  if (editTarget) return editTarget;

  return isRenderedElement(parent) ? parent : null;
}

/**
 * Whether an element generates a box that can be hovered and outlined.
 * `getClientRects()` is empty for anything with no layout box, which covers
 * `display:none` subtrees; `visibility:hidden` still produces a box, so the
 * computed style is checked as well.
 */
function isRenderedElement(element: HTMLElement): boolean {
  if (element.hidden) return false;
  if (element.getClientRects().length === 0) return false;

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return true;

  return style.visibility !== 'hidden' && style.display !== 'none';
}

/**
 * Pull the focus target out of an edit URL shaped
 * `<editor>/content/edit/<id>?field=<path>&locale=<locale>`. The editor needs
 * all three to open the right content item and put the cursor in the field the
 * visitor clicked.
 *
 * Never throws: the href arrives from decoded page content, and a value that
 * does not parse must still leave the element tagged and hoverable — it just
 * loses auto-focus.
 */
function parseEditHref(href: string): {
  id?: string;
  field?: string;
  locale?: string;
} {
  try {
    const url = new URL(href, window.location.origin);
    return {
      id: url.pathname.split('/').pop() || undefined,
      field: url.searchParams.get('field') || undefined,
      locale: url.searchParams.get('locale') || undefined,
    };
  } catch {
    return {};
  }
}

function setOrRemove(
  element: Element,
  name: string,
  value: string | undefined,
): void {
  if (value) {
    element.setAttribute(name, value);
  } else {
    element.removeAttribute(name);
  }
}

/**
 * Tag an element with the attributes the click-to-edit overlay looks for: the
 * encoded marker, the edit URL and its origin, and the content item id, field
 * path, and locale parsed out of that URL.
 *
 * Always overwrites, and removes the parsed attributes a new href does not
 * carry — a re-clean after the href changed must not leave a stale field path
 * pointing the editor at the wrong field. Callers that must not re-tag check
 * `hasAttribute('data-prepr-encoded')` themselves.
 */
export function tagEncodedElement(
  element: Element,
  decoded: StegaDecodedData,
): void {
  element.setAttribute('data-prepr-encoded', '');
  element.setAttribute('data-prepr-href', decoded.href);
  element.setAttribute('data-prepr-origin', decoded.origin);

  const { id, field, locale } = parseEditHref(decoded.href);
  setOrRemove(element, 'data-prepr-id', id);
  setOrRemove(element, 'data-prepr-field', field);
  setOrRemove(element, 'data-prepr-locale', locale);
}
