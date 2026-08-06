import { describe, expect, it } from 'vitest';

import preprImageLoader from './image-loader';

const load = (src: string, width = 200) =>
  preprImageLoader({ src, width, quality: undefined as unknown as number });

const CDN = 'https://393qibegr87z.b-cdn.net';

describe('preprImageLoader', () => {
  it('scales width and height, holding the emitted ratio', () => {
    expect(load(`${CDN}/w_800,h_600/b7ijwafd586-photo.jpg`, 400)).toBe(
      `${CDN}/w_400,h_300/b7ijwafd586-photo.jpg`,
    );
  });

  it('preserves the focal point across a resize', () => {
    expect(load(`${CDN}/w_800,h_600,fx_75,fy_67/b7ijwafd586-photo.jpg`, 400)).toBe(
      `${CDN}/w_400,h_300,fx_75,fy_67/b7ijwafd586-photo.jpg`,
    );
  });

  it('rewrites a width with no height alongside it', () => {
    expect(load(`${CDN}/w_800/b7ijwafd586-photo.jpg`, 400)).toBe(
      `${CDN}/w_400/b7ijwafd586-photo.jpg`,
    );
  });

  it('rounds a non-integer scaled height', () => {
    // 300 * 401/800 = 150.375
    expect(load(`${CDN}/w_800,h_300/b7ijwafd586-photo.jpg`, 401)).toBe(
      `${CDN}/w_401,h_150/b7ijwafd586-photo.jpg`,
    );
  });

  it('does not clamp to the emitted width', () => {
    expect(load(`${CDN}/w_800,h_600/b7ijwafd586-photo.jpg`, 1600)).toBe(
      `${CDN}/w_1600,h_1200/b7ijwafd586-photo.jpg`,
    );
  });

  it('leaves the asset-id filename alone', () => {
    expect(load(`${CDN}/w_800,h_600/b7ijwafd586-my-new-filename.jpg`, 400)).toBe(
      `${CDN}/w_400,h_300/b7ijwafd586-my-new-filename.jpg`,
    );
  });

  it('preserves query strings', () => {
    expect(load(`${CDN}/w_800/b7ijwafd586-photo.jpg?v=2`, 400)).toBe(
      `${CDN}/w_400/b7ijwafd586-photo.jpg?v=2`,
    );
  });

  it('returns URLs with no width option unchanged', () => {
    expect(load('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
    expect(load('/local/relative.jpg')).toBe('/local/relative.jpg');
  });
});
