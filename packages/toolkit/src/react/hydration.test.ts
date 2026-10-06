import { describe, expect, it } from 'vitest';

import { isReactHydrated } from './hydration';

// What React leaves on a node it has hydrated or created.
const adopt = (element: Element, props: object = {}) =>
  Object.assign(element, { __reactProps$abc: props });

const html = (markup: string) => {
  document.body.innerHTML = markup;
  return document.body;
};

describe('isReactHydrated', () => {
  it('is false inside a streamed boundary React has not adopted yet', () => {
    const root = html('<main><section><h2>Title</h2></section></main>');
    adopt(root.querySelector('main')!);
    const text = root.querySelector('h2')!.firstChild as Text;
    expect(isReactHydrated(text)).toBe(false);

    adopt(root.querySelector('section')!);
    adopt(root.querySelector('h2')!);
    expect(isReactHydrated(text)).toBe(true);
  });

  it('counts raw HTML as hydrated once its element is', () => {
    html('<div><ul><li>Rich text</li></ul></div>');
    const div = adopt(document.querySelector('div')!, {
      dangerouslySetInnerHTML: { __html: '' },
    });
    expect(isReactHydrated(div.querySelector('li')!.firstChild as Text)).toBe(
      true,
    );
  });

  it('counts text outside React as hydrated', () => {
    html('<p>Plain</p>');
    expect(
      isReactHydrated(document.querySelector('p')!.firstChild as Text),
    ).toBe(true);
  });
});
