import type { EditorAsset } from '../iframe-bridge';

const MAX_URL_LENGTH = 4096;
// Prepr asset paths are `/<asset id>/<file name>`; fewer segments are too
// generic (`/logo.png`) to say which asset an image shows.
const MIN_KEY_SEGMENTS = 2;
// One option of a CDN transform segment: `w_1000`, `ex_12`, `fx_50`.
const TRANSFORM_OPTION = /^[a-z]{1,3}_[\w.-]*$/i;
const FORMAT_PLACEHOLDER = '{format}';
// Image proxies (framework image optimizers, CDNs) carry the original URL in
// one of these query parameters.
const PROXY_PARAMS = ['url', 'href', 'src', 'image'];
const ABSOLUTE_HTTP = /^https?:\/\//i;
const SOURCE_URL_ATTRIBUTES = ['src', 'data-src'];
const SOURCE_SET_ATTRIBUTES = ['srcset', 'data-srcset'];

/** Marks an image this pass tagged, so it can be untagged again. */
export const ASSET_ATTR = 'data-prepr-asset';
/** Attributes whose changes can change which asset an image shows. */
export const ASSET_SOURCE_ATTRIBUTES = [
  ...SOURCE_URL_ATTRIBUTES,
  ...SOURCE_SET_ATTRIBUTES,
];
const TAG_ATTRIBUTES = [
  'data-prepr-encoded',
  'data-prepr-id',
  'data-prepr-field',
  'data-prepr-entry-id',
  ASSET_ATTR,
];

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function isTransformSegment(segment: string): boolean {
  return (
    segment === FORMAT_PLACEHOLDER ||
    segment.split(',').every((option) => TRANSFORM_OPTION.test(option))
  );
}

/**
 * The part of an asset URL that stays the same however the image is sized:
 * the path without its resize segment (`w_1000,h_500`), host, query and
 * hash. A loader that rewrites the width, a CDN alias for the same asset and
 * the editor's `{format}` template all give the same key. A URL wrapped by an
 * image proxy (`/_next/image?url=…`) is unwrapped first.
 *
 * Null when the URL cannot be parsed or is too generic to identify an asset.
 */
export function assetKey(url: string, depth = 0): string | null {
  if (!url || url.length > MAX_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(url, 'https://base.invalid');
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (depth === 0) {
    for (const name of PROXY_PARAMS) {
      const inner = parsed.searchParams.get(name);
      if (inner && ABSOLUTE_HTTP.test(inner)) return assetKey(inner, 1);
    }
  }
  const segments = parsed.pathname
    .split('/')
    .filter(Boolean)
    .map(decodeSegment);
  // The file name is never a transform, even when it looks like one.
  const file = segments.pop();
  if (!file) return null;
  const kept = segments.filter((segment) => !isTransformSegment(segment));
  kept.push(file);
  return kept.length >= MIN_KEY_SEGMENTS ? kept.join('/') : null;
}

/**
 * The image URLs of a `srcset` value. Candidates are split on whitespace, not
 * commas: Prepr transform segments contain commas (`w_800,h_600`).
 */
export function srcsetUrls(srcset: string): string[] {
  const urls: string[] = [];
  let expectUrl = true;
  for (const token of srcset.split(/\s+/)) {
    if (!token) continue;
    if (!expectUrl) {
      // A descriptor (`800w`, `2x`); a comma ends the candidate, and anything
      // after it without a space starts the next one.
      const comma = token.indexOf(',');
      if (comma === -1) continue;
      expectUrl = true;
      const rest = token.slice(comma + 1);
      if (!rest) continue;
      urls.push(rest.replace(/,+$/, ''));
      expectUrl = rest.endsWith(',');
      continue;
    }
    const url = token.replace(/^,+|,+$/g, '');
    if (url) urls.push(url);
    expectUrl = token.endsWith(',');
  }
  return urls;
}

/** Asset per key; the first entry wins when one asset is used twice. */
export function createAssetIndex(
  assets: readonly EditorAsset[],
): Map<string, EditorAsset> {
  const index = new Map<string, EditorAsset>();
  for (const asset of assets) {
    const key = assetKey(asset.key);
    if (key && !index.has(key)) index.set(key, asset);
  }
  return index;
}

function urlsOf(img: HTMLImageElement): string[] {
  const urls: string[] = [];
  const collect = (el: Element): void => {
    for (const name of SOURCE_URL_ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value) urls.push(value);
    }
    for (const name of SOURCE_SET_ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value) urls.push(...srcsetUrls(value));
    }
  };
  collect(img);
  const picture = img.parentElement;
  if (picture?.tagName === 'PICTURE') {
    for (const source of picture.children) {
      if (source.tagName === 'SOURCE') collect(source);
    }
  }
  return urls;
}

function matchAsset(
  img: HTMLImageElement,
  index: Map<string, EditorAsset>,
  keys: Map<string, string | null>,
): EditorAsset | undefined {
  for (const url of urlsOf(img)) {
    let key = keys.get(url);
    if (key === undefined) {
      key = assetKey(url);
      keys.set(url, key);
    }
    const asset = key ? index.get(key) : undefined;
    if (asset) return asset;
  }
  return undefined;
}

function setIfChanged(el: Element, name: string, value: string | null): void {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
}

export function untagAssetImage(img: Element): void {
  for (const name of TAG_ATTRIBUTES) img.removeAttribute(name);
}

/**
 * Tags every `<img>` showing an asset of the open item with the attributes
 * the stega pass writes for text, so it outlines and selects like any other
 * field. Images the page tagged itself (`previewAttrs`) are left alone, and
 * images tagged earlier that no longer match are untagged.
 *
 * Writes an attribute only when its value changes: the tags are observed, so
 * a rewrite with the same value would trigger another pass.
 */
export function tagAssetImages(
  index: Map<string, EditorAsset>,
  itemId: string | null,
  keys: Map<string, string | null>,
): void {
  for (const img of document.getElementsByTagName('img')) {
    const ours = img.hasAttribute(ASSET_ATTR);
    if (!ours && img.hasAttribute('data-prepr-encoded')) continue;
    const asset = index.size ? matchAsset(img, index, keys) : undefined;
    if (!asset) {
      if (ours) untagAssetImage(img);
      continue;
    }
    setIfChanged(img, 'data-prepr-encoded', '');
    setIfChanged(img, ASSET_ATTR, '');
    setIfChanged(img, 'data-prepr-id', itemId);
    setIfChanged(img, 'data-prepr-field', asset.field);
    setIfChanged(img, 'data-prepr-entry-id', asset.entryId ?? null);
  }
}

export function untagAssetImages(): void {
  document.querySelectorAll(`img[${ASSET_ATTR}]`).forEach(untagAssetImage);
}
