import { readEditPayload } from '../stega/dom';
import type { StegaEditPayload } from '../stega/overlay';
import { createScopedLogger } from '../utils';
import { fieldLabel, findFieldElement, type FieldLookup } from './field-path';
import { VisualEditorOverlay } from './overlay';

const debug = createScopedLogger('visual-editor');

const ENCODED_SELECTOR = '[data-prepr-encoded]';
const CURSOR_STYLE_MARKER = 'data-prepr-visual-editor';
const CURSOR_STYLES = `${ENCODED_SELECTOR}{cursor:pointer}html[data-prepr-ve-suspended] ${ENCODED_SELECTOR}{cursor:auto}`;
const SUSPENDED_ATTR = 'data-prepr-ve-suspended';

// Content can be tagged a moment after the editor asks for it: the field sits
// in a section that renders late, or hydration re-renders it first.
const FIND_RETRY_MS = 150;
const FIND_RETRIES = 6;

export interface VisualEditorOptions {
  /** Called when a field is clicked, with the clicked element's payload. */
  onEdit: (payload: StegaEditPayload) => void;
}

export interface VisualEditor {
  start(): void;
  stop(): void;
  /**
   * Scroll the element rendering `field` into view and mark it selected.
   * Retries briefly while the content may still be tagging; resolves to
   * whether an element was found.
   */
  focusField(lookup: FieldLookup): Promise<boolean>;
}

/**
 * Hover outlines, click-to-select and editor-driven selection for a page
 * framed by the Prepr editor. Works on the elements the stega pass tagged
 * (`data-prepr-encoded`), so it adds no DOM scan of its own.
 *
 * Holding Alt suspends it, so links and buttons on the page can be used
 * without leaving the editor.
 */
export function createVisualEditor(opts: VisualEditorOptions): VisualEditor {
  const overlay = new VisualEditorOverlay();
  let running = false;
  let suspended = false;
  let pointerFrame: number | null = null;
  let lastPointerTarget: Element | null = null;
  let findTimeout: ReturnType<typeof setTimeout> | null = null;
  // Settles a superseded focusField promise as not found, so a caller that
  // awaits it is never left hanging.
  let settlePendingFind: (() => void) | null = null;

  const encodedFrom = (node: EventTarget | null): HTMLElement | null =>
    node instanceof Element
      ? node.closest<HTMLElement>(ENCODED_SELECTOR)
      : null;

  const labelFor = (el: HTMLElement): string =>
    fieldLabel(el.getAttribute('data-prepr-field'));

  const setSuspended = (value: boolean): void => {
    if (suspended === value) return;
    suspended = value;
    document.documentElement.toggleAttribute(SUSPENDED_ATTR, value);
    if (value) overlay.setHover(null, '');
  };

  const updateHover = (): void => {
    pointerFrame = null;
    if (suspended) return;
    const encoded = encodedFrom(lastPointerTarget);
    // The selected box already outlines its element; a second box on top of
    // it is noise.
    const target = encoded === overlay.getSelectedTarget() ? null : encoded;
    overlay.setHover(target, target ? labelFor(target) : '');
  };

  const handlePointerMove = (e: PointerEvent): void => {
    setSuspended(e.altKey);
    lastPointerTarget = e.target as Element | null;
    if (pointerFrame === null) {
      pointerFrame = requestAnimationFrame(updateHover);
    }
  };

  const handlePointerLeave = (): void => {
    lastPointerTarget = null;
    overlay.setHover(null, '');
  };

  const handleClick = (e: MouseEvent): void => {
    if (e.altKey) return;
    const encoded = encodedFrom(e.target);
    if (!encoded) return;
    // Capture phase, so the page's own handlers and link navigation never see
    // a click that selects a field.
    e.preventDefault();
    e.stopPropagation();
    const item = listItemIn(encoded, e.target);
    select(item?.element ?? encoded, encoded);
    opts.onEdit({
      ...readEditPayload(encoded),
      ...(item && { block: item.index }),
    });
  };

  const handleKey = (e: KeyboardEvent): void => {
    if (e.key === 'Alt') setSuspended(e.type === 'keydown');
    if (e.type === 'keydown' && e.key === 'Escape') {
      overlay.setSelected(null, '');
    }
  };

  // Alt released outside the frame never reaches it as a keyup.
  const handleBlur = (): void => setSuspended(false);

  const handleScroll = (): void => overlay.onScroll();
  const handleResize = (): void => overlay.schedule();

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

  /** `labelSource` names the field when `el` is a part of it, a list item. */
  function select(el: HTMLElement, labelSource: HTMLElement = el): void {
    overlay.setSelected(el, labelFor(labelSource));
    if (overlay.getHoverTarget() === el) overlay.setHover(null, '');
  }

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
    debug.log('visual editor started');
  }

  function stop(): void {
    if (!running) return;
    running = false;
    if (pointerFrame !== null) cancelAnimationFrame(pointerFrame);
    cancelFind();
    pointerFrame = null;
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
    document
      .querySelectorAll(`style[${CURSOR_STYLE_MARKER}]`)
      .forEach((node) => node.remove());
    overlay.unmount();
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
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (running) select(el, found);
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

  return { start, stop, focusField };
}
