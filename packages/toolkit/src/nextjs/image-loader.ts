import type { ImageLoaderProps } from 'next/image';

/**
 * Custom Next.js image loader for Prepr CMS assets. Prepr's stream CDN resizes
 * at the edge, keyed off comma-separated `{option}_{value}` pairs in a path
 * segment:
 *
 *   https://acme.stream.prepr.io/w_200/image.jpg
 *   https://acme.stream.prepr.io/1pvvjg1/ex_0,ey_0,ew_3888,w_3888/image.jpg
 *
 * Going through this loader means `next/image` requests the exact width it
 * needs, rather than pulling the full-resolution original and re-encoding it
 * server-side via /_next/image.
 *
 * Consumers can't point `loaderFile` at this package directly — Next joins the
 * path against the app root and `existsSync`-checks it, so a bare specifier
 * fails. They need a one-line wrapper file in the app root:
 *
 *   export { default } from '@preprio/toolkit/nextjs/image-loader';
 *
 * plus `images: { loader: 'custom', loaderFile: './prepr-image-loader.ts' }`.
 */

/** `*.stream.prepr.io` (Prepr) and `*.b-cdn.net` (Bunny, the CDN behind it). */
const TRANSFORMABLE_HOST_SUFFIXES = ['.stream.prepr.io', '.b-cdn.net'];

// Only `w` gets rewritten; the rest are recognised so crop/quality presets
// survive a resize instead of being mistaken for a filename.
const KNOWN_OPTION_KEYS = new Set([
  'w', // width
  'h', // height
  'q', // quality
  'c', // crop position (north, centre, ...)
  'ex', // crop extract: x offset
  'ey', // crop extract: y offset
  'ew', // crop extract: width
  'eh', // crop extract: height
]);

type ParsedPreprUrl = {
  /** Everything up to and including the trailing slash before the transform/filename. */
  prefix: string;
  /** Parsed transform pairs, in original order. Empty when there is no transform segment. */
  transform: Array<[string, string]>;
  /** The final path segment (the image filename), plus any query string. */
  filename: string;
};

/**
 * Every entry must be `{key}_{value}` and at least one key must be known.
 * That's what keeps an asset id (`1pvvjg1vm`, no underscore) or a filename
 * (`my_image.jpg`, unknown key) from being read as a transform.
 */
function isTransformSegment(segment: string): boolean {
  if (!segment) return false;
  const parts = segment.split(',');
  let sawKnownOption = false;

  for (const part of parts) {
    const underscore = part.indexOf('_');
    if (underscore <= 0) return false; // no key, or leading underscore
    const key = part.slice(0, underscore);
    const value = part.slice(underscore + 1);
    if (!value) return false;
    if (KNOWN_OPTION_KEYS.has(key)) {
      sawKnownOption = true;
    }
  }

  return sawKnownOption;
}

function parseTransform(segment: string): Array<[string, string]> {
  return segment.split(',').map((part) => {
    const underscore = part.indexOf('_');
    return [part.slice(0, underscore), part.slice(underscore + 1)] as [string, string];
  });
}

/**
 * Splits a Prepr stream URL into prefix, transform pairs and filename; null if
 * it isn't one. Shapes the API hands back:
 *
 *   //image.jpg            no transform segment
 *   /w_200,h_150/x.jpg     one or more options
 *   /{id}/w_200/x.jpg      asset id then transform
 */
function parsePreprUrl(rawUrl: string): ParsedPreprUrl | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const isTransformableHost = TRANSFORMABLE_HOST_SUFFIXES.some((suffix) =>
    url.hostname.endsWith(suffix),
  );
  if (!isTransformableHost) return null;

  const rawSegments = url.pathname.split('/');
  rawSegments.shift(); // leading "" from the leading slash

  if (rawSegments.length === 0) return null;

  const filename = rawSegments[rawSegments.length - 1];
  const leading = rawSegments.slice(0, -1);

  // At most one leading segment is a transform; the rest are asset ids and get
  // carried through untouched.
  let transform: Array<[string, string]> = [];
  const prefixSegments: string[] = [];

  for (const segment of leading) {
    if (transform.length === 0 && isTransformSegment(segment)) {
      transform = parseTransform(segment);
    } else if (segment === '') {
      // The empty slot in `//image.jpg` is the absent transform slot — drop it
      // so the width we insert lands there instead of leaving a double slash.
      continue;
    } else {
      prefixSegments.push(segment);
    }
  }

  // Keep the trailing slash even with no leading segments, so the filename
  // attaches directly to the origin.
  const prefix =
    url.origin + '/' + (prefixSegments.length > 0 ? prefixSegments.join('/') + '/' : '');

  return { prefix, transform, filename: filename + url.search };
}

function buildTransformSegment(pairs: Array<[string, string]>): string {
  return pairs.map(([key, value]) => `${key}_${value}`).join(',');
}

/**
 * Rewrites Prepr stream URLs to the width `next/image` asks for, preserving any
 * crop/preset options already on the URL. Non-Prepr URLs (other hosts, relative
 * paths) come back unchanged — set `unoptimized` on those `<Image>`s.
 */
export default function preprImageLoader({ src, width, quality }: ImageLoaderProps): string {
  const parsed = parsePreprUrl(src);

  if (!parsed) return src;

  const { prefix, transform, filename } = parsed;

  // Prepr keeps aspect ratio when only width is set, so a leftover height would
  // distort the image at the new width. Crop-extract presets are the exception:
  // there width and height work together and must both stay.
  const hasCropExtract = transform.some(([key]) => ['ex', 'ey', 'ew', 'eh'].includes(key));

  const next: Array<[string, string]> = [];
  let setWidth = false;

  for (const [key, value] of transform) {
    if (key === 'w') {
      next.push(['w', String(width)]);
      setWidth = true;
    } else if (key === 'h' && !hasCropExtract) {
      continue;
    } else if (key === 'q') {
      continue; // re-added below from the quality arg
    } else {
      next.push([key, value]);
    }
  }

  if (!setWidth) next.push(['w', String(width)]);
  if (quality) next.push(['q', String(quality)]);

  return `${prefix}${buildTransformSegment(next)}/${filename}`;
}
