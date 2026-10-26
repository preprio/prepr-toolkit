import { beforeEach, describe, expect, it } from 'vitest';

import { applyPatchLogToDom, sanitizeRichText } from './dom-patch';
import type { LivePatch } from './normalize-query';

// Markup as the stega scan leaves it: tags parsed from each edit link.
function tagged(id: string, field: string, inner: string, tag = 'h1'): string {
  return `<${tag} data-prepr-encoded data-prepr-id="${id}" data-prepr-field="${field}">${inner}</${tag}>`;
}

const field = (
  itemId: string,
  name: string,
  value: LivePatch extends infer P
    ? P extends { type: 'field'; value: infer V }
      ? V
      : never
    : never,
  edit?: { item: string; field: string },
): LivePatch =>
  edit
    ? { type: 'field', itemId, field: name, value, edit }
    : { type: 'field', itemId, field: name, value };

describe('applyPatchLogToDom', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('writes a root field into every element that renders it', () => {
    document.body.innerHTML =
      tagged('page-1', 'title', 'Old') +
      tagged('page-1', 'title', 'Old', 'span') +
      tagged('page-2', 'title', 'Other');
    const result = applyPatchLogToDom([field('page-1', 'title', 'New')]);
    expect(result).toEqual({ applied: 1, skipped: 0 });
    expect(
      Array.from(document.querySelectorAll('[data-prepr-id="page-1"]')).map(
        (e) => e.textContent,
      ),
    ).toEqual(['New', 'New']);
    expect(
      document.querySelector('[data-prepr-id="page-2"]')!.textContent,
    ).toBe('Other');
  });

  it('finds a nested entry through the edit target the editor sends', () => {
    document.body.innerHTML = tagged(
      'page-1',
      'sections.items.002.heading',
      'Old',
    );
    applyPatchLogToDom([
      field('section-3', 'heading', 'New', {
        item: 'page-1',
        field: 'sections.2.heading',
      }),
    ]);
    expect(document.body.textContent).toBe('New');
  });

  it('keeps markup next to the value', () => {
    document.body.innerHTML = tagged(
      'p',
      'title',
      '<i class="icon"></i> Old <b>badge</b>',
    );
    applyPatchLogToDom([field('p', 'title', 'New')]);
    const h1 = document.querySelector('h1')!;
    expect(h1.querySelector('i.icon')).not.toBeNull();
    expect(h1.querySelector('b')!.textContent).toBe('badge');
    expect(h1.textContent).toBe(' New badge');
  });

  it('keeps the element click-to-edit', () => {
    document.body.innerHTML = tagged('p', 'title', 'Old');
    applyPatchLogToDom([field('p', 'title', 'New')]);
    const h1 = document.querySelector('h1')!;
    expect(h1.getAttribute('data-prepr-id')).toBe('p');
    expect(h1.getAttribute('data-prepr-field')).toBe('title');
  });

  it('leaves rich text for save unless the element opts in', () => {
    document.body.innerHTML = tagged('p', 'body', 'Old', 'div');
    const result = applyPatchLogToDom([
      field('p', 'body', '<p>New &amp; <b>bold</b></p>'),
    ]);
    expect(document.querySelector('div')!.innerHTML).toBe('Old');
    expect(result).toEqual({ applied: 0, skipped: 1 });
  });

  it('keeps plain text that only looks like markup', () => {
    document.body.innerHTML = tagged('p', 'title', 'Old');
    applyPatchLogToDom([field('p', 'title', 'a < b > c')]);
    expect(document.querySelector('h1')!.textContent).toBe('a < b > c');
    applyPatchLogToDom([field('p', 'title', '<3 this')]);
    expect(document.querySelector('h1')!.textContent).toBe('<3 this');
  });

  it('writes sanitized rich text where data-prepr-live="html"', () => {
    document.body.innerHTML = `<section data-prepr-live="html">${tagged('p', 'body', 'Old', 'div')}</section>`;
    applyPatchLogToDom([
      field(
        'p',
        'body',
        '<p onclick="x()">Hi <a href="javascript:alert(1)">x</a><script>alert(1)</script><img src=x onerror="alert(1)"></p>',
      ),
    ]);
    expect(document.querySelector('div')!.innerHTML).toBe('<p>Hi <a>x</a></p>');
  });

  it('leaves elements marked data-prepr-live="off" alone', () => {
    document.body.innerHTML = `<div data-prepr-live="off">${tagged('p', 'date', '1 Jan')}</div>`;
    const result = applyPatchLogToDom([field('p', 'date', '2026-01-02')]);
    expect(document.querySelector('h1')!.textContent).toBe('1 Jan');
    expect(result).toEqual({ applied: 0, skipped: 1 });
  });

  it('skips what the page cannot show without a render', () => {
    document.body.innerHTML = tagged('p', 'title', 'Old');
    const result = applyPatchLogToDom([
      field('p', 'image', { url: 'https://cdn.example/a.jpg' }),
      { type: 'list', itemId: 'p', field: 'content', entries: [] },
      field('p', 'subtitle', 'Not on the page'),
    ]);
    expect(result).toEqual({ applied: 0, skipped: 3 });
  });

  it('is idempotent: replaying the log changes nothing more', () => {
    document.body.innerHTML = tagged('p', 'title', 'Old');
    const log = [field('p', 'title', 'A'), field('p', 'title', 'AB')];
    applyPatchLogToDom(log);
    applyPatchLogToDom(log);
    expect(document.querySelector('h1')!.textContent).toBe('AB');
  });

  it('never interprets editor values as selectors', () => {
    document.body.innerHTML = tagged('p', 'title', 'Old');
    expect(() =>
      applyPatchLogToDom([field('"] , *', 'title"]', 'x')]),
    ).not.toThrow();
    expect(document.querySelector('h1')!.textContent).toBe('Old');
  });
});

describe('sanitizeRichText', () => {
  const html = (input: string): string => {
    const div = document.createElement('div');
    div.appendChild(sanitizeRichText(input));
    return div.innerHTML;
  };

  it('keeps formatting markup and safe links', () => {
    expect(
      html('<h2>T</h2><ul><li><a href="/x" target="_blank">l</a></li></ul>'),
    ).toBe(
      '<h2>T</h2><ul><li><a href="/x" target="_blank" rel="noopener noreferrer">l</a></li></ul>',
    );
  });

  it('drops script URLs, including ones with smuggled whitespace', () => {
    expect(html('<a href="java\tscript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(html('<a href=" data:text/html,x">x</a>')).toBe('<a>x</a>');
  });

  it('unwraps unknown elements and drops active ones', () => {
    expect(
      html('<custom-el>keep</custom-el><style>p{}</style><iframe></iframe>'),
    ).toBe('keep');
  });

  it('drops attributes other than link targets', () => {
    expect(html('<p style="color:red" class="x" id="y">t</p>')).toBe(
      '<p>t</p>',
    );
  });
});
