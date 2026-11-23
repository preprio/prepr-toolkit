import { describe, expect, it } from 'vitest';
import { vercelStegaCombine, vercelStegaSplit } from '@vercel/stega';

import { resolveInternalLinks } from './internal-links';
import { writeAtPath } from './patch';

const ITEM = 'puuid#0b0b0b0b-1111-2222-3333-444444444444';
const OTHER = 'puuid#0c0c0c0c-1111-2222-3333-444444444444';
const ASSET = 'auuid#0d0d0d0d-1111-2222-3333-444444444444';

describe('resolveInternalLinks', () => {
  it('leaves text without internal links as it is', () => {
    const value = '<p>See <a href="https://example.com">this</a></p>';
    expect(resolveInternalLinks('<p>Old</p>', value)).toBe(value);
  });

  it('gives an internal link the href the page shows for it', () => {
    const page = '<p>Read <a href="/about-us">about us</a> now</p>';
    const pushed = `<p>Read <a href="${ITEM}">about us</a> today</p>`;
    expect(resolveInternalLinks(page, pushed)).toBe(
      '<p>Read <a href="/about-us">about us</a> today</p>',
    );
  });

  it('keeps the attributes of the pushed link', () => {
    const page = '<p><a href="/a">A</a></p>';
    const pushed = `<p><a target="_blank" href="${ITEM}" rel="noopener">A</a></p>`;
    expect(resolveInternalLinks(page, pushed)).toBe(
      '<p><a target="_blank" href="/a" rel="noopener">A</a></p>',
    );
  });

  it('pairs links in order around external ones', () => {
    const page =
      '<p><a href="/one">One</a> <a href="https://x.dev">X</a> <a href="https://cdn/f.pdf">PDF</a></p>';
    const pushed = `<p><a href="${ITEM}">One</a> <a href="https://x.dev">X</a> <a href="${ASSET}">PDF</a></p>`;
    expect(resolveInternalLinks(page, pushed)).toBe(page);
  });

  it('keeps pairs when a link is added before the others', () => {
    const page = '<p><a href="/one">One</a> and <a href="/two">Two</a></p>';
    const pushed = `<p><a href="https://new.dev">New</a> <a href="${ITEM}">One</a> and <a href="${OTHER}">Two</a></p>`;
    expect(resolveInternalLinks(page, pushed)).toBe(
      '<p><a href="https://new.dev">New</a> <a href="/one">One</a> and <a href="/two">Two</a></p>',
    );
  });

  it('pairs an edited link text by position', () => {
    const page = '<p><a href="/one">One</a></p>';
    const pushed = `<p><a href="${ITEM}">One more</a></p>`;
    expect(resolveInternalLinks(page, pushed)).toBe(
      '<p><a href="/one">One more</a></p>',
    );
  });

  it('shows a link added since the last save as its text', () => {
    const page = '<p>Plain</p>';
    const pushed = `<p>Plain <a href="${ITEM}"><strong>new</strong></a></p>`;
    expect(resolveInternalLinks(page, pushed)).toBe(
      '<p>Plain <strong>new</strong></p>',
    );
  });

  it('does not pair an internal link with an external link the editor still sends', () => {
    const page = '<p><a href="https://x.dev">X</a></p>';
    const pushed = `<p><a href="https://x.dev">X</a> <a href="${ITEM}">Y</a></p>`;
    expect(resolveInternalLinks(page, pushed)).toBe(
      '<p><a href="https://x.dev">X</a> Y</p>',
    );
  });

  it('treats a missing current value as a page without links', () => {
    expect(resolveInternalLinks(null, `<a href="${ITEM}">A</a>`)).toBe('A');
  });
});

describe('writeAtPath with internal links', () => {
  it('writes rich text with internal links resolved and keeps the edit link', () => {
    const body = vercelStegaCombine('<p><a href="/about">About</a></p>', {
      origin: 'prepr',
    });
    const root = { Page: { _id: 'p', description: body } };
    const next = writeAtPath(
      root,
      ['Page', 'description'],
      `<p><a href="${ITEM}">About</a> us</p>`,
    ) as typeof root;
    const { cleaned, encoded } = vercelStegaSplit(next.Page.description);
    expect(cleaned).toBe('<p><a href="/about">About</a> us</p>');
    expect(encoded).toBe(vercelStegaSplit(body).encoded);
  });
});
