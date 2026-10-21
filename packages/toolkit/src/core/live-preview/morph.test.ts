import { describe, expect, it } from 'vitest';

import { morphElement } from './morph';

function fragment(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('morphElement', () => {
  it('updates changed text in place and keeps unchanged nodes', () => {
    const current = fragment('<h2 id="t">Old</h2><p>Same</p>');
    const heading = current.querySelector('h2')!;
    const paragraph = current.querySelector('p')!;
    morphElement(current, fragment('<h2 id="t">New</h2><p>Same</p>'));
    expect(current.querySelector('h2')).toBe(heading);
    expect(heading.textContent).toBe('New');
    expect(current.querySelector('p')).toBe(paragraph);
  });

  it('replaces an element whose tag changed', () => {
    const current = fragment('<h2>Title</h2>');
    morphElement(current, fragment('<h1>Title</h1>'));
    expect(current.innerHTML).toBe('<h1>Title</h1>');
  });

  it('syncs attributes but keeps the attributes the toolkit adds at runtime', () => {
    const current = fragment('<img class="a" src="1.jpg">');
    const img = current.querySelector('img')!;
    img.setAttribute('data-prepr-encoded', '');
    morphElement(current, fragment('<img class="b" src="2.jpg">'));
    expect(current.querySelector('img')).toBe(img);
    expect(img.className).toBe('b');
    expect(img.getAttribute('src')).toBe('2.jpg');
    expect(img.hasAttribute('data-prepr-encoded')).toBe(true);
  });

  it('adds, reorders by position and removes children', () => {
    const current = fragment(
      '<section>A</section><section>B</section><section>C</section>',
    );
    morphElement(current, fragment('<section>C</section><section>A</section>'));
    expect(current.textContent).toBe('CA');
    expect(current.children).toHaveLength(2);
  });

  it('never re-inserts scripts and leaves the toolbar alone', () => {
    const current = fragment(
      '<script>window.ran = 1</script><prepr-toolbar></prepr-toolbar><p>x</p>',
    );
    const script = current.querySelector('script')!;
    const toolbar = current.querySelector('prepr-toolbar')!;
    morphElement(current, fragment('<script>window.ran = 2</script><p>y</p>'));
    expect(current.querySelector('script')).toBe(script);
    expect(script.textContent).toBe('window.ran = 1');
    expect(current.querySelector('prepr-toolbar')).toBe(toolbar);
    expect(current.querySelector('p')!.textContent).toBe('y');
  });

  it('replaces a framework island whose props changed', () => {
    const current = fragment(
      '<astro-island props="{&quot;a&quot;:1}"><b>1</b></astro-island>',
    );
    const island = current.querySelector('astro-island')!;
    morphElement(
      current,
      fragment(
        '<astro-island props="{&quot;a&quot;:2}"><b>2</b></astro-island>',
      ),
    );
    expect(current.querySelector('astro-island')).not.toBe(island);
    expect(current.querySelector('astro-island')!.getAttribute('props')).toBe(
      '{"a":2}',
    );
  });
});
