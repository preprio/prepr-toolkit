import { readEditPayload } from '../stega/dom';
import type { StegaEditPayload } from '../stega/overlay';
import { createScopedLogger } from '../utils';
import { fieldLabel, findFieldElement, type FieldLookup } from './field-path';
import { t, type Locale } from '../i18n';
import type { EditorAsset, EditorReference } from '../iframe-bridge';
import {
  ASSET_SOURCE_ATTRIBUTES,
  createAssetIndex,
  tagAssetImages,
  untagAssetImages,
} from './asset-images';
import { VisualEditorOverlay, type ItemKind } from './overlay';
import { createNavigationGuard, leavingLinkHref } from './navigation-guard';

const debug = createScopedLogger('visual-editor');

const ENCODED_SELECTOR = '[data-prepr-encoded]';
/** Marks where the page renders a linked item; its value is that item's id. */
const REFERENCE_ATTR = 'data-prepr-reference';
const REFERENCE_SELECTOR = `[${REFERENCE_ATTR}]`;
const CURSOR_STYLE_MARKER = 'data-prepr-visual-editor';
const CURSOR_STYLES = `${ENCODED_SELECTOR}{cursor:pointer}html[data-prepr-ve-suspended] ${ENCODED_SELECTOR}{cursor:auto}`;
const SUSPENDED_ATTR = 'data-prepr-ve-suspended';

// Content can be tagged a moment after the editor asks for it: the field sits
// in a section that renders late, or hydration re-renders it first.
const FIND_RETRY_MS = 150;
const FIND_RETRIES = 6;
// Asset keys of image URLs seen on the page, reset once this large.
const MAX_CACHED_KEYS = 2000;

// Content changes that can move or resize an outlined element without
// resizing it (a block added above it) or replace it outright (a heading
// re-rendered as another tag). The stega pass tagging the replacement shows
// up as a `data-prepr-encoded` change.
const LAYOUT_MUTATIONS: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: [
    'class',
    'style',
    'hidden',
    'open',
    'data-prepr-encoded',
    // An image swapped by a carousel or lazy loader can show another asset.
    ...ASSET_SOURCE_ATTRIBUTES,
  ],
};

/** What a selection points at, so it can be found again after a re-render. */
interface Selection {
  lookup: FieldLookup;
  label: HTMLElement;
}

export interface VisualEditorOptions {
  /** Called when a field is clicked, with the clicked element's payload. */
  onEdit: (payload: StegaEditPayload) => void;
  /** Language of the outline labels. Defaults to English. */
  locale?: Locale;
  /**
   * Called with the absolute URL of a navigation that was stopped while the
   * navigation guard is on (see `setNavigationGuard`).
   */
  onNavigationBlocked?: (href: string) => void;
}

export interface VisualEditor {
  start(): void;
  stop(): void;
  /**
   * The content item open in the editor. Elements whose `data-prepr-id`
   * differs are drawn muted and are never selected; clicking one still
   * requests the edit, so the editor can lead to the field that references
   * that item. `null` (the default) treats every element as the open item's.
   */
  setCurrentItem(
    itemId: string | null,
    references?: EditorReference[],
    componentIds?: string[],
  ): void;
  /**
   * Items the open item references, each with the field that links it.
   * Their content is outlined as linked and a click leads to that field;
   * content of any other item gets no outline and its clicks reach the page.
   * Until a list is given, other items are all treated alike (muted).
   */
  setReferences(references: EditorReference[], componentIds?: string[]): void;
  /**
   * Image assets of the open item. Images on the page showing one of them
   * become editable as that asset's field, with no markup from the page.
   */
  setAssets(assets: EditorAsset[]): void;
  /**
   * Language of the outline labels, such as the editor's interface language
   * once the handshake names it. Labels already on screen keep their text
   * until the pointer moves to another element or the selection changes.
   */
  setLocale(locale: Locale): void;
  /**
   * Scroll the element rendering `field` into view and mark it selected.
   * Retries briefly while the content may still be tagging; resolves to
   * whether an element was found.
   */
  focusField(lookup: FieldLookup): Promise<boolean>;
  /**
   * Stop every attempt to move the page to another page (links, client-side
   * route changes, form submissions) and report it through
   * `onNavigationBlocked`, so the editor can ask before the edited page is
   * left. Off by default: links on content unrelated to the open item are
   * then still kept from navigating, but silently. Alt+click, new-tab
   * links and in-page anchors always work.
   */
  setNavigationGuard(enabled: boolean): void;
  /**
   * Go to a page the navigation guard stopped. Only `http(s)` URLs are
   * followed; a stopped form submission is submitted again.
   */
  allowNavigation(href: string): void;
}

/**
 * Centre `el` by scrolling this window only. `scrollIntoView` also scrolls
 * every scrollable ancestor frame, so inside the editor's preview iframe it
 * would scroll the editor page itself whenever a field is focused there.
 */
function scrollIntoFrame(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const offset = Math.max(0, (window.innerHeight - rect.height) / 2);
  window.scrollTo({
    top: Math.max(0, window.scrollY + rect.top - offset),
    behavior: 'smooth',
  });
}

// Browsers without `checkVisibility` (Safari before 17.4) fall back to
// layout boxes, which `display: none` removes.
const isVisible = (el: HTMLElement): boolean =>
  typeof el.checkVisibility === 'function'
    ? el.checkVisibility()
    : el.getClientRects().length > 0;

/**
 * Hover outlines, click-to-select and editor-driven selection for a page
 * framed by the Prepr editor. Works on the elements the stega pass tagged
 * (`data-prepr-encoded`), so it adds no DOM scan of its own.
 *
 * Content of other items on the page (navigation, an author card, related
 * posts) is told apart from the open item once `setCurrentItem` is called.
 *
 * Holding Alt suspends it, so links and buttons on the page can be used
 * without leaving the editor.
 */
export function createVisualEditor(opts: VisualEditorOptions): VisualEditor {
  const overlay = new VisualEditorOverlay();
  let running = false;
  let currentItemId: string | null = null;
  let locale: Locale = opts.locale ?? 'en';
  let suspended = false;
  let pointerFrame: number | null = null;
  let lastPointerTarget: Element | null = null;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let mutationFrame: number | null = null;
  let mutationObserver: MutationObserver | null = null;
  // What the selected box outlines; kept while its element is detached, so a
  // re-rendered element takes the selection back.
  let selection: Selection | null = null;
  let findTimeout: ReturnType<typeof setTimeout> | null = null;
  // Settles a superseded focusField promise as not found, so a caller that
  // awaits it is never left hanging.
  let settlePendingFind: (() => void) | null = null;
  let guardEnabled = false;
  let assetIndex = new Map<string, EditorAsset>();
  const assetKeys = new Map<string, string | null>();
  const guard = createNavigationGuard({
    onBlocked: (href) => opts.onNavigationBlocked?.(href),
    showsEditedContent: () => showsEditedContent(),
  });

  const encodedFrom = (node: EventTarget | null): HTMLElement | null =>
    node instanceof Element
      ? node.closest<HTMLElement>(ENCODED_SELECTOR)
      : null;

  const labelFor = (el: HTMLElement): string =>
    fieldLabel(el.getAttribute('data-prepr-field'), locale);

  // Referencing field per linked item id; null until the editor sends one.
  let references: Map<string, string> | null = null;
  // Component instances of the open item: their content is the item's own.
  let ownComponents = new Set<string>();

  // An element without an id cannot be attributed to another item, so it
  // keeps the open item's behaviour.
  const isCurrentItem = (el: HTMLElement): boolean => {
    if (currentItemId === null) return true;
    const id = el.getAttribute('data-prepr-id');
    return !id || id === currentItemId || ownComponents.has(id);
  };

  /**
   * Whether any visible element shows the open item's own content. Runs only
   * when the page tries to navigate. CMS text in a site's header or footer
   * belongs to other items, and hidden elements (a collapsed menu) show
   * nothing, so neither keeps a page without the item on screen.
   */
  const showsEditedContent = (): boolean => {
    for (const el of document.querySelectorAll<HTMLElement>(ENCODED_SELECTOR)) {
      if (isCurrentItem(el) && isVisible(el)) return true;
    }
    return false;
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
    const id = el.getAttribute('data-prepr-id') ?? '';
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

  /** null: unrelated to the open item, so the visual editor leaves it alone. */
  const itemKind = (el: HTMLElement): ItemKind | null => {
    if (isCurrentItem(el)) return 'current';
    if (!references) return 'other';
    return linkedIdOf(el) ? 'referenced' : null;
  };

  const referenceFieldOf = (el: HTMLElement): string | undefined => {
    const linked = linkedIdOf(el);
    return linked ? references?.get(linked) : undefined;
  };

  const hoverLabel = (el: HTMLElement, kind: ItemKind): string => {
    if (kind === 'other') {
      return `${labelFor(el)} · ${t('visualEditor.otherItem', locale)}`;
    }
    if (kind === 'referenced') {
      const via = referenceFieldOf(el);
      const prefix = via ? `${fieldLabel(via, locale)} › ` : '';
      return `${prefix}${labelFor(el)} · ${t('visualEditor.linkedItem', locale)}`;
    }
    return labelFor(el);
  };

  const setSuspended = (value: boolean): void => {
    if (suspended === value) return;
    suspended = value;
    document.documentElement.toggleAttribute(SUSPENDED_ATTR, value);
    if (value) overlay.setHover(null, '');
  };

  const updateHover = (): void => {
    pointerFrame = null;
    // Menus open and close under the pointer without a scroll or resize, so
    // re-check whether the selected element is still uncovered.
    overlay.schedule();
    if (suspended) return;
    const encoded = encodedFrom(lastPointerTarget);
    // The selected box already outlines its element; a second box on top of
    // it is noise.
    const target = encoded === overlay.getSelectedTarget() ? null : encoded;
    if (!target) {
      overlay.setHover(null, '');
      return;
    }
    const kind = itemKind(target);
    if (!kind) {
      overlay.setHover(null, '');
      return;
    }
    overlay.setHover(target, hoverLabel(target, kind), { kind });
  };

  const handlePointerMove = (e: PointerEvent): void => {
    setSuspended(e.altKey);
    lastPointerTarget = e.target as Element | null;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    if (pointerFrame === null) {
      pointerFrame = requestAnimationFrame(updateHover);
    }
  };

  const handlePointerLeave = (): void => {
    lastPointerTarget = null;
    overlay.setHover(null, '');
  };

  const handleClick = (e: MouseEvent): void => {
    if (e.altKey) {
      // The browser follows the link natively; the guard must not stop it.
      const href = leavingLinkHref(e.target);
      if (href && guard.isActive()) guard.permit(href);
      return;
    }
    const encoded = encodedFrom(e.target);
    const kind = encoded ? itemKind(encoded) : null;
    if (!encoded || !kind) {
      // A click on nothing editable, or on content unrelated to the open
      // item (site navigation, footer), ends the selection like clicking
      // beside a focused field. The page still handles the click (menus,
      // tabs, buttons keep working), but a link does not navigate: leaving
      // the page would leave the item being edited. Alt+click follows it,
      // and so do Ctrl/Cmd/Shift-clicks, which open a new tab or window.
      clearSelection();
      if (e.ctrlKey || e.metaKey || e.shiftKey || !showsEditedContent()) return;
      const href = leavingLinkHref(e.target);
      if (!href) return;
      e.preventDefault();
      if (guard.isActive()) {
        // The editor now asks whether to leave. Page handlers must not act on
        // a navigation that may never happen: route progress bars start on
        // any link click, ignore defaultPrevented, and would wait forever.
        e.stopPropagation();
        guard.block(href);
      }
      return;
    }
    // Capture phase, so the page's own handlers and link navigation never see
    // a click that selects a field.
    e.preventDefault();
    e.stopPropagation();
    const item = listItemIn(encoded, e.target);
    // Another item's field is edited from the field that references it, so it
    // is reported to the editor but not marked as this item's selection.
    if (kind === 'current')
      select(item?.element ?? encoded, encoded, item?.index);
    const referenceField =
      kind === 'referenced' ? referenceFieldOf(encoded) : undefined;
    // Nested content is reported as the linked item the open item knows.
    const linkedId = kind === 'referenced' ? linkedIdOf(encoded) : null;
    opts.onEdit({
      ...readEditPayload(encoded),
      ...(linkedId && { id: linkedId }),
      ...(item && { block: item.index }),
      ...(referenceField && { referenceField }),
    });
  };

  const handleKey = (e: KeyboardEvent): void => {
    if (e.key === 'Alt') setSuspended(e.type === 'keydown');
    if (e.type === 'keydown' && e.key === 'Escape') {
      clearSelection();
    }
  };

  // Alt released outside the frame never reaches it as a keyup.
  const handleBlur = (): void => setSuspended(false);

  const handleScroll = (): void => overlay.onScroll();
  const handleResize = (): void => overlay.schedule();
  // A menu sliding open or a modal fading in ends with one of these.
  const handleSettled = (): void => overlay.schedule();

  /**
   * The list item a click landed in, when the field's value is a rich text
   * list: one field, but each `<li>` is its own line for the editor.
   */
  function listItemIn(
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

  function nthListItem(
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

  /**
   * `field` is the tagged element; `el` is a part of it, the list item at
   * `block`, when only that is selected.
   */
  function select(el: HTMLElement, field: HTMLElement, block?: number): void {
    const entryId = field.getAttribute('data-prepr-entry-id');
    selection = {
      lookup: {
        field: field.getAttribute('data-prepr-field') ?? '',
        id: field.getAttribute('data-prepr-id') ?? undefined,
        ...(entryId && { entryId }),
        ...(block !== undefined && { block }),
      },
      label: field,
    };
    overlay.setSelected(el, labelFor(field));
    if (overlay.getHoverTarget() === el) overlay.setHover(null, '');
  }

  function clearSelection(): void {
    selection = null;
    overlay.setSelected(null, '');
  }

  /**
   * Finds the selected field again once a re-render replaced its element;
   * until the replacement is tagged the box stays hidden.
   */
  function reselect(): void {
    if (!selection) return;
    const current = overlay.getSelectedTarget();
    if (current?.isConnected && selection.label.isConnected) return;
    const found = findFieldElement(selection.lookup);
    if (!found || !isCurrentItem(found)) {
      overlay.setSelected(null, '');
      return;
    }
    const { block } = selection.lookup;
    const el =
      block !== undefined ? (nthListItem(found, block) ?? found) : found;
    select(el, found, block);
  }

  function tagAssets(): void {
    if (assetKeys.size > MAX_CACHED_KEYS) assetKeys.clear();
    tagAssetImages(assetIndex, currentItemId, assetKeys);
  }

  // Runs once per frame at most, after any content change on the page.
  const handleLayoutFrame = (): void => {
    mutationFrame = null;
    if (assetIndex.size) tagAssets();
    reselect();
    const hovered = overlay.getHoverTarget();
    if (hovered && !hovered.isConnected) {
      // The pointer has not moved, so nothing else re-targets the hover box.
      lastPointerTarget = document.elementFromPoint(lastPointerX, lastPointerY);
      updateHover();
      return;
    }
    overlay.schedule();
  };

  const handleMutations = (): void => {
    if (mutationFrame !== null) return;
    if (!selection && !overlay.getHoverTarget() && !assetIndex.size) return;
    mutationFrame = requestAnimationFrame(handleLayoutFrame);
  };

  function injectCursorStyles(): void {
    if (document.querySelector(`style[${CURSOR_STYLE_MARKER}]`)) return;
    const style = document.createElement('style');
    style.setAttribute(CURSOR_STYLE_MARKER, '');
    style.textContent = CURSOR_STYLES;
    document.head.appendChild(style);
  }

  function start(): void {
    if (running) return;
    running = true;
    overlay.mount();
    injectCursorStyles();
    document.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    });
    document.documentElement.addEventListener(
      'pointerleave',
      handlePointerLeave,
    );
    document.addEventListener('click', handleClick, { capture: true });
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('scroll', handleScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener('resize', handleResize, { passive: true });
    document.addEventListener('transitionend', handleSettled, {
      capture: true,
      passive: true,
    });
    document.addEventListener('animationend', handleSettled, {
      capture: true,
      passive: true,
    });
    mutationObserver = new MutationObserver(handleMutations);
    mutationObserver.observe(document.body, LAYOUT_MUTATIONS);
    if (assetIndex.size) tagAssets();
    syncGuard();
    debug.log('visual editor started');
  }

  function stop(): void {
    if (!running) return;
    running = false;
    if (pointerFrame !== null) cancelAnimationFrame(pointerFrame);
    if (mutationFrame !== null) cancelAnimationFrame(mutationFrame);
    mutationObserver?.disconnect();
    mutationObserver = null;
    cancelFind();
    pointerFrame = null;
    mutationFrame = null;
    selection = null;
    lastPointerTarget = null;
    setSuspended(false);
    document.removeEventListener('pointermove', handlePointerMove);
    document.documentElement.removeEventListener(
      'pointerleave',
      handlePointerLeave,
    );
    document.removeEventListener('click', handleClick, { capture: true });
    window.removeEventListener('keydown', handleKey);
    window.removeEventListener('keyup', handleKey);
    window.removeEventListener('blur', handleBlur);
    window.removeEventListener('scroll', handleScroll, { capture: true });
    window.removeEventListener('resize', handleResize);
    document.removeEventListener('transitionend', handleSettled, {
      capture: true,
    });
    document.removeEventListener('animationend', handleSettled, {
      capture: true,
    });
    document
      .querySelectorAll(`style[${CURSOR_STYLE_MARKER}]`)
      .forEach((node) => node.remove());
    overlay.unmount();
    untagAssetImages();
    guard.stop();
    debug.log('visual editor stopped');
  }

  function cancelFind(): void {
    if (findTimeout) clearTimeout(findTimeout);
    findTimeout = null;
    settlePendingFind?.();
    settlePendingFind = null;
  }

  function focusField(lookup: FieldLookup): Promise<boolean> {
    cancelFind();
    return new Promise((resolve) => {
      let attempt = 0;
      const finish = (found: boolean): void => {
        settlePendingFind = null;
        resolve(found);
      };
      settlePendingFind = () => resolve(false);
      const tryFind = (): void => {
        findTimeout = null;
        const found = findFieldElement(lookup);
        if (found) {
          const el =
            lookup.block !== undefined
              ? (nthListItem(found, lookup.block) ?? found)
              : found;
          scrollIntoFrame(el);
          if (running && isCurrentItem(found)) select(el, found, lookup.block);
          finish(true);
          return;
        }
        if (++attempt >= FIND_RETRIES) {
          debug.log('no element renders field', lookup.field);
          finish(false);
          return;
        }
        findTimeout = setTimeout(tryFind, FIND_RETRY_MS);
      };
      tryFind();
    });
  }

  function setCurrentItem(
    itemId: string | null,
    referenceList?: EditorReference[],
    componentIds?: string[],
  ): void {
    currentItemId = itemId;
    if (referenceList) setReferences(referenceList, componentIds);
    else if (componentIds) ownComponents = new Set(componentIds);
    if (running && assetIndex.size) tagAssets();
    const selected = overlay.getSelectedTarget();
    const owner = selected ? encodedFrom(selected) : null;
    if (owner && !isCurrentItem(owner)) clearSelection();
  }

  function setAssets(assets: EditorAsset[]): void {
    const hadAssets = assetIndex.size > 0;
    assetIndex = createAssetIndex(assets);
    // Also with an empty list, so images of removed assets are untagged.
    if (running && (hadAssets || assetIndex.size)) tagAssets();
  }

  function setReferences(
    referenceList: EditorReference[],
    componentIds?: string[],
  ): void {
    if (componentIds) ownComponents = new Set(componentIds);
    references = new Map();
    for (const { id, field } of referenceList) {
      // The first referencing field wins: it is where a click leads.
      if (!references.has(id)) references.set(id, field);
    }
  }

  function setLocale(value: Locale): void {
    locale = value;
  }

  function syncGuard(): void {
    if (running && guardEnabled) guard.start();
    else guard.stop();
  }

  function setNavigationGuard(enabled: boolean): void {
    guardEnabled = enabled;
    syncGuard();
  }

  return {
    start,
    stop,
    setCurrentItem,
    setReferences,
    setAssets,
    setLocale,
    focusField,
    setNavigationGuard,
    allowNavigation: (href: string) => guard.allow(href),
  };
}
