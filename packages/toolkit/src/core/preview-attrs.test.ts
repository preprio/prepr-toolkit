import { describe, expect, it } from 'vitest';

import { previewAttrs } from './preview-attrs';

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
