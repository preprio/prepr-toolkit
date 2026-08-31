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

describe('StegaOverlay tooltip placement', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  const showOn = (top: number, bottom: number): HTMLElement => {
    const el = document.createElement('h1');
    el.setAttribute('data-prepr-href', 'https://app.prepr.io/x');
    el.setAttribute('data-prepr-origin', 'https://app.prepr.io');
    document.body.appendChild(el);
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      top,
      bottom,
      left: 100,
      right: 300,
      width: 200,
      height: bottom - top,
    } as DOMRect);
    return el;
  };

  it('marks the tooltip as flipped below when there is no room above', async () => {
    const overlay = new StegaOverlay(vi.fn());
    const { tooltip } = overlay.create();
    // element pinned to the very top of the viewport
    overlay.show(showOn(0, 40));

    await vi.waitFor(() =>
      expect(tooltip.dataset.preprPlacement).toBe('below'),
    );
    overlay.cleanup();
  });

  it('keeps the default above placement when the element has room', async () => {
    const overlay = new StegaOverlay(vi.fn());
    const { tooltip } = overlay.create();
    overlay.show(showOn(400, 440));

    await vi.waitFor(() =>
      expect(tooltip.dataset.preprPlacement).toBe('above'),
    );
    overlay.cleanup();
  });
});
