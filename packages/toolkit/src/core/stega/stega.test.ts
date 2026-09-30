import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vercelStegaCombine, vercelStegaSplit } from '@vercel/stega';

import { createStegaController, stegaClean } from './index';

// visible text carrying a hidden { origin, href } payload
function encode(
  visible: string,
  href = 'https://edit.example.com/entry/123',
  origin = 'https://cms.example.com',
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
      'https://edit.example.com/entry/123',
    );
    expect(p.getAttribute('data-prepr-origin')).toBe('https://cms.example.com');

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
      new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 }),
    );

    const tooltip = document.querySelector('.prepr-tooltip') as HTMLElement;
    expect(tooltip).toBeTruthy();

    tooltip.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onEdit).toHaveBeenCalledWith({
      href: 'https://edit.example.com/entry/123',
      origin: 'https://cms.example.com',
      id: '123',
      field: undefined,
      locale: undefined,
    });

    controller.stop();
  });

  it('tooltip: false — no overlay/tooltip chrome, cursor-only styles, clicking the element fires onEdit', () => {
    const p = document.createElement('p');
    // id, field, and locale are parsed out of the encoded edit URL, so the
    // click payload carries them without the page setting any attribute.
    p.textContent = encode(
      'Editable heading',
      'https://edit.example.com/content/edit/entity-1?field=heading&locale=en-GB',
    );
    document.body.appendChild(p);

    const onEdit = vi.fn();
    const controller = createStegaController({ onEdit, tooltip: false });
    controller.start();

    expect(document.querySelector('.prepr-overlay')).toBeNull();
    expect(document.querySelector('.prepr-tooltip')).toBeNull();
    const style = document.querySelector('style[data-prepr-stega]');
    expect(style?.textContent).toContain('cursor:pointer');

    p.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 }),
    );
    expect(document.querySelector('.prepr-proximity-highlight')).toBeNull();
    expect(p.classList.contains('prepr-overlay-active')).toBe(false);

    p.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onEdit).toHaveBeenCalledWith({
      href: 'https://edit.example.com/content/edit/entity-1?field=heading&locale=en-GB',
      origin: 'https://cms.example.com',
      id: 'entity-1',
      field: 'heading',
      locale: 'en-GB',
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

describe('createStegaAutoClean', () => {
  it('start() strips encoded text and tags the parent synchronously', async () => {
    const { createStegaAutoClean } = await import('./auto-clean');
    document.body.innerHTML = '';
    const h1 = document.createElement('h1');
    h1.textContent = encode('Hello world');
    document.body.appendChild(h1);

    const autoClean = createStegaAutoClean();
    autoClean.start();

    // No idle callback, no timers: the first scan must complete before
    // start() returns, or a reload racing it leaves tagged-but-encoded text.
    expect(h1.textContent).toBe('Hello world');
    expect(h1.hasAttribute('data-prepr-encoded')).toBe(true);
    expect(h1.getAttribute('data-prepr-href')).toBe(
      'https://edit.example.com/entry/123',
    );

    autoClean.stop();
    document.body.innerHTML = '';
  });

  it('leaves plain text alone', async () => {
    const { createStegaAutoClean } = await import('./auto-clean');
    document.body.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = 'nothing encoded here';
    document.body.appendChild(p);

    const autoClean = createStegaAutoClean();
    autoClean.start();

    expect(p.textContent).toBe('nothing encoded here');
    expect(p.hasAttribute('data-prepr-encoded')).toBe(false);

    autoClean.stop();
    document.body.innerHTML = '';
  });
});

describe('createStegaAutoClean document.title', () => {
  it('strips stega characters from the document title', async () => {
    const { createStegaAutoClean } = await import('./auto-clean');
    document.body.innerHTML = '';
    document.title = encode('Homepage');

    const autoClean = createStegaAutoClean();
    autoClean.start();

    expect(document.title).toBe('Homepage');
    autoClean.stop();
  });
});

describe('stega auto-clean reveals hidden content', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('tags a node that had no layout box at clean time once it is revealed', async () => {
    const { createStegaAutoClean } = await import('./auto-clean');

    // A collapsed dropdown: the text is in the DOM but the panel generates no
    // box, so the first clean strips the payload with nothing to tag.
    document.body.innerHTML = `<nav><div id="panel"><a id="item">${encode('Digital leaders')}</a></div></nav>`;
    const item = document.getElementById('item')!;

    // happy-dom reports a box even for display:none, so the collapsed state is
    // emulated directly: no client rects until the dropdown "opens".
    let open = false;
    vi.spyOn(item, 'getClientRects').mockImplementation(
      () => (open ? [{}] : []) as unknown as DOMRectList,
    );

    const autoClean = createStegaAutoClean();
    autoClean.start();

    // stripped for the visitor, but not yet editable
    expect(item.textContent).toBe('Digital leaders');
    expect(item.hasAttribute('data-prepr-encoded')).toBe(false);

    // opening the dropdown changes only an inline style: no text mutation and
    // no added nodes, which is exactly the case that used to be missed.
    open = true;
    document.getElementById('panel')!.setAttribute('style', 'display:block');

    await vi.waitFor(() =>
      expect(item.hasAttribute('data-prepr-encoded')).toBe(true),
    );
    expect(item.getAttribute('data-prepr-href')).toBe(
      'https://edit.example.com/entry/123',
    );

    autoClean.stop();
  });
});

describe('stega auto-clean mutation batching', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('cleans every batch when mutations arrive faster than the debounce', async () => {
    const { createStegaAutoClean } = await import('./auto-clean');

    document.body.innerHTML = '<div id="root"></div>';
    const root = document.getElementById('root')!;

    const autoClean = createStegaAutoClean();
    autoClean.start();

    // Streaming SSR / hydration: each append restarts the 50ms debounce, so
    // every batch but the last used to be discarded with its nodes still
    // encoded and untagged.
    const nodes: HTMLElement[] = [];
    for (let i = 0; i < 5; i++) {
      const p = document.createElement('p');
      p.textContent = encode(`Item ${i}`);
      root.appendChild(p);
      nodes.push(p);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    await vi.waitFor(() => {
      nodes.forEach((node, i) => {
        expect(node.textContent).toBe(`Item ${i}`);
        expect(node.hasAttribute('data-prepr-encoded')).toBe(true);
      });
    });

    autoClean.stop();
  });
});

describe('stega auto-clean in-place text updates', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  // A visible element, as in a real browser; happy-dom reports no layout.
  function visibleSpan(text: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.textContent = text;
    vi.spyOn(span, 'getClientRects').mockReturnValue([
      {},
    ] as unknown as DOMRectList);
    document.body.appendChild(span);
    return span;
  }

  // React reuses a text node when only its string changes (a tab label, a
  // monthly/annual toggle): it writes `nodeValue`, which arrives as a
  // characterData mutation rather than an added node.
  it('cleans a text node the framework rewrites with new encoded content', async () => {
    const { createStegaAutoClean } = await import('./auto-clean');
    const price = visibleSpan('plain before hydration');

    const autoClean = createStegaAutoClean();
    autoClean.start();

    price.firstChild!.nodeValue = encode(
      'Billed monthly',
      'https://edit.example.com/entry/monthly',
    );

    await vi.waitFor(() => {
      expect(price.textContent).toBe('Billed monthly');
      expect(price.getAttribute('data-prepr-href')).toBe(
        'https://edit.example.com/entry/monthly',
      );
    });

    autoClean.stop();
  });

  it('cleans a previously cleaned text node rewritten with different encoded content', async () => {
    const { createStegaAutoClean } = await import('./auto-clean');
    const price = visibleSpan(
      encode('Billed monthly', 'https://edit.example.com/entry/monthly'),
    );

    const autoClean = createStegaAutoClean();
    autoClean.start();
    expect(price.textContent).toBe('Billed monthly');

    price.firstChild!.nodeValue = encode(
      'Billed yearly',
      'https://edit.example.com/entry/annual',
    );

    await vi.waitFor(() => {
      expect(price.textContent).toBe('Billed yearly');
      expect(price.getAttribute('data-prepr-href')).toBe(
        'https://edit.example.com/entry/annual',
      );
    });

    autoClean.stop();
  });
});

describe('stega auto-clean undecodable fragments', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  // Prepr rich-text (HTML) fields can spread one payload over several text
  // nodes, e.g. `<li>Personalization{23 chars}</li><li>A/B testing{277
  // chars}</li>`. No single node decodes, but every one must still be stripped.
  function fragmentOf(visible: string, from: number, to: number): string {
    const { encoded } = vercelStegaSplit(encode(visible));
    return visible + encoded.slice(from, to);
  }

  it('strips a stega run that does not decode on its own', async () => {
    const { createStegaAutoClean } = await import('./auto-clean');
    document.body.innerHTML = `<ul><li id="a">${fragmentOf('Personalization', 0, 23)}</li><li id="b">${fragmentOf('A/B testing', 23, 300)}</li></ul>`;

    const autoClean = createStegaAutoClean();
    autoClean.start();

    expect(document.getElementById('a')!.textContent).toBe('Personalization');
    expect(document.getElementById('b')!.textContent).toBe('A/B testing');
    // Nothing decodable, so nothing to open in the CMS.
    expect(document.querySelector('[data-prepr-encoded]')).toBeNull();

    autoClean.stop();
  });

  it('strips an undecodable fragment inserted after start', async () => {
    const { createStegaAutoClean } = await import('./auto-clean');
    const autoClean = createStegaAutoClean();
    autoClean.start();

    const li = document.createElement('li');
    li.textContent = fragmentOf('Visual editing', 0, 40);
    document.body.appendChild(li);

    await vi.waitFor(() => expect(li.textContent).toBe('Visual editing'));

    autoClean.stop();
  });

  it('leaves undecodable fragments in place when autoClean is disabled', async () => {
    const { createStegaAutoClean } = await import('./auto-clean');
    const raw = fragmentOf('Personalization', 0, 23);
    document.body.innerHTML = `<p id="p">${raw}</p>`;

    const autoClean = createStegaAutoClean({ enabled: false });
    autoClean.start();

    expect(document.getElementById('p')!.textContent).toBe(raw);
    autoClean.stop();
  });
});

describe('createStegaAutoClean autoClean disabled', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('leaves the encoded text in place but still tags for click-to-edit', async () => {
    const { createStegaAutoClean } = await import('./auto-clean');

    const h1 = document.createElement('h1');
    const encoded = encode('Hello world');
    h1.textContent = encoded;
    document.body.appendChild(h1);
    document.title = encode('Homepage');

    const autoClean = createStegaAutoClean({ enabled: false });
    autoClean.start();

    expect(h1.textContent).toBe(encoded);
    expect(document.title).toBe(encode('Homepage'));
    // Editing must keep working for a site that strips the characters itself.
    expect(h1.getAttribute('data-prepr-href')).toBe(
      'https://edit.example.com/entry/123',
    );

    autoClean.stop();
  });
});
