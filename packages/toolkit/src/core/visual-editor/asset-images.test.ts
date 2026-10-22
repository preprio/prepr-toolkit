import { afterEach, describe, expect, it } from 'vitest';

import {
  assetKey,
  createAssetIndex,
  srcsetUrls,
  tagAssetImages,
  untagAssetImages,
} from './asset-images';

const TEMPLATE =
  'https://demo.stream.prepr.io/1fwxobmosdis/{format}/pexels-photo.jpg';
const KEY = '1fwxobmosdis/pexels-photo.jpg';

describe('assetKey', () => {
  it.each([
    ['the editor template', TEMPLATE],
    [
      'the default API url',
      'https://demo.stream.prepr.io/1fwxobmosdis/w_4317/pexels-photo.jpg',
    ],
    [
      'a preset with crop and focal point',
      'https://demo.stream.prepr.io/1fwxobmosdis/w_2000,h_1000,ex_10,ey_20,ew_800,eh_400,fx_50,fy_50/pexels-photo.jpg',
    ],
    [
      'a loader-rewritten width with a query',
      'https://demo.stream.prepr.io/1fwxobmosdis/w_1000/pexels-photo.jpg?v=3#x',
    ],
    [
      'another CDN host for the same asset',
      'https://demo.b-cdn.net/1fwxobmosdis/w_640/pexels-photo.jpg',
    ],
    [
      'the template without its format segment',
      'https://demo.stream.prepr.io/1fwxobmosdis/pexels-photo.jpg',
    ],
    [
      'an image proxy wrapping the asset url',
      '/_next/image?url=https%3A%2F%2Fdemo.stream.prepr.io%2F1fwxobmosdis%2Fw_1000%2Fpexels-photo.jpg&w=1080&q=75',
    ],
  ])('gives the stable key for %s', (_, url) => {
    expect(assetKey(url)).toBe(KEY);
  });

  it('keeps a file name that looks like a transform', () => {
    expect(assetKey('https://cdn.example.com/abc123/w_960')).toBe(
      'abc123/w_960',
    );
  });

  it('tells different assets apart', () => {
    expect(
      assetKey('https://demo.stream.prepr.io/other123/w_100/pexels-photo.jpg'),
    ).not.toBe(KEY);
  });

  it.each([
    ['empty', ''],
    ['a bare file', 'https://cdn.example.com/logo.png'],
    ['a root path', '/'],
    ['an over-long url', `https://cdn.example.com/a/${'x'.repeat(5000)}.jpg`],
    ['a data url', 'data:image/png;base64,iVBORw0KGgo='],
  ])('returns null for %s', (_, url) => {
    expect(assetKey(url)).toBeNull();
  });

  it('never throws on malformed input', () => {
    for (const url of ['http://[::1', '%E0%A4%A', '/%E0%A4%A/x/%zz.jpg']) {
      expect(() => assetKey(url)).not.toThrow();
    }
  });
});

describe('srcsetUrls', () => {
  it('keeps the commas inside Prepr transform segments', () => {
    expect(
      srcsetUrls(
        'https://a.io/id/w_640,h_320/f.jpg 640w, https://a.io/id/w_1280,h_640/f.jpg 1280w',
      ),
    ).toEqual([
      'https://a.io/id/w_640,h_320/f.jpg',
      'https://a.io/id/w_1280,h_640/f.jpg',
    ]);
  });

  it('reads candidates without descriptors or spaces after commas', () => {
    expect(srcsetUrls('/a/1.jpg, /a/2.jpg 2x,/a/3.jpg')).toEqual([
      '/a/1.jpg',
      '/a/2.jpg',
      '/a/3.jpg',
    ]);
  });

  it('handles empty and whitespace-only values', () => {
    expect(srcsetUrls('')).toEqual([]);
    expect(srcsetUrls('   ')).toEqual([]);
  });
});

describe('tagAssetImages', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const index = createAssetIndex([
    { key: TEMPLATE, field: 'content.items.c1.items.image' },
    {
      key: 'https://demo.stream.prepr.io/dc000001/{format}/dc.jpg',
      field: 'body',
      entryId: 'asset-9',
    },
  ]);

  function img(attrs: Record<string, string>): HTMLImageElement {
    const el = document.createElement('img');
    for (const [name, value] of Object.entries(attrs)) {
      el.setAttribute(name, value);
    }
    document.body.appendChild(el);
    return el;
  }

  it('tags an image showing an asset of the open item like stega text', () => {
    const el = img({
      src: 'https://demo.stream.prepr.io/1fwxobmosdis/w_1000/pexels-photo.jpg',
    });
    tagAssetImages(index, 'page-1', new Map());
    expect(el.hasAttribute('data-prepr-encoded')).toBe(true);
    expect(el.getAttribute('data-prepr-id')).toBe('page-1');
    expect(el.getAttribute('data-prepr-field')).toBe(
      'content.items.c1.items.image',
    );
    expect(el.hasAttribute('data-prepr-entry-id')).toBe(false);
  });

  it('matches srcset candidates and <picture> sources', () => {
    const fromSrcset = img({
      src: '/placeholder.gif',
      srcset:
        'https://demo.stream.prepr.io/1fwxobmosdis/w_640,h_320/pexels-photo.jpg 640w',
    });
    const picture = document.createElement('picture');
    const source = document.createElement('source');
    source.setAttribute(
      'srcset',
      'https://demo.stream.prepr.io/dc000001/w_800,h_400/dc.jpg 1x',
    );
    const inner = document.createElement('img');
    inner.setAttribute('src', '/fallback.jpg');
    picture.append(source, inner);
    document.body.appendChild(picture);

    tagAssetImages(index, 'page-1', new Map());

    expect(fromSrcset.getAttribute('data-prepr-field')).toBe(
      'content.items.c1.items.image',
    );
    expect(inner.getAttribute('data-prepr-field')).toBe('body');
    expect(inner.getAttribute('data-prepr-entry-id')).toBe('asset-9');
  });

  it('leaves images the page tagged itself alone', () => {
    const el = img({
      src: 'https://demo.stream.prepr.io/1fwxobmosdis/w_1000/pexels-photo.jpg',
      'data-prepr-encoded': '',
      'data-prepr-id': 'own',
      'data-prepr-field': 'cover',
    });
    tagAssetImages(index, 'page-1', new Map());
    expect(el.getAttribute('data-prepr-id')).toBe('own');
    expect(el.getAttribute('data-prepr-field')).toBe('cover');
  });

  it('untags an image once it shows another asset or the list drops it', () => {
    const el = img({
      src: 'https://demo.stream.prepr.io/1fwxobmosdis/w_1000/pexels-photo.jpg',
    });
    tagAssetImages(index, 'page-1', new Map());
    el.setAttribute(
      'src',
      'https://demo.stream.prepr.io/unknown01/w_1000/other.jpg',
    );
    tagAssetImages(index, 'page-1', new Map());
    expect(el.hasAttribute('data-prepr-encoded')).toBe(false);
    expect(el.hasAttribute('data-prepr-field')).toBe(false);

    el.setAttribute('src', TEMPLATE.replace('{format}', 'w_10'));
    tagAssetImages(index, 'page-1', new Map());
    tagAssetImages(new Map(), 'page-1', new Map());
    expect(el.hasAttribute('data-prepr-encoded')).toBe(false);
  });

  it('writes nothing when the tags are already current', async () => {
    img({
      src: 'https://demo.stream.prepr.io/1fwxobmosdis/w_1000/pexels-photo.jpg',
    });
    tagAssetImages(index, 'page-1', new Map());
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((list) => records.push(...list));
    observer.observe(document.body, { attributes: true, subtree: true });
    tagAssetImages(index, 'page-1', new Map());
    await Promise.resolve();
    observer.disconnect();
    expect(records).toHaveLength(0);
  });

  it('untagAssetImages removes only its own tags', () => {
    const ours = img({ src: TEMPLATE.replace('{format}', 'w_10') });
    const own = img({ src: '/x.jpg', 'data-prepr-encoded': '' });
    tagAssetImages(index, 'page-1', new Map());
    untagAssetImages();
    expect(ours.hasAttribute('data-prepr-encoded')).toBe(false);
    expect(own.hasAttribute('data-prepr-encoded')).toBe(true);
  });

  it('indexes the first field when one asset is used twice', () => {
    const twice = createAssetIndex([
      { key: TEMPLATE, field: 'first' },
      { key: TEMPLATE, field: 'second' },
      { key: 'https://cdn.example.com/logo.png', field: 'too-generic' },
    ]);
    expect([...twice.values()].map((asset) => asset.field)).toEqual(['first']);
  });
});
