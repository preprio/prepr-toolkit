// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { isPersonalizedResponse } from './personalization';

describe('isPersonalizedResponse', () => {
  it.each([
    ['Prepr-Segments', true],
    ['Prepr-ABTesting5050', true],
    ['prepr-segments', true],
    ['Accept-Encoding, Prepr-ABTesting', true],
    ['Accept-Encoding', false],
    ['', false],
  ])('Vary "%s" -> %s', (vary, expected) => {
    expect(isPersonalizedResponse(new Headers({ Vary: vary }))).toBe(expected);
    expect(
      isPersonalizedResponse(new Response('', { headers: { Vary: vary } })),
    ).toBe(expected);
  });

  it('is false without a Vary header', () => {
    expect(isPersonalizedResponse(new Headers())).toBe(false);
  });
});
