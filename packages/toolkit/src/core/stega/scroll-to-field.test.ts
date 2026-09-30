import { afterEach, describe, expect, it, vi } from 'vitest';

import { scrollToField } from './scroll-to-field';

const FIELD =
  'sections.items.008.items.content.items.ctas.items.000.items.value';

/** happy-dom has no layout, so scrollIntoView is a spy target, not a behavior. */
function tagged(attrs: Record<string, string>): HTMLElement {
  const el = document.createElement('p');
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  el.scrollIntoView = vi.fn();
  document.body.appendChild(el);
  return el;
}

describe('scrollToField', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('smoothly scrolls the element carrying the requested field path into view', () => {
    const el = tagged({ 'data-prepr-encoded': '', 'data-prepr-field': FIELD });

    expect(scrollToField({ field: FIELD })).toBe(true);
    expect(el.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
  });

  it('picks the element on the requested content item when a page repeats one field path', () => {
    const first = tagged({
      'data-prepr-encoded': '',
      'data-prepr-field': FIELD,
      'data-prepr-id': 'item-1',
    });
    const second = tagged({
      'data-prepr-encoded': '',
      'data-prepr-field': FIELD,
      'data-prepr-id': 'item-2',
    });

    expect(scrollToField({ field: FIELD, id: 'item-2' })).toBe(true);
    expect(first.scrollIntoView).not.toHaveBeenCalled();
    expect(second.scrollIntoView).toHaveBeenCalled();
  });

  it('reports no match when the field is not rendered on this page', () => {
    tagged({ 'data-prepr-encoded': '', 'data-prepr-field': 'other.path' });

    expect(scrollToField({ field: FIELD })).toBe(false);
  });

  it('reports no match when the id narrows away the only element with that field', () => {
    tagged({
      'data-prepr-encoded': '',
      'data-prepr-field': FIELD,
      'data-prepr-id': 'item-1',
    });

    expect(scrollToField({ field: FIELD, id: 'item-2' })).toBe(false);
  });

  it('flashes the overlay class on the target and clears it afterwards', () => {
    vi.useFakeTimers();
    const el = tagged({ 'data-prepr-encoded': '', 'data-prepr-field': FIELD });

    scrollToField({ field: FIELD });
    expect(el.classList.contains('prepr-overlay-active')).toBe(true);

    vi.advanceTimersByTime(2000);
    expect(el.classList.contains('prepr-overlay-active')).toBe(false);
  });

  it('ignores an empty field path rather than scrolling to an arbitrary element', () => {
    const el = tagged({ 'data-prepr-encoded': '', 'data-prepr-field': FIELD });

    expect(scrollToField({ field: '' })).toBe(false);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it('matches a field path containing selector metacharacters literally', () => {
    const hostile = '"] , script, [data-x="';
    tagged({ 'data-prepr-encoded': '', 'data-prepr-field': hostile });

    expect(() => scrollToField({ field: hostile })).not.toThrow();
    expect(scrollToField({ field: hostile })).toBe(true);
  });

  it('treats a selector wildcard as a literal field path, matching nothing', () => {
    const el = tagged({ 'data-prepr-encoded': '', 'data-prepr-field': FIELD });

    expect(scrollToField({ field: '*' })).toBe(false);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it('ignores an untagged element that happens to carry a matching field', () => {
    const el = document.createElement('p');
    el.setAttribute('data-prepr-field', FIELD);
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    expect(scrollToField({ field: FIELD })).toBe(false);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });
});
