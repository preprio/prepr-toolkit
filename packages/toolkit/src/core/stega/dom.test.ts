import { afterEach, describe, expect, it } from 'vitest';

import { tagEncodedElement } from './dom';

const HREF =
  'https://prepr-migration-prepr-bv.prepr.io/content/edit/fbac852d-510a-444c-9a1d-dde6818c2b54?utm_campaign=vec&locale=en-GB&field=sections.items.008.items.content.items.ctas.items.000.items.value';

const ORIGIN = 'https://prepr-migration-prepr-bv.prepr.io';

function tag(href: string): HTMLElement {
  const el = document.createElement('h1');
  document.body.appendChild(el);
  tagEncodedElement(el, { href, origin: ORIGIN });
  return el;
}

describe('tagEncodedElement', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('always tags the encoded marker plus href and origin', () => {
    const el = tag(HREF);

    expect(el.hasAttribute('data-prepr-encoded')).toBe(true);
    expect(el.getAttribute('data-prepr-href')).toBe(HREF);
    expect(el.getAttribute('data-prepr-origin')).toBe(ORIGIN);
  });

  it('extracts the content item id, field path, and locale from the edit URL', () => {
    const el = tag(HREF);

    expect(el.getAttribute('data-prepr-id')).toBe(
      'fbac852d-510a-444c-9a1d-dde6818c2b54',
    );
    expect(el.getAttribute('data-prepr-field')).toBe(
      'sections.items.008.items.content.items.ctas.items.000.items.value',
    );
    expect(el.getAttribute('data-prepr-locale')).toBe('en-GB');
  });

  it('omits field and locale when the edit URL carries neither', () => {
    const el = tag(`${ORIGIN}/content/edit/abc123`);

    expect(el.getAttribute('data-prepr-id')).toBe('abc123');
    expect(el.hasAttribute('data-prepr-field')).toBe(false);
    expect(el.hasAttribute('data-prepr-locale')).toBe(false);
  });

  it('clears a stale field path when re-tagged with a different href', () => {
    const el = tag(HREF);
    expect(el.hasAttribute('data-prepr-field')).toBe(true);

    tagEncodedElement(el, {
      href: `${ORIGIN}/content/edit/other`,
      origin: ORIGIN,
    });

    expect(el.getAttribute('data-prepr-id')).toBe('other');
    expect(el.hasAttribute('data-prepr-field')).toBe(false);
    expect(el.hasAttribute('data-prepr-locale')).toBe(false);
  });

  it('resolves a relative edit URL against the current page', () => {
    const el = tag('/content/edit/rel-1?field=title');

    expect(el.getAttribute('data-prepr-id')).toBe('rel-1');
    expect(el.getAttribute('data-prepr-field')).toBe('title');
  });

  it('tags without id, field, or locale when the href does not parse as a URL', () => {
    const el = tag('http://[unclosed');

    expect(el.hasAttribute('data-prepr-encoded')).toBe(true);
    expect(el.getAttribute('data-prepr-href')).toBe('http://[unclosed');
    expect(el.hasAttribute('data-prepr-id')).toBe(false);
    expect(el.hasAttribute('data-prepr-field')).toBe(false);
    expect(el.hasAttribute('data-prepr-locale')).toBe(false);
  });

  it('does not tag an id when the edit URL has no path', () => {
    const el = tag(ORIGIN);

    expect(el.hasAttribute('data-prepr-id')).toBe(false);
  });
});
