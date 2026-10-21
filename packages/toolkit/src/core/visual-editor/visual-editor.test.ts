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
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
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

    expect(window.scrollTo).toHaveBeenCalled();
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
    expect(window.scrollTo).toHaveBeenCalled();
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

  it('cuts a layer covering part of the element out of its outline', async () => {
    const heading = tagged('title');
    rect(heading);
    // A dropdown panel over the left half of the heading (40..340 x 100..132),
    // overflowing the header it opens from.
    const header = document.createElement('header');
    const menu = document.createElement('div');
    const item = document.createElement('a');
    menu.appendChild(item);
    header.appendChild(menu);
    document.body.appendChild(header);
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 1000, 60),
    );
    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(20, 40, 160, 200),
    );
    vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(30, 100, 140, 20),
    );
    vi.spyOn(document, 'elementFromPoint').mockImplementation((x) =>
      x < 180 ? item : heading,
    );
    editor.start();
    heading.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await nextFrame();

    const selected = box('selected');
    expect(selected.hasAttribute('data-visible')).toBe(true);
    // The box sits at (37, 97); the menu panel is cut out in its coordinates.
    expect(selected.style.clipPath).toContain(
      '-17px -57px, 143px -57px, 143px 143px, -17px 143px',
    );
    expect(selected.hasAttribute('data-label-covered')).toBe(true);

    // The menu closes: the full outline and its label come back.
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(heading);
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    expect(selected.style.clipPath).toBe('');
    expect(selected.hasAttribute('data-label-covered')).toBe(false);
  });

  describe('linked and unrelated items', () => {
    function item(field: string, id: string, tag = 'p'): HTMLElement {
      const el = tagged(field, tag);
      el.setAttribute('data-prepr-id', id);
      return el;
    }

    it('outlines a linked item and names the field that links it', async () => {
      const name = item('name', 'person-1');
      rect(name);
      editor.start();
      editor.setCurrentItem('item-1', [{ id: 'person-1', field: 'author' }]);

      name.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      await nextFrame();

      expect(box('hover').getAttribute('data-item-kind')).toBe('referenced');
      expect(box('hover').textContent).toBe('Author › Name · linked item');
    });

    it('sends the referencing field on click and does not select the linked item', async () => {
      const name = item('name', 'person-1');
      rect(name);
      editor.start();
      editor.setCurrentItem('item-1', [{ id: 'person-1', field: 'author' }]);

      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      name.dispatchEvent(click);
      await nextFrame();

      expect(click.defaultPrevented).toBe(true);
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'person-1',
          field: 'name',
          referenceField: 'author',
        }),
      );
      expect(box('selected').hasAttribute('data-visible')).toBe(false);
    });

    it('treats content nested in a data-prepr-reference container as that linked item', async () => {
      const container = document.createElement('section');
      container.setAttribute('data-prepr-reference', 'personalization-1');
      document.body.appendChild(container);
      const label = item('label', 'tabs-1');
      container.appendChild(label);
      rect(label);
      editor.start();
      editor.setCurrentItem('item-1', [
        { id: 'personalization-1', field: 'sections' },
      ]);

      label.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      await nextFrame();
      expect(box('hover').getAttribute('data-item-kind')).toBe('referenced');

      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      label.dispatchEvent(click);
      await nextFrame();
      expect(onEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'personalization-1',
          referenceField: 'sections',
        }),
      );
    });

    it('ignores a data-prepr-reference container the editor does not list', async () => {
      const container = document.createElement('section');
      container.setAttribute('data-prepr-reference', 'unknown-1');
      document.body.appendChild(container);
      const label = item('label', 'tabs-1');
      container.appendChild(label);
      rect(label);
      editor.start();
      editor.setCurrentItem('item-1', [{ id: 'person-1', field: 'author' }]);

      label.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      await nextFrame();
      expect(box('hover').hasAttribute('data-visible')).toBe(false);
    });

    it('leaves unrelated content alone: no outline, and its clicks reach the page', async () => {
      const nav = item('label', 'navigation-1', 'a');
      rect(nav);
      editor.start();
      editor.setCurrentItem('item-1', [{ id: 'person-1', field: 'author' }]);

      nav.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      await nextFrame();
      expect(box('hover').hasAttribute('data-visible')).toBe(false);

      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      nav.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(false);
      expect(onEdit).not.toHaveBeenCalled();
    });

    it('updates the split when the reference list changes', async () => {
      const name = item('name', 'person-2');
      rect(name);
      editor.start();
      editor.setCurrentItem('item-1', []);
      editor.setReferences([{ id: 'person-2', field: 'reviewer' }]);

      name.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      await nextFrame();
      expect(box('hover').textContent).toBe('Reviewer › Name · linked item');
    });
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

      expect(box('hover').getAttribute('data-item-kind')).toBe('other');
      expect(box('hover').textContent).toBe('Name · other item');
    });

    it('keeps the regular outline for the open item', async () => {
      const heading = tagged('title');
      rect(heading);
      editor.start();
      editor.setCurrentItem('item-1');

      heading.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      await nextFrame();

      expect(box('hover').getAttribute('data-item-kind')).toBe('current');
      expect(box('hover').textContent).toBe('Title');
    });

    it('treats everything as the open item until the editor names one', async () => {
      const name = otherItem('name');
      rect(name);
      editor.start();

      name.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      await nextFrame();

      expect(box('hover').getAttribute('data-item-kind')).toBe('current');
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

      expect(window.scrollTo).toHaveBeenCalled();
      expect(box('selected').hasAttribute('data-visible')).toBe(false);
    });
  });

  it('focusField scrolls only this window, never the editor page around the iframe', async () => {
    const heading = tagged('title');
    rect(heading);
    heading.scrollIntoView = vi.fn();
    editor.start();

    await editor.focusField({ field: 'title' });

    expect(heading.scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    );
  });

  it('clears the selection when clicking beside it, and lets that click through', async () => {
    const heading = tagged('title');
    rect(heading);
    const plain = document.createElement('p');
    document.body.appendChild(plain);
    editor.start();

    heading.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await nextFrame();
    expect(box('selected').hasAttribute('data-visible')).toBe(true);

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    plain.dispatchEvent(click);
    await nextFrame();

    expect(click.defaultPrevented).toBe(false);
    expect(box('selected').hasAttribute('data-visible')).toBe(false);
  });

  describe('label language', () => {
    function item(field: string, id: string): HTMLElement {
      const el = tagged(field, 'p');
      el.setAttribute('data-prepr-id', id);
      rect(el);
      return el;
    }

    async function hover(el: HTMLElement): Promise<string | null> {
      el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
      await nextFrame();
      return box('hover').textContent;
    }

    it('labels linked and other items in English by default', async () => {
      const linked = item('name', 'person-1');
      const other = item('title', 'author-9');
      editor.start();
      editor.setCurrentItem('item-1');

      expect(await hover(other)).toBe('Title · other item');
      editor.setReferences([{ id: 'person-1', field: 'author' }]);
      expect(await hover(linked)).toBe('Author › Name · linked item');
    });

    it('labels in the language set with setLocale, keeping field names as they are', async () => {
      const linked = item('name', 'person-1');
      const other = item('title', 'author-9');
      const fallback = item('', 'item-1');
      editor.start();
      editor.setLocale('de');
      editor.setCurrentItem('item-1');

      expect(await hover(other)).toBe('Title · anderes Element');
      expect(await hover(fallback)).toBe('Bearbeiten');
      editor.setReferences([{ id: 'person-1', field: 'author' }]);
      expect(await hover(linked)).toBe('Author › Name · verknüpftes Element');
    });

    it('starts in the locale it was created with', async () => {
      editor.stop();
      editor = createVisualEditor({ onEdit, locale: 'nl' });
      const other = item('title', 'author-9');
      editor.start();
      editor.setCurrentItem('item-1');

      expect(await hover(other)).toBe('Title · ander item');
    });
  });

  it('moves a label inside its box when it would cover the neighbouring outline', async () => {
    const first = tagged('content.0', 'p');
    const second = tagged('content.1', 'p');
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(40, 100, 600, 32),
    );
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(40, 140, 600, 60),
    );
    editor.start();

    second.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    first.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    await nextFrame();
    await nextFrame();

    expect(box('hover').hasAttribute('data-visible')).toBe(true);
    expect(box('selected').hasAttribute('data-label-inside')).toBe(true);
  });

  it("treats content of the open item's components as its own", async () => {
    const screenshot = tagged('screenshot', 'figure');
    screenshot.setAttribute('data-prepr-id', 'component-7');
    rect(screenshot);
    editor.start();
    editor.setCurrentItem('item-1', [], ['component-7']);

    screenshot.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true }),
    );
    await nextFrame();

    expect(box('hover').getAttribute('data-item-kind')).toBe('current');
    expect(box('hover').textContent).toBe('Screenshot');
  });

  it('keeps links on unrelated content from navigating the preview away', () => {
    const link = document.createElement('a');
    link.href = '/other-page';
    link.textContent = 'Pricing';
    document.body.appendChild(link);
    const pageHandler = vi.fn();
    link.addEventListener('click', pageHandler);
    editor.start();

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    // The page's own handlers still run (menus, tracking).
    expect(pageHandler).toHaveBeenCalled();

    const anchor = document.createElement('a');
    anchor.href = '#faq';
    document.body.appendChild(anchor);
    const inPage = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(inPage);
    expect(inPage.defaultPrevented).toBe(false);

    const alt = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      altKey: true,
    });
    link.dispatchEvent(alt);
    expect(alt.defaultPrevented).toBe(false);
  });

  describe('when content changes under an outline', () => {
    // A mutation is delivered as a microtask; the outline follows within two
    // frames (one to react, one to measure).
    const settle = async (): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await nextFrame();
      await nextFrame();
    };

    const placeAt = (el: HTMLElement, top: number, height = 32): void => {
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(40, top, 300, height),
      );
    };

    const click = (el: HTMLElement): void => {
      el.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    };

    it('moves the selected outline when content added above shifts its field', async () => {
      const heading = tagged('title');
      placeAt(heading, 100);
      editor.start();
      click(heading);
      await settle();
      expect(box('selected').style.transform).toBe(
        'translate3d(37px, 97px, 0)',
      );

      placeAt(heading, 260);
      document.body.insertBefore(document.createElement('section'), heading);
      await settle();

      expect(box('selected').style.transform).toBe(
        'translate3d(37px, 257px, 0)',
      );
    });

    it('resizes the selected outline when its text grows', async () => {
      const heading = tagged('title');
      placeAt(heading, 100);
      editor.start();
      click(heading);
      await settle();

      placeAt(heading, 100, 96);
      heading.firstChild!.textContent = 'A much longer headline over lines';
      await settle();

      expect(box('selected').style.height).toBe('102px');
    });

    it('keeps the selection on a field whose element is re-rendered as another tag', async () => {
      const heading = tagged('content.headline');
      placeAt(heading, 100);
      editor.start();
      click(heading);
      await settle();

      heading.remove();
      const replacement = tagged('content.headline', 'h3');
      placeAt(replacement, 140, 24);
      await settle();

      const selected = box('selected');
      expect(selected.hasAttribute('data-visible')).toBe(true);
      expect(selected.style.transform).toBe('translate3d(37px, 137px, 0)');
      expect(selected.style.height).toBe('30px');
      expect(selected.textContent).toBe('Headline');
    });

    it('hides the selection until the re-rendered element is tagged, then shows it again', async () => {
      const heading = tagged('content.headline');
      placeAt(heading, 100);
      editor.start();
      click(heading);
      await settle();

      heading.remove();
      const replacement = document.createElement('h3');
      replacement.textContent = 'Editable';
      document.body.appendChild(replacement);
      await settle();
      expect(box('selected').hasAttribute('data-visible')).toBe(false);

      placeAt(replacement, 140);
      replacement.setAttribute('data-prepr-id', 'item-1');
      replacement.setAttribute('data-prepr-field', 'content.headline');
      replacement.setAttribute('data-prepr-encoded', '');
      await settle();

      expect(box('selected').hasAttribute('data-visible')).toBe(true);
      expect(box('selected').style.transform).toBe(
        'translate3d(37px, 137px, 0)',
      );
    });

    it('does not bring back a selection that was cleared before the re-render', async () => {
      const heading = tagged('content.headline');
      placeAt(heading, 100);
      editor.start();
      click(heading);
      await settle();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      heading.remove();
      placeAt(tagged('content.headline', 'h3'), 140);
      await settle();

      expect(box('selected').hasAttribute('data-visible')).toBe(false);
    });

    it('moves the hover outline onto the element that replaced the hovered one', async () => {
      const heading = tagged('content.headline');
      placeAt(heading, 100);
      editor.start();
      heading.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 60,
          clientY: 110,
        }),
      );
      await settle();
      expect(box('hover').hasAttribute('data-visible')).toBe(true);

      heading.remove();
      const replacement = tagged('content.headline', 'h3');
      placeAt(replacement, 90, 40);
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(replacement);
      await settle();

      expect(box('hover').hasAttribute('data-visible')).toBe(true);
      expect(box('hover').style.transform).toBe('translate3d(37px, 87px, 0)');
    });
  });
});
