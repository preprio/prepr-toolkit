import { ATTR_ID } from '../constants';
import type { EditorReference } from '../iframe-bridge';
import type { ItemKind } from './overlay';

/** Marks where the page renders a linked item; its value is that item's id. */
const REFERENCE_ATTR = 'data-prepr-reference';
const REFERENCE_SELECTOR = `[${REFERENCE_ATTR}]`;
/**
 * Set by the site on an ancestor: `off` keeps content of unrelated items
 * inside it quiet, `on` outlines it even inside site chrome.
 */
const OTHER_ITEM_ATTR = 'data-prepr-other-item';
const OTHER_ITEM_SELECTOR = `[${OTHER_ITEM_ATTR}="on"],[${OTHER_ITEM_ATTR}="off"]`;
// Site chrome (header, footer, menus) renders CMS text of other items on
// every page; outlining it all would bury the edited content.
const CHROME_SELECTOR =
  'header, footer, nav, [role=banner], [role=contentinfo], [role=navigation]';
// A `<header>` or `<footer>` inside one of these belongs to that part of the
// page (a card's header), not to the site.
const SECTIONING_SELECTOR = 'article, aside, main, nav, section';
const PLAIN_HEADER_FOOTER = 'header:not([role]), footer:not([role])';

/**
 * Which content item an element on the page belongs to, as the editor sees
 * it: the open item, an item it links to, or an unrelated one.
 */
export interface ItemScope {
  currentItemId(): string | null;
  setCurrentItem(itemId: string | null): void;
  /** Component instances of the open item: their content is the item's own. */
  setComponents(componentIds: string[]): void;
  /** Items the open item links to, each with the field that links it. */
  setReferences(references: EditorReference[]): void;
  isCurrentItem(el: HTMLElement): boolean;
  linkedIdOf(el: HTMLElement): string | null;
  /** null: unrelated to the open item, so the visual editor leaves it alone. */
  itemKind(el: HTMLElement): ItemKind | null;
  /** The field of the open item that links the item `el` belongs to. */
  referenceFieldOf(el: HTMLElement): string | undefined;
}

export function createItemScope(): ItemScope {
  let currentItemId: string | null = null;
  // Referencing field per linked item id; null until the editor sends one.
  let references: Map<string, string> | null = null;
  // Component instances of the open item: their content is the item's own.
  let ownComponents = new Set<string>();

  // An element without an id cannot be attributed to another item, so it
  // keeps the open item's behaviour.
  const isCurrentItem = (el: HTMLElement): boolean => {
    if (currentItemId === null) return true;
    const id = el.getAttribute(ATTR_ID);
    return !id || id === currentItemId || ownComponents.has(id);
  };

  /**
   * The linked item an element's content belongs to: its own item when the
   * editor lists it, otherwise the nearest enclosing `data-prepr-reference`
   * container the editor lists. The container covers items nested inside a
   * linked item (a reference within a reference), which the editor of the
   * open item does not know about.
   */
  const linkedIdOf = (el: HTMLElement): string | null => {
    if (!references) return null;
    const id = el.getAttribute(ATTR_ID) ?? '';
    if (references.has(id)) return id;
    let container = el.closest<HTMLElement>(REFERENCE_SELECTOR);
    while (container) {
      const linked = container.getAttribute(REFERENCE_ATTR) ?? '';
      if (references.has(linked)) return linked;
      container =
        container.parentElement?.closest<HTMLElement>(REFERENCE_SELECTOR) ??
        null;
    }
    return null;
  };

  /** Whether the site's header, footer or navigation renders `el`. */
  const inSiteChrome = (el: HTMLElement): boolean => {
    let chrome = el.closest<HTMLElement>(CHROME_SELECTOR);
    while (chrome) {
      if (
        !chrome.matches(PLAIN_HEADER_FOOTER) ||
        !chrome.parentElement?.closest(SECTIONING_SELECTOR)
      ) {
        return true;
      }
      chrome =
        chrome.parentElement?.closest<HTMLElement>(CHROME_SELECTOR) ?? null;
    }
    return false;
  };

  /** Whether content of an unrelated item is outlined where `el` sits. */
  const showsOtherItem = (el: HTMLElement): boolean => {
    const choice = el.closest(OTHER_ITEM_SELECTOR);
    if (choice) return choice.getAttribute(OTHER_ITEM_ATTR) === 'on';
    return !inSiteChrome(el);
  };

  /** null: unrelated to the open item, so the visual editor leaves it alone. */
  const itemKind = (el: HTMLElement): ItemKind | null => {
    if (isCurrentItem(el)) return 'current';
    if (!references) return 'other';
    if (linkedIdOf(el)) return 'referenced';
    return showsOtherItem(el) ? 'other' : null;
  };

  const referenceFieldOf = (el: HTMLElement): string | undefined => {
    const linked = linkedIdOf(el);
    return linked ? references?.get(linked) : undefined;
  };

  return {
    currentItemId: () => currentItemId,
    setCurrentItem(itemId): void {
      currentItemId = itemId;
    },
    setComponents(componentIds): void {
      ownComponents = new Set(componentIds);
    },
    setReferences(list): void {
      references = new Map();
      for (const { id, field } of list) {
        // The first referencing field wins: it is where a click leads.
        if (!references.has(id)) references.set(id, field);
      }
    },
    isCurrentItem,
    linkedIdOf,
    itemKind,
    referenceFieldOf,
  };
}
