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
 * Tag an element with the attribute triple the click-to-edit overlay looks for.
 * Always overwrites so re-cleans pick up a changed href — callers that must not
 * re-tag check `hasAttribute('data-prepr-encoded')` themselves.
 */
export function tagEncodedElement(
  element: Element,
  decoded: StegaDecodedData,
): void {
  element.setAttribute('data-prepr-encoded', '');
  element.setAttribute('data-prepr-href', decoded.href);
  element.setAttribute('data-prepr-origin', decoded.origin);
}
