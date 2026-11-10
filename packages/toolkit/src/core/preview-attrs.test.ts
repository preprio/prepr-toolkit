import { vercelStegaCombine } from '@vercel/stega';
import { describe, expect, it } from 'vitest';

import { previewAttrs, stegaTarget } from './preview-attrs';

describe('previewAttrs', () => {
  it('tags the element so the visual editor can select it', () => {
    expect(
      previewAttrs(
        { id: 'post-1', field: 'cover_image', locale: 'en-GB' },
        { enabled: true },
      ),
    ).toEqual({
      'data-prepr-encoded': '',
      'data-prepr-id': 'post-1',
      'data-prepr-field': 'cover_image',
      'data-prepr-locale': 'en-GB',
    });
  });

  it('emits nothing outside preview, so production HTML stays clean', () => {
    expect(
      previewAttrs({ id: 'post-1', field: 'cover_image' }, { enabled: false }),
    ).toEqual({});
  });

  it('emits nothing without an id', () => {
    expect(
      previewAttrs({ id: undefined, field: 'cover_image' }, { enabled: true }),
    ).toEqual({});
  });
});

const LABEL = vercelStegaCombine('From the range', {
  origin: 'prepr.io',
  href: 'https://acme.prepr.io/content/edit/page-1?utm_campaign=vec&locale=nl-NL&field=content.items.006.items.label&entry=cis_1',
});

describe('stegaTarget', () => {
  it('reads the item, field and locale from an encoded value', () => {
    expect(stegaTarget(LABEL)).toEqual({
      id: 'page-1',
      field: 'content.items.006.items.label',
      locale: 'nl-NL',
    });
  });

  it('targets a sibling field of the same component', () => {
    expect(stegaTarget(LABEL, { field: 'products.items.2' })).toMatchObject({
      id: 'page-1',
      field: 'content.items.006.items.products.items.2',
    });
  });

  it('targets a sibling of a top-level field', () => {
    const title = vercelStegaCombine('Home', {
      origin: 'prepr.io',
      href: 'https://acme.prepr.io/content/edit/page-1?field=title',
    });
    expect(stegaTarget(title, { field: 'cover' })?.field).toBe('cover');
  });

  it('returns null for a value without an edit link', () => {
    expect(stegaTarget('From the range')).toBeNull();
    expect(stegaTarget(undefined)).toBeNull();
  });

  it('feeds previewAttrs, which emits nothing for a null target', () => {
    expect(
      previewAttrs(stegaTarget(LABEL, { field: 'products' }), {
        enabled: true,
      }),
    ).toEqual({
      'data-prepr-encoded': '',
      'data-prepr-id': 'page-1',
      'data-prepr-field': 'content.items.006.items.products',
      'data-prepr-locale': 'nl-NL',
    });
    expect(previewAttrs(stegaTarget('plain'), { enabled: true })).toEqual({});
  });

  it('returns null instead of throwing on a malformed edit link', () => {
    const broken = vercelStegaCombine('Home', {
      origin: 'prepr.io',
      href: 'https://acme.prepr.io/content/edit/%zz?field=title',
    });

    expect(stegaTarget(broken)).toBeNull();
  });
});
