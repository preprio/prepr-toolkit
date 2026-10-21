import { afterEach, describe, expect, it } from 'vitest';

import { fieldLabel, findFieldElement, normalizeFieldPath } from './field-path';

function tagged(field: string, id = 'item-1'): HTMLElement {
  const el = document.createElement('p');
  el.setAttribute('data-prepr-encoded', '');
  el.setAttribute('data-prepr-field', field);
  el.setAttribute('data-prepr-id', id);
  document.body.appendChild(el);
  return el;
}

describe('normalizeFieldPath', () => {
  it('strips the padding the editor puts on list indices', () => {
    expect(normalizeFieldPath('stack.items.000.title')).toBe(
      'stack.items.0.title',
    );
    expect(normalizeFieldPath('stack.items.012.cards.items.003.body')).toBe(
      'stack.items.12.cards.items.3.body',
    );
  });

  it('leaves named segments alone', () => {
    expect(normalizeFieldPath('seo.meta_title')).toBe('seo.meta_title');
  });
});

describe('fieldLabel', () => {
  it('names the field by its last named segment', () => {
    expect(fieldLabel('stack.items.000.meta_title')).toBe('Meta title');
    expect(fieldLabel('title')).toBe('Title');
  });

  it('leads a generic leaf with the field that holds it', () => {
    expect(
      fieldLabel('sections.items.000.items.ctas.items.001.items.value'),
    ).toBe('Ctas › Value');
  });

  it('skips the list container and index segments', () => {
    expect(fieldLabel('stack.items.000')).toBe('Stack');
  });

  it('falls back to a generic label without a path', () => {
    expect(fieldLabel(null)).toBe('Edit');
    expect(fieldLabel('')).toBe('Edit');
  });
});

describe('findFieldElement', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('matches a padded editor path against an unpadded tag', () => {
    const el = tagged('stack.items.0.title');
    expect(findFieldElement({ field: 'stack.items.000.title' })).toBe(el);
  });

  it('narrows by content item id when one is given', () => {
    tagged('title', 'item-1');
    const second = tagged('title', 'item-2');
    expect(findFieldElement({ field: 'title', id: 'item-2' })).toBe(second);
  });

  it('treats selector syntax in the field path as plain text', () => {
    tagged('title');
    expect(findFieldElement({ field: '"],*,[x="' })).toBeNull();
  });
});
