import type { ImageLoaderProps } from 'next/image';

/**
 * Custom Next.js image loader for Prepr CMS assets. Prepr's stream CDN resizes
 * at the edge, keyed off comma-separated `{option}_{value}` pairs in a path
 * segment:
 *
 *   https://acme.b-cdn.net/w_2400,h_1600/b7ijwafd586-photo.jpg
 *   https://acme.b-cdn.net/w_800,h_600,fx_75,fy_67/b7ijwafd586-photo.jpg
 *
 * The API emits the asset's real dimensions, so the URL renders as-is; this
 * loader rewrites them to the width `next/image` asks for. Height is scaled
 * alongside width, holding the emitted ratio — which for a cropped asset is the
 * authored crop box, so the crop survives the resize. Order within the segment
 * doesn't matter, and unrecognised options are carried through untouched.
 *
 * `fx`/`fy` are focal-point percentages, so they hold at any size and ride
 * through unchanged. Quality is not a supported CDN option.
 *
 * Consumers can't point `loaderFile` at this package directly — Next joins the
 * path against the app root and `existsSync`-checks it, so a bare specifier
 * fails. They need a one-line wrapper file in the app root:
 *
 *   export { default } from '@preprio/toolkit/nextjs/image-loader';
 *
 * plus `images: { loader: 'custom', loaderFile: './prepr-image-loader.ts' }`.
 */

/**
 * A slash-delimited segment containing a `w_` option. Both slashes are required
 * so the filename — always the last segment — can never match: an asset called
 * `w_960-banner.jpg` is a name, not a transform.
 */
const TRANSFORM_SEGMENT = /\/([^/]*\bw_\d+[^/]*)\//;

const isPositiveInteger = (value: string) => /^\d+$/.test(value);

/**
 * Rewrites Prepr stream URLs to the width `next/image` asks for. URLs with no
 * transform segment (other hosts, relative paths) come back unchanged — set
 * `unoptimized` on those `<Image>`s.
 *
 * No upper clamp: the emitted width is the asset's own size or its crop box,
 * neither of which is a ceiling on what the CDN can serve, so capping there
 * would rule out retina.
 */
export default function preprImageLoader({ src, width }: ImageLoaderProps): string {
  return src.replace(TRANSFORM_SEGMENT, (match, segment: string) => {
    const options = segment.split(',').map((pair) => {
      const underscore = pair.indexOf('_');
      return [pair.slice(0, underscore), pair.slice(underscore + 1)] as [string, string];
    });

    const emittedWidth = options.find(([key]) => key === 'w');
    if (!emittedWidth || !isPositiveInteger(emittedWidth[1])) return match;

    const emittedHeight = options.find(([key]) => key === 'h');
    if (emittedHeight && isPositiveInteger(emittedHeight[1])) {
      emittedHeight[1] = String(
        Math.round((width * Number(emittedHeight[1])) / Number(emittedWidth[1])),
      );
    }
    emittedWidth[1] = String(width);

    return `/${options.map(([key, value]) => `${key}_${value}`).join(',')}/`;
  });
}
