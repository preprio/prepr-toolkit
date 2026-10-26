import type { LivePatch } from './normalize-query';

const INDEX_SEGMENT = /^\d+$/;
const LIVE_ATTRIBUTE = 'data-prepr-live';

/**
 * Field paths travel in several spellings: the editor pads list indices to
 * three digits (`stack.items.000.title`) and a stega link may not
 * (`stack.0.title`). Both are compared without the `items` list container
 * and with plain indices.
 */
function fieldKey(path: string): string {
  return path
    .split('.')
    .filter((segment) => segment && segment !== 'items')
    .map((segment) =>
      INDEX_SEGMENT.test(segment)
        ? String(Number.parseInt(segment, 10))
        : segment,
    )
    .join('.');
}

/** Where a change shows up on the page: the open item and its field path. */
function patchTargets(
  patch: LivePatch,
): Array<{ item: string; field: string }> {
  if (patch.type !== 'field') return [];
  const targets = [{ item: patch.itemId, field: patch.field }];
  // The editor names a component or stack entry by its own `_id`; the page's
  // edit links name the item open in the editor and the full field path.
  if (patch.edit) targets.unshift(patch.edit);
  return targets;
}

function matchingElements(
  candidates: readonly HTMLElement[],
  item: string,
  field: string,
): HTMLElement[] {
  const wanted = fieldKey(field);
  // The values come from the editor; they are compared as strings and never
  // reach a selector.
  return candidates.filter((element) => {
    if (element.getAttribute('data-prepr-id') !== item) return false;
    const tagged = element.getAttribute('data-prepr-field');
    return tagged !== null && fieldKey(tagged) === wanted;
  });
}

const DROPPED_ELEMENTS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'TEMPLATE',
  'NOSCRIPT',
  'SVG',
  'MATH',
  'LINK',
  'META',
  'BASE',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
  'SELECT',
]);

const ALLOWED_ELEMENTS = new Set([
  'A',
  'ABBR',
  'B',
  'BLOCKQUOTE',
  'BR',
  'CODE',
  'DEL',
  'DIV',
  'EM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR',
  'I',
  'INS',
  'LI',
  'MARK',
  'OL',
  'P',
  'PRE',
  'S',
  'SMALL',
  'SPAN',
  'STRONG',
  'SUB',
  'SUP',
  'TABLE',
  'TBODY',
  'TD',
  'TH',
  'THEAD',
  'TR',
  'U',
  'UL',
]);

const SAFE_HREF = /^(?:https?:|mailto:|tel:|\/|#|\.{0,2}\/|[^:]*$)/i;

/**
 * Rich text from the editor as inert DOM, reduced to formatting markup: no
 * scripts, no event handlers, no styles, links only to web, mail and phone
 * URLs. Unknown elements are unwrapped so their text survives.
 */
export function sanitizeRichText(html: string): DocumentFragment {
  // A <template> parses without running scripts or loading resources.
  const template = document.createElement('template');
  template.innerHTML = html;
  const out = document.createDocumentFragment();

  const copy = (source: Node, target: Node): void => {
    for (const child of Array.from(source.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        target.appendChild(document.createTextNode(child.textContent ?? ''));
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const element = child as Element;
      const tag = element.tagName.toUpperCase();
      if (DROPPED_ELEMENTS.has(tag)) continue;
      if (!ALLOWED_ELEMENTS.has(tag)) {
        copy(element, target);
        continue;
      }
      const clean = document.createElement(tag.toLowerCase());
      if (tag === 'A') {
        const href = element.getAttribute('href')?.trim();
        if (href && SAFE_HREF.test(href.replace(/[\t\n\r]/g, ''))) {
          clean.setAttribute('href', href);
        }
        if (element.getAttribute('target') === '_blank') {
          clean.setAttribute('target', '_blank');
          clean.setAttribute('rel', 'noopener noreferrer');
        }
      }
      copy(element, clean);
      target.appendChild(clean);
    }
  };
  copy(template.content, out);
  return out;
}

/**
 * The text a value renders as. Rich text (the editor sends a Text entry's
 * content as HTML) is parsed inertly so entities decode and tags drop; any
 * other value is used as typed, so `a < b` stays intact.
 */
function displayText(value: string): string {
  if (!value.trimStart().startsWith('<')) return value;
  const template = document.createElement('template');
  template.innerHTML = value;
  return template.content.textContent ?? '';
}

/**
 * Replace the element's rendered value. Plain text replaces the first
 * non-blank text node it renders directly, so markup next to the value (an
 * icon, a badge) survives; an element that renders only text is replaced as a
 * whole. Returns false when there is no safe place to write.
 */
function writeText(element: HTMLElement, text: string): boolean {
  if (!element.children.length) {
    if (element.textContent !== text) element.textContent = text;
    return true;
  }
  for (const node of Array.from(element.childNodes)) {
    const current = node.textContent ?? '';
    if (node.nodeType !== Node.TEXT_NODE || !current.trim()) continue;
    // Whitespace around the value separates it from its neighbours.
    const next = current.match(/^\s*/)![0] + text + current.match(/\s*$/)![0];
    if (current !== next) node.textContent = next;
    return true;
  }
  return false;
}

export interface DomPatchResult {
  /** Changes written to the page. */
  applied: number;
  /**
   * Changes the page could not show: structured values (assets, links),
   * list changes, and text no element on the page renders. They appear when
   * the page is rendered again.
   */
  skipped: number;
}

/**
 * Show the editor's unsaved text changes by writing them into the elements
 * whose edit links point at the changed field, with no server round trip.
 *
 * Text is written as text. A field whose element (or an ancestor) carries
 * `data-prepr-live="html"` is written as rich text, reduced to formatting
 * markup first. `data-prepr-live="off"` leaves an element alone, for values
 * the template reformats (dates, truncation) and that should wait for save.
 *
 * Replays the whole log, so applying the same log twice changes nothing.
 */
export function applyPatchLogToDom(
  log: readonly LivePatch[],
  root: ParentNode = document,
): DomPatchResult {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('[data-prepr-encoded]'),
  );
  let applied = 0;
  let skipped = 0;
  for (const patch of log) {
    if (patch.type !== 'field' || typeof patch.value !== 'string') {
      skipped++;
      continue;
    }
    let elements: HTMLElement[] = [];
    for (const { item, field } of patchTargets(patch)) {
      elements = matchingElements(candidates, item, field);
      if (elements.length) break;
    }
    let written = false;
    for (const element of elements) {
      const mode = element
        .closest(`[${LIVE_ATTRIBUTE}]`)
        ?.getAttribute(LIVE_ATTRIBUTE);
      if (mode === 'off') continue;
      if (mode === 'html') {
        element.replaceChildren(sanitizeRichText(patch.value));
        written = true;
      } else if (writeText(element, displayText(patch.value))) {
        written = true;
      }
    }
    if (written) applied++;
    else skipped++;
  }
  return { applied, skipped };
}
