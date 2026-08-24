import { beforeEach, describe, expect, it } from 'vitest';
import { vercelStegaCombine } from '@vercel/stega';

import { StegaElements } from './elements';

const HREF = 'https://edit.example.com/entry/123';
const ORIGIN = 'https://cms.example.com';

const encode = (visible: string): string =>
  vercelStegaCombine(visible, { origin: ORIGIN, href: HREF });

describe('StegaElements tagging targets', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('tags the parent element of an encoded text node', () => {
    document.body.innerHTML = `<p>${encode('Editable heading')}</p>`;

    new StegaElements().scanDocument();

    const tagged = document.querySelectorAll('[data-prepr-encoded]');
    expect(tagged.length).toBe(1);
    expect(tagged[0]!.tagName).toBe('P');
    expect(tagged[0]!.getAttribute('data-prepr-href')).toBe(HREF);
  });

  it('tags the [data-prepr-edit-target] ancestor rather than the immediate parent', () => {
    document.body.innerHTML = `<article data-prepr-edit-target><h2><span>${encode('Title')}</span></h2></article>`;

    new StegaElements().scanDocument();

    const tagged = document.querySelectorAll('[data-prepr-encoded]');
    expect(tagged.length).toBe(1);
    expect(tagged[0]!.tagName).toBe('ARTICLE');
  });

  it('skips a display:none parent and tags nothing when there is no edit target', () => {
    document.body.innerHTML = `<p>Visible copy<span style="display:none">${encode('')}</span></p>`;

    new StegaElements().scanDocument();

    expect(document.querySelectorAll('[data-prepr-encoded]').length).toBe(0);
  });

  it('promotes an encoded hidden span to its [data-prepr-edit-target] ancestor', () => {
    document.body.innerHTML = `<p data-prepr-edit-target>Visible copy<span style="display:none">${encode('')}</span></p>`;

    new StegaElements().scanDocument();

    const tagged = document.querySelectorAll('[data-prepr-encoded]');
    expect(tagged.length).toBe(1);
    expect(tagged[0]!.tagName).toBe('P');
    expect(tagged[0]!.getAttribute('data-prepr-href')).toBe(HREF);
  });

  it('skips a visibility:hidden parent', () => {
    document.body.innerHTML = `<p>Copy<span style="visibility:hidden">${encode('')}</span></p>`;

    new StegaElements().scanDocument();

    expect(document.querySelectorAll('[data-prepr-encoded]').length).toBe(0);
  });

  it('skips a parent hidden with the hidden attribute', () => {
    document.body.innerHTML = `<p>Copy<span hidden>${encode('')}</span></p>`;

    new StegaElements().scanDocument();

    expect(document.querySelectorAll('[data-prepr-encoded]').length).toBe(0);
  });
});
