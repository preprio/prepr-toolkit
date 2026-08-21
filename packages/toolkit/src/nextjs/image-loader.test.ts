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
    expect(
      load(`${CDN}/w_800,h_600,fx_75,fy_67/b7ijwafd586-photo.jpg`, 400),
    ).toBe(`${CDN}/w_400,h_300,fx_75,fy_67/b7ijwafd586-photo.jpg`);
  });

  it('rewrites a width with no height alongside it', () => {
    expect(load(`${CDN}/w_800/b7ijwafd586-photo.jpg`, 400)).toBe(
      `${CDN}/w_400/b7ijwafd586-photo.jpg`,
    );
  });

  it('keeps the focal point when there is no height', () => {
    expect(load(`${CDN}/w_800,fx_75,fy_67/b7ijwafd586-photo.jpg`, 400)).toBe(
      `${CDN}/w_400,fx_75,fy_67/b7ijwafd586-photo.jpg`,
    );
  });

  it('scales height regardless of option order', () => {
    expect(load(`${CDN}/h_600,w_800/b7ijwafd586-photo.jpg`, 400)).toBe(
      `${CDN}/h_300,w_400/b7ijwafd586-photo.jpg`,
    );
    expect(load(`${CDN}/w_800,fx_75,h_600/b7ijwafd586-photo.jpg`, 400)).toBe(
      `${CDN}/w_400,fx_75,h_300/b7ijwafd586-photo.jpg`,
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

  it('preserves a leading asset-id segment', () => {
    expect(load(`${CDN}/1pvvjg1/w_800,h_600/photo.jpg`, 400)).toBe(
      `${CDN}/1pvvjg1/w_400,h_300/photo.jpg`,
    );
  });

  it('never rewrites the filename, even when it looks like a transform', () => {
    // A `w_`-prefixed asset name is a name, not a transform.
    expect(load(`${CDN}/w_960-banner.jpg`, 400)).toBe(
      `${CDN}/w_960-banner.jpg`,
    );
    expect(load(`${CDN}/w_800/w_960-banner.jpg`, 400)).toBe(
      `${CDN}/w_400/w_960-banner.jpg`,
    );
  });

  it('preserves query strings', () => {
    expect(load(`${CDN}/w_800/b7ijwafd586-photo.jpg?v=2`, 400)).toBe(
      `${CDN}/w_400/b7ijwafd586-photo.jpg?v=2`,
    );
  });

  it('leaves a transform with no width alone', () => {
    expect(load(`${CDN}/fx_75,fy_67/photo.jpg`)).toBe(
      `${CDN}/fx_75,fy_67/photo.jpg`,
    );
    expect(load(`${CDN}/h_600/photo.jpg`)).toBe(`${CDN}/h_600/photo.jpg`);
  });

  it('returns URLs with no transform segment unchanged', () => {
    expect(load(`${CDN}/b7ijwafd586-photo.jpg`)).toBe(
      `${CDN}/b7ijwafd586-photo.jpg`,
    );
    expect(load('https://example.com/photo.jpg')).toBe(
      'https://example.com/photo.jpg',
    );
    expect(load('/local/relative.jpg')).toBe('/local/relative.jpg');
  });
});
