/**
 * Bring `current` in line with `next` (a freshly rendered copy of the same
 * page) while keeping every node that did not change. Only changed text,
 * attributes and differing subtrees are touched, so scroll position, focus,
 * running scripts and the state of untouched components survive a server
 * re-render.
 *
 * Elements are matched by position, tag and `id`. A `<script>` is never
 * re-inserted, so nothing executes twice; elements marked
 * `data-prepr-morph-skip` (and the toolbar's own element) are left alone.
 */
export function morphElement(current: Element, next: Element): void {
  syncAttributes(current, next);
  morphChildren(current, next);
}

const SKIP_ATTR = 'data-prepr-morph-skip';
// Attributes the toolkit writes on rendered elements at runtime (edit-mode
// tagging, outlines). A fresh server render does not carry them, and removing
// them would make every tagged element flicker out of edit mode.
const RUNTIME_ATTR_PREFIXES = ['data-prepr-'];

function isRuntimeAttribute(name: string): boolean {
  return RUNTIME_ATTR_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function syncAttributes(current: Element, next: Element): void {
  for (const { name } of Array.from(current.attributes)) {
    if (!next.hasAttribute(name) && !isRuntimeAttribute(name)) {
      current.removeAttribute(name);
    }
  }
  for (const { name, value } of Array.from(next.attributes)) {
    if (current.getAttribute(name) !== value) current.setAttribute(name, value);
  }
}

function isSkipped(node: Node): boolean {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    ((node as Element).hasAttribute(SKIP_ATTR) ||
      (node as Element).localName === 'prepr-toolbar')
  );
}

function sameKind(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== Node.ELEMENT_NODE) return true;
  const ea = a as Element;
  const eb = b as Element;
  return ea.localName === eb.localName && ea.id === eb.id;
}

function morphChildren(current: Element, next: Element): void {
  const wanted = Array.from(next.childNodes).filter((n) => !isSkipped(n));
  const existing = Array.from(current.childNodes).filter((n) => !isSkipped(n));

  wanted.forEach((target, i) => {
    const node = existing[i];
    if (node && sameKind(node, target)) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        // Scripts already ran; an island that changed is replaced whole so
        // its framework hydrates it again with the new props.
        if (element.localName === 'script') return;
        if (
          element.localName === 'astro-island' &&
          !element.isEqualNode(target)
        ) {
          element.replaceWith(adopt(target, current));
          return;
        }
        morphElement(element, target as Element);
      } else if (node.nodeValue !== target.nodeValue) {
        node.nodeValue = target.nodeValue;
      }
      return;
    }
    const replacement = adopt(target, current);
    if (node) node.replaceWith(replacement);
    else current.appendChild(replacement);
  });

  for (const extra of existing.slice(wanted.length)) extra.remove();
}

/** A copy of `node` owned by `parent`'s document, with scripts kept inert. */
function adopt(node: Node, parent: Element): Node {
  const copy = parent.ownerDocument.importNode(node, true);
  if (copy.nodeType === Node.ELEMENT_NODE) {
    const element = copy as Element;
    const scripts =
      element.localName === 'script'
        ? [element]
        : Array.from(element.querySelectorAll('script'));
    // Imported scripts never execute; mark them so readers know why.
    scripts.forEach((s) => s.setAttribute('data-prepr-morphed', ''));
  }
  return copy;
}
