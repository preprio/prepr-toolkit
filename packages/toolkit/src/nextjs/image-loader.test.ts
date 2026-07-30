import { describe, expect, it } from 'vitest';

import preprImageLoader from './image-loader';

const load = (src: string, width = 200, quality?: number) =>
  preprImageLoader({ src, width, quality: quality as number });

describe('preprImageLoader', () => {
  it('adds width to a bare stream URL (empty `//` transform slot)', () => {
    expect(load('https://acme.stream.prepr.io//image.jpg')).toBe(
      'https://acme.stream.prepr.io/w_200/image.jpg',
    );
  });

  it('upserts width onto an existing single-option transform', () => {
    expect(load('https://acme.stream.prepr.io/w_50/image.jpg')).toBe(
      'https://acme.stream.prepr.io/w_200/image.jpg',
    );
  });

  it('drops a standalone height so width drives the resize', () => {
    expect(load('https://acme.stream.prepr.io/w_50,h_50/image.jpg')).toBe(
      'https://acme.stream.prepr.io/w_200/image.jpg',
    );
  });

  it('keeps height when a crop-extract preset is present', () => {
    expect(load('https://acme.stream.prepr.io/ex_0,ey_0,ew_3888,h_100,w_3888/image.jpg')).toBe(
      'https://acme.stream.prepr.io/ex_0,ey_0,ew_3888,h_100,w_200/image.jpg',
    );
  });

  it('preserves a leading asset-id segment', () => {
    expect(load('https://acme.stream.prepr.io/1pvvjg1/w_50/image.jpg')).toBe(
      'https://acme.stream.prepr.io/1pvvjg1/w_200/image.jpg',
    );
  });

  it('appends quality when given, replacing any existing q', () => {
    expect(load('https://acme.stream.prepr.io/w_50,q_50/image.jpg', 200, 80)).toBe(
      'https://acme.stream.prepr.io/w_200,q_80/image.jpg',
    );
  });

  it('handles the Bunny CDN host family', () => {
    expect(load('https://acme.b-cdn.net/w_50/image.jpg')).toBe(
      'https://acme.b-cdn.net/w_200/image.jpg',
    );
  });

  it('does not mistake an asset id or filename for a transform', () => {
    // 1pvvjg1vm has no underscore; my_image.jpg has an unknown key.
    expect(load('https://acme.stream.prepr.io/1pvvjg1vm/my_image.jpg')).toBe(
      'https://acme.stream.prepr.io/1pvvjg1vm/w_200/my_image.jpg',
    );
  });

  it('preserves query strings', () => {
    expect(load('https://acme.stream.prepr.io/w_50/image.jpg?v=2')).toBe(
      'https://acme.stream.prepr.io/w_200/image.jpg?v=2',
    );
  });

  it('returns non-Prepr and unparseable URLs unchanged', () => {
    expect(load('https://example.com/w_50/image.jpg')).toBe(
      'https://example.com/w_50/image.jpg',
    );
    expect(load('/local/relative.jpg')).toBe('/local/relative.jpg');
  });
});
