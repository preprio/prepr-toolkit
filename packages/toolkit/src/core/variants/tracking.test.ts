// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { PREPR_CONTEXT_ALIAS as CTX } from './constants';
import { preprVariantProps } from './tracking';

describe('preprVariantProps', () => {
  it('gives a grouped item its variant key, and anything else nothing', () => {
    const item = {
      [CTX]: {
        kind: 'PERSONALIZATION',
        group_id: 'g',
        variant_id: 'X',
        variant_key: 'key-x',
      },
    };
    expect(preprVariantProps(item)).toEqual({
      'data-prepr-variant-key': 'key-x',
    });
    expect(preprVariantProps({ _id: 'plain' })).toEqual({});
    expect(preprVariantProps(null)).toEqual({});
  });
});
