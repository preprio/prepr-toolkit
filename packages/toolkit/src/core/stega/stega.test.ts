import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vercelStegaCombine } from '@vercel/stega';

import { createStegaController, stegaClean } from './index';

// visible text carrying a hidden { origin, href } payload
function encode(
  visible: string,
  href = 'https://edit.example.com/entry/123',
  origin = 'https://cms.example.com'
): string {
  return vercelStegaCombine(visible, { origin, href });
}

describe('stegaClean', () => {
  it('strips the invisible stega characters from an encoded string', () => {
    const visible = 'Hello world';
    const encoded = encode(visible);

    expect(encoded).not.toBe(visible);
    expect(encoded.length).toBeGreaterThan(visible.length);

    expect(stegaClean(encoded)).toBe(visible);
  });

  it('returns plain text unchanged when there is nothing to strip', () => {
    expect(stegaClean('nothing encoded here')).toBe('nothing encoded here');
  });

  it('returns empty string for empty input', () => {
    expect(stegaClean('')).toBe('');
  });
});

describe('createStegaController', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('start() injects a single <style data-prepr-stega> tag with the page-level classes', () => {
    const controller = createStegaController({ onEdit: vi.fn() });
    controller.start();

    const styles = document.querySelectorAll('style[data-prepr-stega]');
    expect(styles.length).toBe(1);

    const css = styles[0]!.textContent ?? '';
    expect(css).toContain('.prepr-overlay');
    expect(css).toContain('.prepr-tooltip');
    expect(css).toContain('.prepr-proximity-highlight');
    expect(css).toContain('10000');
    expect(css).toContain('10001');

    controller.stop();
  });

  it('start() scans the DOM and tags a planted stega-encoded node', () => {
    const p = document.createElement('p');
    p.textContent = encode('Editable heading');
    document.body.appendChild(p);

    const controller = createStegaController({ onEdit: vi.fn() });
    controller.start();

    const tagged = document.querySelectorAll('[data-prepr-encoded]');
    expect(tagged.length).toBe(1);
    expect(p.getAttribute('data-prepr-href')).toBe(
      'https://edit.example.com/entry/123'
    );
    expect(p.getAttribute('data-prepr-origin')).toBe(
      'https://cms.example.com'
    );

    controller.stop();
  });

  it('stop() removes the injected style tag, overlay/tooltip and clears data attributes', () => {
    const p = document.createElement('p');
    p.textContent = encode('Editable heading');
    document.body.appendChild(p);

    const controller = createStegaController({ onEdit: vi.fn() });
    controller.start();
    controller.stop();

    expect(document.querySelectorAll('style[data-prepr-stega]').length).toBe(0);
    expect(document.querySelectorAll('.prepr-overlay').length).toBe(0);
    expect(document.querySelectorAll('.prepr-tooltip').length).toBe(0);
    expect(document.querySelectorAll('[data-prepr-encoded]').length).toBe(0);
  });

  it('does not tag plain (non-encoded) text nodes', () => {
    const p = document.createElement('p');
    p.textContent = 'Just plain text, no stega';
    document.body.appendChild(p);

    const controller = createStegaController({ onEdit: vi.fn() });
    controller.start();

    expect(document.querySelectorAll('[data-prepr-encoded]').length).toBe(0);

    controller.stop();
  });

  it('fires onEdit with the decoded { href, origin } payload when the tooltip is clicked', () => {
    const p = document.createElement('p');
    p.textContent = encode('Editable heading');
    document.body.appendChild(p);

    const onEdit = vi.fn();
    const controller = createStegaController({ onEdit });
    controller.start();

    // mousemove is what makes the tooltip visible
    p.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 })
    );

    const tooltip = document.querySelector('.prepr-tooltip') as HTMLElement;
    expect(tooltip).toBeTruthy();

    tooltip.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onEdit).toHaveBeenCalledWith({
      href: 'https://edit.example.com/entry/123',
      origin: 'https://cms.example.com',
    });

    controller.stop();
  });

  it('tooltip: false — no overlay/tooltip chrome, cursor-only styles, clicking the element fires onEdit', () => {
    const p = document.createElement('p');
    p.textContent = encode('Editable heading');
    p.setAttribute('data-prepr-id', 'entity-1');
    p.setAttribute('data-prepr-field', 'heading');
    document.body.appendChild(p);

    const onEdit = vi.fn();
    const controller = createStegaController({ onEdit, tooltip: false });
    controller.start();

    expect(document.querySelector('.prepr-overlay')).toBeNull();
    expect(document.querySelector('.prepr-tooltip')).toBeNull();
    const style = document.querySelector('style[data-prepr-stega]');
    expect(style?.textContent).toContain('cursor:pointer');

    p.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 })
    );
    expect(document.querySelector('.prepr-proximity-highlight')).toBeNull();
    expect(p.classList.contains('prepr-overlay-active')).toBe(false);

    p.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onEdit).toHaveBeenCalledWith({
      href: 'https://edit.example.com/entry/123',
      origin: 'https://cms.example.com',
      id: 'entity-1',
      field: 'heading',
    });

    controller.stop();
    expect(document.querySelector('style[data-prepr-stega]')).toBeNull();
  });

  it('start() is idempotent — calling twice does not inject a second style tag', () => {
    const controller = createStegaController({ onEdit: vi.fn() });
    controller.start();
    controller.start();

    expect(document.querySelectorAll('style[data-prepr-stega]').length).toBe(1);

    controller.stop();
  });
});
