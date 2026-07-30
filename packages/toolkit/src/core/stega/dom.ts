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
    acceptNode: node =>
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
 * Tag an element with the attribute triple the click-to-edit overlay looks for.
 * Always overwrites so re-cleans pick up a changed href — callers that must not
 * re-tag check `hasAttribute('data-prepr-encoded')` themselves.
 */
export function tagEncodedElement(
  element: Element,
  decoded: StegaDecodedData
): void {
  element.setAttribute('data-prepr-encoded', '');
  element.setAttribute('data-prepr-href', decoded.href);
  element.setAttribute('data-prepr-origin', decoded.origin);
}
