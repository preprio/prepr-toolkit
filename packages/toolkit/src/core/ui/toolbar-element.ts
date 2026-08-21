import { h, render } from 'preact';

import type { ToolbarState, ToolbarStore } from '../store';
import { Panel } from './panel';
import type { PanelHandlers } from './panel';

type Translate = (key: string) => string;

const TAG_NAME = 'prepr-toolbar';

// `class X extends HTMLElement` evaluates HTMLElement at module load, so
// importing this under Node/SSR (Next.js server render, or the RSC pass that
// pulls in a 'use client' dependency graph) throws ReferenceError long before
// definePreprToolbar()'s own guard runs. The no-op base keeps the declaration
// side-effect-free; nothing instantiates the element server-side anyway.
const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

/**
 * `<prepr-toolbar>` — the toolbar UI, in a shadow root so its CSS neither leaks
 * into nor is affected by the host page. Markup is Preact JSX in `panel.tsx`.
 *
 * This element is the controller: it owns interaction state (listbox open,
 * keyboard nav, tooltip positioning, outside-click) and writes back ONLY via
 * `store.set(...)`. Cookies/postMessage/navigation belong to create-preview.ts,
 * which subscribes to the same store.
 *
 * State reaches `<Panel>` as a prop rather than internal Preact state, so every
 * `render()` diffs synchronously against the shadow root.
 */
export class PreprToolbarElement extends HTMLElementBase {
  private store: ToolbarStore | null = null;
  private t: Translate = key => key;
  private unsubscribe: (() => void) | null = null;
  private listboxOpen = false;
  private segmentFilter = '';

  private readonly handlers: PanelHandlers = {
    onToggle: () => this.set({ toolbarOpen: !this.state.toolbarOpen }),
    onClose: () => this.set({ toolbarOpen: false }),
    onPreviewMode: value => this.set({ previewMode: value }),
    onEditMode: value => {
      if (!this.state.features.editMode) return;
      this.set({ editMode: value });
    },
    onVariant: value => {
      if (!this.state.features.abTesting) return;
      if (!this.state.previewMode) return;
      this.set({ selectedVariant: value });
    },
    // Reset contract: segment to none, variant to 'A' — NOT null, since the
    // resulting `variant_changed` must carry 'A' on the wire — edit mode off.
    // Disabled features are left untouched: their state is already inert and
    // writing it would emit events for a feature the consumer turned off.
    onReset: () => this.set(this.resetPatch({ editMode: false })),
    onStatusPill: () => {
      if (!this.state.previewMode) {
        this.set({ previewMode: true });
        return;
      }
      // Same reset contract as onReset, minus the edit-mode change.
      const patch = this.resetPatch();
      const dirty =
        ('selectedSegment' in patch && this.state.selectedSegment !== null) ||
        ('selectedVariant' in patch && this.state.selectedVariant !== 'A');
      if (dirty) this.set(patch);
    },
    onCloseEditPill: () => this.set({ editMode: false }),
    onSegmentButtonClick: () => this.toggleListbox(!this.listboxOpen),
    onSegmentButtonKeydown: e => this.onListboxKeydown(e),
    onOptionsKeydown: e => this.onListboxKeydown(e),
    onChooseSegment: id => this.chooseSegment(id),
    onSegmentFilterInput: value => {
      this.segmentFilter = value;
      this.renderPanel(this.state);
    },
    onPreviewTooltipEnter: el => this.showTooltip(el),
    onPreviewTooltipLeave: () => this.hideTooltip(),
  };

  /** Idempotent: calling connect twice re-wires to the (possibly new) store. */
  connect(store: ToolbarStore, t: Translate): void {
    this.store = store;
    this.t = t;

    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }

    this.unsubscribe?.();
    this.unsubscribe = store.subscribe(state => this.renderPanel(state));

    // Idempotent: removing a not-added listener is a no-op.
    document.removeEventListener('mousedown', this.onDocumentMouseDown);
    document.addEventListener('mousedown', this.onDocumentMouseDown);

    this.renderPanel(store.get());
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    document.removeEventListener('mousedown', this.onDocumentMouseDown);
  }

  // --------------------------------------------------------------- rendering

  private get state(): ToolbarState {
    return this.store!.get();
  }

  private set(patch: Partial<ToolbarState>): void {
    this.store?.set(patch);
  }

  /** Reset patch covering only the enabled personalization features. */
  private resetPatch(base: Partial<ToolbarState> = {}): Partial<ToolbarState> {
    const { features } = this.state;
    const patch: Partial<ToolbarState> = { ...base };
    if (features.segments) patch.selectedSegment = null;
    if (features.abTesting) patch.selectedVariant = 'A';
    return patch;
  }

  // Synchronous: Preact's top-level render() mutates the DOM before returning.
  private renderPanel(state: ToolbarState): void {
    const root = this.shadowRoot;
    if (!root) return;
    render(
      h(Panel, {
        state,
        t: this.t,
        listboxOpen: this.listboxOpen,
        segmentFilter: this.segmentFilter,
        handlers: this.handlers,
      }),
      root
    );
  }

  // ---------------------------------------------------------------- tooltip

  private tip(): HTMLElement | null {
    return this.shadowRoot?.querySelector('[data-prepr="tooltip"]') ?? null;
  }

  /**
   * Show the tooltip for a trigger carrying `data-tooltip-key`. Applied
   * imperatively rather than through the Preact tree: hover/focus never write
   * to the store, so no re-render can clobber it in between. Positioning is
   * centered above the trigger, clamped to the viewport with 8px padding,
   * arrow tracking the trigger center.
   */
  private showTooltip(trigger: HTMLElement): void {
    const tooltip = this.tip();
    if (!tooltip) return;
    const textEl = tooltip.querySelector<HTMLElement>(
      '[data-prepr="tooltip-text"]'
    );
    const arrowEl = tooltip.querySelector<HTMLElement>(
      '[data-prepr="tooltip-arrow"]'
    );
    const key = trigger.getAttribute('data-tooltip-key');
    if (!key || !textEl || !arrowEl) return;

    textEl.textContent = this.t(key);
    tooltip.hidden = false;

    const padding = 8;
    const tip = tooltip.getBoundingClientRect();
    const tri = trigger.getBoundingClientRect();
    const centerX = tri.left + tri.width / 2;
    const spaceAbove = tri.top - padding;
    const spaceBelow = window.innerHeight - tri.bottom - padding;
    const placeTop =
      tip.height + padding <= spaceAbove || tip.height + padding > spaceBelow;
    const top = placeTop ? tri.top - tip.height - 8 : tri.bottom + 8;
    let left = centerX - tip.width / 2;
    if (left < padding) left = padding;
    if (left + tip.width > window.innerWidth - padding) {
      left = window.innerWidth - padding - tip.width;
    }
    const arrowX = Math.max(10, Math.min(centerX - left, tip.width - 10));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    arrowEl.style.left = `${arrowX}px`;
  }

  private hideTooltip(): void {
    const tooltip = this.tip();
    if (tooltip) tooltip.hidden = true;
  }

  // ------------------------------------------------------- listbox controller

  private segmentButton(): HTMLButtonElement | null {
    return (
      this.shadowRoot?.querySelector<HTMLButtonElement>(
        '[data-prepr="segment-button"]'
      ) ?? null
    );
  }

  private optionsList(): HTMLElement | null {
    return this.shadowRoot?.querySelector<HTMLElement>(
      '[data-prepr="options"]'
    ) ?? null;
  }

  private onDocumentMouseDown = (event: MouseEvent): void => {
    if (!this.listboxOpen) return;
    const button = this.segmentButton();
    const options = this.optionsList();
    if (!button || !options) return;
    const path = event.composedPath();
    if (!path.includes(button) && !path.includes(options)) {
      this.toggleListbox(false);
    }
  };

  private onListboxKeydown(event: Event): void {
    const e = event as KeyboardEvent;
    const options = this.optionEls();
    const inSearch =
      (e.target as HTMLElement | null)?.getAttribute?.('data-prepr') ===
      'segment-search';
    // Space must type into the search input, not select an option.
    if (inSearch && e.key === ' ') return;
    if (options.length === 0 && e.key !== 'Escape') return;

    switch (e.key) {
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (!this.listboxOpen) {
          this.toggleListbox(true);
        } else {
          const active = this.activeOptionIndex();
          if (active >= 0) this.chooseSegment(options[active].dataset.value!);
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        this.toggleListbox(false);
        this.segmentButton()?.focus();
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        if (!this.listboxOpen) this.toggleListbox(true);
        this.moveActiveOption(1);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (!this.listboxOpen) this.toggleListbox(true);
        this.moveActiveOption(-1);
        break;
      }
      default:
        break;
    }
  }

  private optionEls(): HTMLElement[] {
    const options = this.optionsList();
    if (!options) return [];
    return Array.from(options.querySelectorAll<HTMLElement>('[role="option"]'));
  }

  private activeOptionIndex(): number {
    return this.optionEls().findIndex(
      el => el.getAttribute('data-active') === 'true'
    );
  }

  private moveActiveOption(delta: number): void {
    const options = this.optionEls();
    if (options.length === 0) return;
    let index = this.activeOptionIndex();
    index = index < 0 ? 0 : (index + delta + options.length) % options.length;
    options.forEach((el, i) =>
      el.setAttribute('data-active', String(i === index))
    );
    options[index].focus();
  }

  // Open state is view-only, so it lives on the element rather than the store.
  // Active-option attributes and focus are set after the synchronous re-render.
  private toggleListbox(open: boolean): void {
    const button = this.segmentButton();
    if (button?.disabled) return;
    this.listboxOpen = open;
    this.segmentFilter = '';
    this.renderPanel(this.state);
    if (open) {
      const options = this.optionEls();
      const selectedIndex = options.findIndex(
        el => el.getAttribute('aria-selected') === 'true'
      );
      const activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
      options.forEach((el, i) =>
        el.setAttribute('data-active', String(i === activeIndex))
      );
      // Focus the search input so users can type to filter right away;
      // ArrowDown/ArrowUp still moves through the options.
      this.searchInput()?.focus();
    }
  }

  private searchInput(): HTMLInputElement | null {
    return (
      this.shadowRoot?.querySelector<HTMLInputElement>(
        '[data-prepr="segment-search"]'
      ) ?? null
    );
  }

  private chooseSegment(id: string): void {
    if (!this.state.features.segments) return;
    this.listboxOpen = false;
    this.segmentFilter = '';
    // store.set re-renders via the subscriber; the explicit renderPanel below
    // covers the no-change case, where the store skips notifying.
    this.set({ selectedSegment: id });
    this.renderPanel(this.state);
    this.segmentButton()?.focus();
  }
}

/** Idempotent, including across bundles that each try to define the element. */
export function definePreprToolbar(): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, PreprToolbarElement);
  }
}
