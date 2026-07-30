import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StegaOverlay } from './overlay';

describe('StegaOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('passes id + field from the element to onEdit on tooltip click', () => {
    const onEdit = vi.fn();
    const overlay = new StegaOverlay(onEdit);
    overlay.create();

    const el = document.createElement('h1');
    el.setAttribute('data-prepr-href', 'https://app.prepr.io/x?f=title');
    el.setAttribute('data-prepr-origin', 'https://app.prepr.io');
    el.setAttribute('data-prepr-id', 'e9');
    el.setAttribute('data-prepr-field', 'seo.meta_title');
    document.body.appendChild(el);

    overlay.show(el);
    overlay.getTooltip()?.click();

    expect(onEdit).toHaveBeenCalledWith({
      href: 'https://app.prepr.io/x?f=title',
      origin: 'https://app.prepr.io',
      id: 'e9',
      field: 'seo.meta_title',
    });
    overlay.cleanup();
  });

  it('leaves id/field undefined for plain server-stega elements', () => {
    const onEdit = vi.fn();
    const overlay = new StegaOverlay(onEdit);
    overlay.create();

    const el = document.createElement('span');
    el.setAttribute('data-prepr-href', 'https://app.prepr.io/y');
    el.setAttribute('data-prepr-origin', 'https://app.prepr.io');
    document.body.appendChild(el);

    overlay.show(el);
    overlay.getTooltip()?.click();

    expect(onEdit).toHaveBeenCalledWith({
      href: 'https://app.prepr.io/y',
      origin: 'https://app.prepr.io',
      id: undefined,
      field: undefined,
    });
    overlay.cleanup();
  });
});
