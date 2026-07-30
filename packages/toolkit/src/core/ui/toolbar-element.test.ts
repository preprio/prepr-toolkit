import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createToolbarStore } from '../store';
import type { ToolbarStore } from '../store';
import { definePreprToolbar } from './toolbar-element';
import type { PreprToolbarElement } from './toolbar-element';

// Marks every translated label so we can assert nothing renders a hardcoded
// English string.
const t = (key: string): string => `T[${key}]`;

function mount(store: ToolbarStore): PreprToolbarElement {
  const el = document.createElement('prepr-toolbar') as PreprToolbarElement;
  document.body.appendChild(el);
  el.connect(store, t);
  return el;
}

const SEGMENTS = [
  { _id: 'seg-1', name: 'Cat lovers' },
  { _id: 'seg-2', name: 'Dog lovers' },
];

describe('definePreprToolbar', () => {
  beforeEach(() => {
    definePreprToolbar();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('registers the custom element idempotently', () => {
    expect(customElements.get('prepr-toolbar')).toBeDefined();
    expect(() => definePreprToolbar()).not.toThrow();
  });

  it('renders a shadow root containing the toggle button', () => {
    const store = createToolbarStore({});
    const el = mount(store);

    expect(el.shadowRoot).not.toBeNull();
    const toggle = el.shadowRoot!.querySelector<HTMLButtonElement>(
      '[data-prepr="toggle"]'
    );
    expect(toggle).not.toBeNull();
  });

  it('keeps the panel hidden until toolbarOpen is true', () => {
    const store = createToolbarStore({});
    const el = mount(store);

    const panel = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-prepr="panel"]'
    )!;
    expect(panel.getAttribute('data-open')).toBe('false');

    store.set({ toolbarOpen: true });
    expect(panel.getAttribute('data-open')).toBe('true');
  });

  it('clicking the toggle button opens the panel via store.set', () => {
    const store = createToolbarStore({});
    const setSpy = vi.spyOn(store, 'set');
    const el = mount(store);

    const toggle = el.shadowRoot!.querySelector<HTMLButtonElement>(
      '[data-prepr="toggle"]'
    )!;
    toggle.click();

    expect(setSpy).toHaveBeenCalledWith({ toolbarOpen: true });
  });

  it('renders segments as listbox options', () => {
    const store = createToolbarStore({
      segments: SEGMENTS,
      previewMode: true,
      toolbarOpen: true,
    });
    const el = mount(store);

    const options = el.shadowRoot!.querySelectorAll('[role="option"]');
    const labels = Array.from(options).map(o => o.textContent?.trim());
    expect(labels).toEqual(
      expect.arrayContaining(['Cat lovers', 'Dog lovers'])
    );
  });

  it('selecting a segment option writes selectedSegment via store.set', () => {
    const store = createToolbarStore({
      segments: SEGMENTS,
      previewMode: true,
      toolbarOpen: true,
    });
    const setSpy = vi.spyOn(store, 'set');
    const el = mount(store);

    const listboxButton = el.shadowRoot!.querySelector<HTMLButtonElement>(
      '[data-prepr="segment-button"]'
    )!;
    listboxButton.click();

    const option = el.shadowRoot!.querySelector<HTMLElement>(
      '[role="option"][data-value="seg-2"]'
    )!;
    option.click();

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ selectedSegment: 'seg-2' })
    );
  });

  it('clicking variant B calls store.set({ selectedVariant: "B" })', () => {
    const store = createToolbarStore({
      previewMode: true,
      toolbarOpen: true,
    });
    const setSpy = vi.spyOn(store, 'set');
    const el = mount(store);

    const variantB = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-prepr="variant"][data-value="B"]'
    )!;
    variantB.click();

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ selectedVariant: 'B' })
    );
  });

  it('preview mode On/Off radios write previewMode via store.set', () => {
    const store = createToolbarStore({ toolbarOpen: true });
    const setSpy = vi.spyOn(store, 'set');
    const el = mount(store);

    const on = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-prepr="preview-mode"][data-value="true"]'
    )!;
    on.click();
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ previewMode: true })
    );

    const off = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-prepr="preview-mode"][data-value="false"]'
    )!;
    off.click();
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ previewMode: false })
    );
  });

  it('edit mode radios write editMode via store.set', () => {
    const store = createToolbarStore({ toolbarOpen: true });
    const setSpy = vi.spyOn(store, 'set');
    const el = mount(store);

    const on = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-prepr="edit-mode"][data-value="true"]'
    )!;
    on.click();
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ editMode: true })
    );
  });

  it('reset button clears personalization via store.set', () => {
    const store = createToolbarStore({
      previewMode: true,
      selectedSegment: 'seg-1',
      selectedVariant: 'B',
      segments: SEGMENTS,
      toolbarOpen: true,
    });
    const setSpy = vi.spyOn(store, 'set');
    const el = mount(store);

    const reset = el.shadowRoot!.querySelector<HTMLButtonElement>(
      '[data-prepr="reset"]'
    )!;
    reset.click();

    const calls = setSpy.mock.calls;
    const patch = calls[calls.length - 1]?.[0];
    // Variant goes to 'A', not null.
    expect(patch).toMatchObject({
      selectedSegment: null,
      selectedVariant: 'A',
      editMode: false,
    });
  });

  it('localizes all labels through the provided t()', () => {
    const store = createToolbarStore({ toolbarOpen: true });
    const el = mount(store);
    const html = el.shadowRoot!.innerHTML;

    expect(html).toContain('T[adaptiveContent.adaptiveContent]');
    expect(html).toContain('T[adaptiveContent.enablePreview]');
    expect(html).toContain('T[adaptiveContent.segment]');
    expect(html).toContain('T[adaptiveContent.ABVariant]');
    expect(html).toContain('T[editingTools.editingTools]');
    expect(html).toContain('T[editingTools.editMode]');
    expect(html).toContain('T[common.reset]');
  });

  it('shows the close-edit-mode pill only when editMode is on', () => {
    const store = createToolbarStore({});
    const el = mount(store);

    const pill = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-prepr="close-edit-pill"]'
    )!;
    expect(pill.hasAttribute('hidden')).toBe(true);

    store.set({ editMode: true });
    expect(pill.hasAttribute('hidden')).toBe(false);
  });

  it('reflects the active segment/variant in the status pill', () => {
    const store = createToolbarStore({
      previewMode: true,
      segments: SEGMENTS,
      selectedSegment: 'seg-1',
      selectedVariant: 'B',
    });
    const el = mount(store);

    const pill = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-prepr="status-pill"]'
    )!;
    expect(pill.textContent).toContain('Cat lovers');
    expect(pill.textContent).toContain('B');
  });

  it('hides the status-pill x when preview mode is off', () => {
    const store = createToolbarStore({
      previewMode: false,
      segments: SEGMENTS,
      selectedSegment: 'seg-1',
    });
    const el = mount(store);

    const x = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-prepr="status-x"]'
    )!;
    expect(x.hasAttribute('hidden')).toBe(true);

    store.set({ previewMode: true });
    expect(x.hasAttribute('hidden')).toBe(false);
  });

  it('filters listbox options by typing in the segment search input', () => {
    const store = createToolbarStore({
      segments: SEGMENTS,
      previewMode: true,
      toolbarOpen: true,
    });
    const el = mount(store);

    el.shadowRoot!.querySelector<HTMLButtonElement>(
      '[data-prepr="segment-button"]'
    )!.click();

    const search = el.shadowRoot!.querySelector<HTMLInputElement>(
      '[data-prepr="segment-search"]'
    )!;
    search.value = 'dog';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    const labels = Array.from(
      el.shadowRoot!.querySelectorAll('[role="option"]')
    ).map(o => o.textContent?.trim());
    expect(labels).toEqual(['Dog lovers']);
  });

  it('injects a <style> tag that themes via var(--prepr-primary', () => {
    const store = createToolbarStore({});
    const el = mount(store);

    const style = el.shadowRoot!.querySelector('style')!;
    expect(style.textContent).toContain('var(--prepr-primary');
    expect(style.textContent).toContain('var(--prepr-bg');
    expect(style.textContent).toContain('var(--prepr-z-index');
  });

  it('does not reset custom properties with `all: initial` on :host', () => {
    // `all: initial` inside :host resets custom properties too, wiping the
    // --prepr-* theme vars and rendering the whole toolbar unstyled.
    const store = createToolbarStore({});
    const el = mount(store);
    const css = el.shadowRoot!.querySelector('style')!.textContent ?? '';

    const hostBlock = css.slice(css.indexOf(':host'), css.indexOf('}', css.indexOf(':host')) + 1);
    expect(hostBlock).not.toMatch(/all\s*:\s*initial/);
    // Concrete defaults, so the toolbar is visible when a consumer sets nothing.
    expect(css).toMatch(/--prepr-primary\s*:\s*#4338ca/);
  });

  it('closes the segment listbox on Escape', () => {
    const store = createToolbarStore({
      segments: SEGMENTS,
      previewMode: true,
      toolbarOpen: true,
    });
    const el = mount(store);

    const button = el.shadowRoot!.querySelector<HTMLButtonElement>(
      '[data-prepr="segment-button"]'
    )!;
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');

    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the off/on description tooltip on hover of preview-mode radios', () => {
    const store = createToolbarStore({ toolbarOpen: true });
    const el = mount(store);

    const tooltip = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-prepr="tooltip"]'
    )!;
    expect(tooltip.hasAttribute('hidden')).toBe(true);

    const off = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-prepr="preview-mode"][data-value="false"]'
    )!;
    off.dispatchEvent(new MouseEvent('mouseenter'));

    expect(tooltip.hasAttribute('hidden')).toBe(false);
    expect(tooltip.textContent).toContain('T[adaptiveContent.offDescription]');

    off.dispatchEvent(new MouseEvent('mouseleave'));
    expect(tooltip.hasAttribute('hidden')).toBe(true);
  });

  it('shows the description tooltip on focus of preview-mode radios (a11y)', () => {
    const store = createToolbarStore({ toolbarOpen: true });
    const el = mount(store);

    const tooltip = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-prepr="tooltip"]'
    )!;
    const on = el.shadowRoot!.querySelector<HTMLElement>(
      '[data-prepr="preview-mode"][data-value="true"]'
    )!;

    on.dispatchEvent(new FocusEvent('focus'));
    expect(tooltip.hasAttribute('hidden')).toBe(false);
    expect(tooltip.textContent).toContain('T[adaptiveContent.onDescription]');

    on.dispatchEvent(new FocusEvent('blur'));
    expect(tooltip.hasAttribute('hidden')).toBe(true);
  });

  it('unsubscribes from the store when disconnected', () => {
    const store = createToolbarStore({});
    const el = mount(store);

    el.remove();

    // Later writes must not touch the detached DOM.
    expect(() => store.set({ toolbarOpen: true })).not.toThrow();
  });
});
