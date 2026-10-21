import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StegaEditPayload } from '../stega';
import { createVisualEditor, type VisualEditor } from './index';

function tagged(field: string, tag = 'h2'): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = 'Editable';
  el.setAttribute('data-prepr-encoded', '');
  el.setAttribute(
    'data-prepr-href',
    `https://acme.prepr.io/content/edit/item-1?field=${field}`,
  );
  el.setAttribute('data-prepr-origin', 'Prepr');
  el.setAttribute('data-prepr-id', 'item-1');
  el.setAttribute('data-prepr-field', field);
  el.setAttribute('data-prepr-locale', 'en-US');
  document.body.appendChild(el);
  return el;
}

function shadow(): ShadowRoot {
  const host = document.querySelector('prepr-visual-editor');
  if (!host?.shadowRoot) throw new Error('visual editor not mounted');
  return host.shadowRoot;
}

function box(kind: 'hover' | 'selected'): HTMLElement {
  return shadow().querySelector<HTMLElement>(`.box.${kind}`)!;
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

function rect(el: HTMLElement): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(40, 100, 300, 32),
  );
}

describe('createVisualEditor', () => {
  let editor: VisualEditor;
  let onEdit: ReturnType<typeof vi.fn<(payload: StegaEditPayload) => void>>;

  beforeEach(() => {
    onEdit = vi.fn<(payload: StegaEditPayload) => void>();
    editor = createVisualEditor({ onEdit });
  });

  afterEach(() => {
    editor.stop();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('mounts its chrome in a shadow root outside <body>', () => {
    editor.start();
    const host = document.querySelector('prepr-visual-editor');
    expect(host?.parentElement).toBe(document.documentElement);
    expect(box('hover')).toBeTruthy();
    expect(box('selected')).toBeTruthy();
  });

  it('outlines and labels the hovered field', async () => {
    const heading = tagged('stack.items.000.title');
    rect(heading);
    editor.start();

    heading.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    await nextFrame();
    await nextFrame();

    expect(box('hover').hasAttribute('data-visible')).toBe(true);
    expect(box('hover').textContent).toBe('Title');
    expect(box('hover').style.transform).toBe('translate3d(37px, 97px, 0)');
  });

  it('selects a clicked field and requests the edit, keeping the page from acting on it', () => {
    const link = tagged('cta_label', 'a');
    link.setAttribute('href', '/elsewhere');
    const pageHandler = vi.fn();
    document.addEventListener('click', pageHandler);
    editor.start();

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(pageHandler).not.toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'item-1',
        field: 'cta_label',
        locale: 'en-US',
      }),
    );
    document.removeEventListener('click', pageHandler);
  });

  it('lets an Alt-click through to the page', () => {
    const link = tagged('cta_label', 'a');
    editor.start();

    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      altKey: true,
    });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('ignores clicks outside tagged content', () => {
    const plain = document.createElement('p');
    document.body.appendChild(plain);
    editor.start();

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    plain.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('focusField scrolls to and selects the field the editor sent, padded indices included', async () => {
    const heading = tagged('stack.items.0.title');
    rect(heading);
    const scroll = vi.fn();
    heading.scrollIntoView = scroll;
    editor.start();

    await expect(
      editor.focusField({ field: 'stack.items.000.title', id: 'item-1' }),
    ).resolves.toBe(true);
    await nextFrame();

    expect(scroll).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
    expect(box('selected').hasAttribute('data-visible')).toBe(true);
    expect(box('selected').textContent).toBe('Title');
  });

  it('focusField waits for content that is tagged a moment later', async () => {
    editor.start();
    const pending = editor.focusField({ field: 'intro' });
    setTimeout(() => {
      tagged('intro').scrollIntoView = vi.fn();
    }, 200);
    await expect(pending).resolves.toBe(true);
  });

  it('focusField settles a superseded request as not found', async () => {
    editor.start();
    const first = editor.focusField({ field: 'missing' });
    const el = tagged('title');
    el.scrollIntoView = vi.fn();
    await editor.focusField({ field: 'title' });
    await expect(first).resolves.toBe(false);
  });

  it('Escape clears the selection', async () => {
    const heading = tagged('title');
    rect(heading);
    editor.start();
    heading.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await nextFrame();
    expect(box('selected').hasAttribute('data-visible')).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextFrame();
    expect(box('selected').hasAttribute('data-visible')).toBe(false);
  });

  it('stop() removes its chrome but keeps the tags, so a restart still finds the content', () => {
    const heading = tagged('title');
    editor.start();
    editor.stop();

    expect(document.querySelector('prepr-visual-editor')).toBeNull();
    expect(
      document.querySelector('style[data-prepr-visual-editor]'),
    ).toBeNull();
    expect(heading.hasAttribute('data-prepr-encoded')).toBe(true);

    editor.start();
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    heading.dispatchEvent(click);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('reports which list item was clicked and selects just that item', async () => {
    const entry = tagged('content.2', 'div');
    entry.innerHTML = '<ul><li>One</li><li id="second">Two</li></ul>';
    const second = entry.querySelector<HTMLElement>('#second')!;
    rect(second);
    editor.start();

    second.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await nextFrame();

    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ field: 'content.2', block: 1 }),
    );
    expect(box('selected').textContent).toBe('Content');
  });

  it('focusField with a block selects that list item', async () => {
    const entry = tagged('content.2', 'div');
    entry.innerHTML =
      '<ol><li>One</li><li>Two</li><li id="third">Three</li></ol>';
    const third = entry.querySelector<HTMLElement>('#third')!;
    third.scrollIntoView = vi.fn();
    editor.start();

    await expect(
      editor.focusField({ field: 'content.2', block: 2 }),
    ).resolves.toBe(true);
    expect(third.scrollIntoView).toHaveBeenCalled();
  });

  it('sends the entry id of a clicked dynamic content entry', () => {
    const entry = tagged('content.4', 'div');
    entry.setAttribute('data-prepr-entry-id', 'element-7');
    editor.start();

    entry.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ field: 'content.4', entryId: 'element-7' }),
    );
  });

  it('hides the selected outline while something else covers the element', async () => {
    const heading = tagged('title');
    rect(heading);
    const menu = document.createElement('nav');
    document.body.appendChild(menu);
    editor.start();
    heading.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    const fromPoint = vi.spyOn(document, 'elementFromPoint');
    fromPoint.mockReturnValue(heading);
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    expect(box('selected').hasAttribute('data-visible')).toBe(true);

    // An open menu now sits on top of the heading.
    fromPoint.mockReturnValue(menu);
    document.dispatchEvent(new Event('transitionend'));
    await nextFrame();
    expect(box('selected').hasAttribute('data-visible')).toBe(false);
  });
  describe('content of other items', () => {
    function otherItem(field: string): HTMLElement {
      const el = tagged(field);
      el.setAttribute('data-prepr-id', 'author-9');
      return el;
    }

    it('outlines another item muted and says so in the label', async () => {
      const name = otherItem('name');
      rect(name);
      editor.start();
      editor.setCurrentItem('item-1');

      name.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      await nextFrame();

      expect(box('hover').hasAttribute('data-other-item')).toBe(true);
      expect(box('hover').textContent).toBe('Name · other item');
    });

    it('keeps the regular outline for the open item', async () => {
      const heading = tagged('title');
      rect(heading);
      editor.start();
      editor.setCurrentItem('item-1');

      heading.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      await nextFrame();

      expect(box('hover').hasAttribute('data-other-item')).toBe(false);
      expect(box('hover').textContent).toBe('Title');
    });

    it('treats everything as the open item until the editor names one', async () => {
      const name = otherItem('name');
      rect(name);
      editor.start();

      name.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      await nextFrame();

      expect(box('hover').hasAttribute('data-other-item')).toBe(false);
      name.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
      await nextFrame();
      expect(box('selected').hasAttribute('data-visible')).toBe(true);
    });

    it('requests the edit on click without selecting the other item', async () => {
      const name = otherItem('name');
      rect(name);
      editor.start();
      editor.setCurrentItem('item-1');

      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      name.dispatchEvent(click);
      await nextFrame();

      expect(click.defaultPrevented).toBe(true);
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'author-9', field: 'name' }),
      );
      expect(box('selected').hasAttribute('data-visible')).toBe(false);
    });

    it('focusField scrolls to another item but does not select it', async () => {
      const name = otherItem('name');
      rect(name);
      const scroll = vi.fn();
      name.scrollIntoView = scroll;
      editor.start();
      editor.setCurrentItem('item-1');

      await expect(
        editor.focusField({ field: 'name', id: 'author-9' }),
      ).resolves.toBe(true);
      await nextFrame();

      expect(scroll).toHaveBeenCalled();
      expect(box('selected').hasAttribute('data-visible')).toBe(false);
    });
  });
});
